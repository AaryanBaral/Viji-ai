// conversationManager.js
// Purpose: Track customer conversations and remember context (FIXED FOR ACTUAL SCHEMA)

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ==========================================
// PHONE NUMBER NORMALIZATION
// ==========================================

/**
 * Normalize phone number to consistent 10-digit local form for Nepal numbers,
 * or E.164 format for other countries. Handles all formats found in DB audit.
 *
 * Nepal:
 *   "+9779851069717" → "9851069717"
 *   "9779851069717"  → "9851069717"
 *   "9851069717"     → "9851069717"
 *
 * India:
 *   "+918058797426"  → "+918058797426" (kept as-is, E.164)
 *   "918058797426"   → "+918058797426" (add +)
 *
 * Landlines / unknown:
 *   "14244254"       → "14244254" (short, leave as-is)
 */
function normalizePhone(phone) {
  if (!phone) return '';
  // Strip spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  const digits = cleaned.replace(/\D/g, '');

  // Already E.164 with +
  if (cleaned.startsWith('+')) {
    // Nepal +977
    if (cleaned.startsWith('+977') && digits.length === 13) return digits.slice(3);
    // India +91
    if (cleaned.startsWith('+91') && digits.length === 12) return '+91' + digits.slice(2);
    return cleaned; // other country, return as-is
  }

  // 00 international prefix
  if (digits.startsWith('00')) {
    const withoutPrefix = digits.slice(2);
    if (withoutPrefix.startsWith('977') && withoutPrefix.length === 13) return withoutPrefix.slice(3);
    return '+' + withoutPrefix;
  }

  // Nepal 977 prefix (13 digits total)
  if (digits.startsWith('977') && digits.length === 13) return digits.slice(3);

  // Nepal 10-digit mobile (starts with 97/98/96)
  if (digits.length === 10 && /^(97|98|96)/.test(digits)) return digits;

  // India 91 prefix (12 digits total)
  if (digits.startsWith('91') && digits.length === 12) return '+91' + digits.slice(2);

  // India 10-digit mobile (starts with 7/8/9, not Nepal range)
  if (digits.length === 10 && /^[7-9]/.test(digits) && !/^(97|98|96)/.test(digits)) {
    return '+91' + digits;
  }

  // Short numbers / landlines - return as-is
  return digits;
}

/**
 * Find a workshop record by phone from the workshop_customers view.
 * Checks both workshop_phone and mechanic_phone columns.
 * Returns the workshop_customers row or null.
 */
async function findWorkshopByPhone(normalizedPhone) {
  if (!normalizedPhone) return null;

  // Build format variants to match whatever is stored in the workshops table
  const digits = normalizedPhone.replace(/\D/g, '');
  const variants = [...new Set([
    normalizedPhone,          // e.g. "9851069717" (10-digit Nepal) or "+918058797426"
    digits,                   // bare digits
    '+977' + digits.slice(-10), // +977XXXXXXXXXX
    '977' + digits.slice(-10),  // 977XXXXXXXXXX
  ])].filter(Boolean);

  const orClause = variants.flatMap(v => [
    `workshop_phone.eq.${v}`,
    `mechanic_phone.eq.${v}`
  ]).join(',');

  try {
    const { data, error } = await supabase
      .from('workshop_customers')
      .select('*')
      .or(orClause)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Workshop lookup error:', error.message);
      return null;
    }
    if (data) {
      console.log(`🏭 Matched workshop: ${data.workshop_name} (segment: ${data.workshop_segment})`);
    }
    return data || null;
  } catch (err) {
    console.error('❌ findWorkshopByPhone error:', err.message);
    return null;
  }
}

/**
 * Find a customer by phone, trying multiple format variations.
 * Returns { customer, error } matching Supabase's shape.
 */
async function findCustomerByPhone(phoneNumber) {
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) return { customer: null };

  const digits = normalized.replace(/\D/g, '');

  // Build all plausible formats for this number
  const variants = [...new Set([
    phoneNumber,              // raw input (e.g. "9779851069717" from WhatsApp)
    normalized,               // stripped digits (e.g. "9851069717")
    '977' + digits.slice(-10),  // with country code
    '+977' + digits.slice(-10), // with +country code
  ])].filter(Boolean);

  console.log(`🔍 Customer lookup variants: ${JSON.stringify(variants)}`);

  const _tStart = Date.now();

  // Query phone AND whatsapp_number in parallel, plus suffix fallback
  const suffix = digits.length >= 10 ? '%' + digits.slice(-10) : null;
  const [byPhone, byWhatsApp, bySuffix] = await Promise.all([
    supabase.from('customers').select('*').in('phone', variants).eq('is_active', true).limit(1).single(),
    supabase.from('customers').select('*').in('whatsapp_number', variants).eq('is_active', true).limit(1).single(),
    suffix
      ? supabase.from('customers').select('*').like('phone', suffix).eq('is_active', true).limit(1).single()
      : Promise.resolve({ data: null, error: null })
  ]);

  console.log(`[PERF] customer-lookup: ${Date.now() - _tStart}ms`);

  // Check phone match first, then whatsapp_number, then suffix
  const match = (!byPhone.error && byPhone.data) ? byPhone.data
    : (!byWhatsApp.error && byWhatsApp.data) ? byWhatsApp.data
    : (bySuffix.data) ? bySuffix.data
    : null;

  // Throw on unexpected errors (not PGRST116 "no rows")
  for (const res of [byPhone, byWhatsApp, bySuffix]) {
    if (res.error && res.error.code !== 'PGRST116') throw res.error;
  }

  if (match) {
    const method = (!byPhone.error && byPhone.data) ? 'phone'
      : (!byWhatsApp.error && byWhatsApp.data) ? 'whatsapp_number' : 'suffix';
    console.log(`✅ Matched customer (${method}): ${match.name} (DB phone: ${match.phone})`);
  } else {
    console.log(`⚠️ No customer found for phone: ${phoneNumber}`);
  }

  return { customer: match };
}

// ==========================================
// IN-MEMORY SESSION CACHE (avoids DB round-trip on repeat messages)
// ==========================================
const sessionCache = new Map();
const SESSION_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

function sessionCacheGet(phone) {
  const normalized = normalizePhone(phone);
  const entry = sessionCache.get(normalized);
  if (!entry) return null;
  if (Date.now() - entry.ts > SESSION_CACHE_TTL) {
    sessionCache.delete(normalized);
    return null;
  }
  return entry.value;
}

function sessionCacheSet(phone, session) {
  const normalized = normalizePhone(phone);
  sessionCache.set(normalized, { value: session, ts: Date.now() });
  // Evict if cache grows too large
  if (sessionCache.size > 500) {
    const oldest = sessionCache.keys().next().value;
    sessionCache.delete(oldest);
  }
}

// ==========================================
// CONVERSATION STATE MANAGEMENT
// ==========================================

/**
 * Get existing session or create new one
 * @param {string} phoneNumber - Customer's WhatsApp number
 * @returns {Object} Session data with customer info
 */
async function getOrCreateSession(phoneNumber) {
  try {
    const normalized = normalizePhone(phoneNumber);
    console.log(`📞 Getting session for: ${phoneNumber} (normalized: ${normalized})`);

    // Check in-memory session cache first
    const cached = sessionCacheGet(phoneNumber);
    if (cached) {
      console.log(`[session-cache] hit for ${normalized}`);
      // Refresh history from DB (lightweight single query)
      const { data: recentMessages } = await supabase
        .from('conversation_logs')
        .select('message_type, message_text, timestamp')
        .eq('session_id', cached.sessionId)
        .order('timestamp', { ascending: false })
        .limit(10);
      cached.conversationHistory = recentMessages ? recentMessages.reverse() : [];
      return cached;
    }

    // Steps 1, 1b, 2: Run customer lookup, workshop lookup, and session lookup in parallel
    const sessionVariants = [...new Set([phoneNumber, normalized])];
    const [customerRes, workshop, sessionRes] = await Promise.all([
      findCustomerByPhone(phoneNumber),
      findWorkshopByPhone(normalized),
      supabase
        .from('chatbot_sessions')
        .select('*')
        .in('phone_number', sessionVariants)
        .eq('is_active', true)
        .order('id', { ascending: false })
        .limit(1)
        .single()
    ]);

    const { customer } = customerRes;
    const { data: existingSession, error: sessionError } = sessionRes;

    if (sessionError && sessionError.code !== 'PGRST116') {
      throw sessionError;
    }

    // Step 3: Return existing or create new session
    if (existingSession) {
      console.log(`✅ Found existing session: ${existingSession.id}`);

      // Check if session is stale (more than 2 hours since last activity)
      const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
      if (existingSession.last_activity) {
        const lastActivity = new Date(existingSession.last_activity);
        const now = new Date();
        if (now - lastActivity > SESSION_TIMEOUT_MS) {
          console.log(`⏰ Session ${existingSession.id} stale (${Math.round((now - lastActivity) / 60000)}min). Resetting context.`);
          const freshContext = { cart: [] };
          existingSession.context = freshContext;
          // Fire-and-forget DB write — in-memory state is already correct
          supabase.from('chatbot_sessions').update({
            context: freshContext,
            last_activity: new Date().toISOString()
          }).eq('id', existingSession.id)
            .then(({ error }) => { if (error) console.warn('⚠️ Stale session reset DB write failed:', error.message); });
        }
      }

      // Load last 10 messages for context — returned as conversationHistory
      // so callers don't need a separate getConversationHistory() call.
      const { data: recentMessages } = await supabase
        .from('conversation_logs')
        .select('message_type, message_text, timestamp')
        .eq('session_id', existingSession.id)
        .order('timestamp', { ascending: false })
        .limit(10);
      const conversationHistory = recentMessages ? recentMessages.reverse() : [];
      console.log(`[history] source: cache (${conversationHistory.length} msgs)`);
      const sessionResult = {
        sessionId: existingSession.id,
        phoneNumber: phoneNumber,
        customer: customer,
        context: existingSession.context || {},
        conversationHistory,
        isNewCustomer: !customer,
        isWorkshop: !!workshop,
        workshopName: workshop?.workshop_name || null,
        workshopSegment: workshop?.workshop_segment || null,
        workshopGrade: workshop?.workshop_grade || null,
        workshopMonthlyServicing: workshop?.monthly_servicing || null
      };
      sessionCacheSet(phoneNumber, sessionResult);
      return sessionResult;
    }

    // Step 4: Create new session — store normalized phone for consistent matching
    const { data: newSession, error: createError } = await supabase
      .from('chatbot_sessions')
      .insert({
        phone_number: normalized,
        customer_id: customer?.id || null,
        conversation_state: 'greeting',
        language: 'en',
        context: {},
        is_active: true
      })
      .select()
      .single();

    if (createError) throw createError;

    console.log(`✨ Created new session: ${newSession.id}`);
    console.log('[history] source: fresh (new session, 0 msgs)');

    const newSessionResult = {
      sessionId: newSession.id,
      phoneNumber: phoneNumber,
      customer: customer,
      context: {},
      conversationHistory: [],
      isNewCustomer: !customer,
      isWorkshop: !!workshop,
      workshopName: workshop?.workshop_name || null,
      workshopSegment: workshop?.workshop_segment || null,
      workshopGrade: workshop?.workshop_grade || null,
      workshopMonthlyServicing: workshop?.monthly_servicing || null
    };
    sessionCacheSet(phoneNumber, newSessionResult);
    return newSessionResult;

  } catch (error) {
    console.error('❌ Error in getOrCreateSession:', error);
    throw error;
  }
}

/**
 * Save conversation context (what customer is doing)
 * @param {string} sessionId - Session UUID
 * @param {Object} context - Context data to save
 */
async function saveContext(sessionId, context) {
  try {
    console.log(`💾 Saving context for session: ${sessionId}`);

    const { error } = await supabase
      .from('chatbot_sessions')
      .update({
        context: context,
        last_activity: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error('❌ Error in saveContext:', error);
    throw error;
  }
}

/**
 * Log message to conversation history
 * @param {string} sessionId - Session UUID
 * @param {string} phoneNumber - Customer's phone
 * @param {string} customerId - Customer UUID (optional)
 * @param {string} messageType - 'user' or 'bot'
 * @param {string} message - Message content
 */
async function logMessage(sessionId, phoneNumber, customerId, messageType, message, inputType) {
  try {
    const insertData = {
      session_id: sessionId,
      phone_number: phoneNumber,
      customer_id: customerId || null,
      message_type: messageType,
      message_text: message,
      language: 'en'
    };
    if (inputType) insertData.message_data = { input_type: inputType };
    const { error } = await supabase
      .from('conversation_logs')
      .insert(insertData);

    if (error) throw error;

    console.log(`📝 Logged ${messageType} message`);
    return true;
  } catch (error) {
    console.error('❌ Error in logMessage:', error);
    // Don't throw - logging failure shouldn't stop the conversation
    return false;
  }
}

/**
 * Get recent conversation history
 * @param {string} sessionId - Session UUID
 * @param {number} limit - Number of messages to retrieve
 * @returns {Array} Recent messages
 */
async function getConversationHistory(sessionId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('conversation_logs')
      .select('message_type, message_text, timestamp')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Return in chronological order (oldest first)
    return data ? data.reverse() : [];
  } catch (error) {
    console.error('❌ Error in getConversationHistory:', error);
    return [];
  }
}

/**
 * End conversation session
 * @param {string} sessionId - Session UUID
 */
async function endSession(sessionId) {
  try {
    console.log(`👋 Ending session: ${sessionId}`);

    const { error } = await supabase
      .from('chatbot_sessions')
      .update({
        is_active: false,
        session_end: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) throw error;

    return true;
  } catch (error) {
    console.error('❌ Error in endSession:', error);
    throw error;
  }
}

// Export functions
module.exports = {
  getOrCreateSession,
  saveContext,
  logMessage,
  getConversationHistory,
  endSession,
  normalizePhone
};
