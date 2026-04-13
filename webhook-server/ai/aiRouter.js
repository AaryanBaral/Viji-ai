// aiRouter.js
// Routes messages to correct AI model (Claude or Ollama)
// Fast path: simple product queries → vector search only (~300ms, no LLM)

const axios = require('axios');
const { CUSTOMER_CARE_PHONE, supabase } = require('../shared');
const { handleConversation, handleConversationStream } = require('./handleConversation');
const { classifyMessage, isSimpleProductQuery, stripPrefix, aiStats } = require('./classifier');
const { getEmbedding } = require('../db/embeddingService');
const { getAvailabilityStatus } = require('../services/productService');
const { CONFIG } = require('./llmGateway');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_TIMEOUT = 8000;

const OLLAMA_SYSTEM_PROMPT = `You are ViJJI, a friendly assistant for Satkam Vehicle Parts in Nepal. Keep responses short and helpful. If the customer asks about specific products, prices, orders, or workshops, tell them you can help and ask them to describe what they need. Contact: ${CUSTOMER_CARE_PHONE}.`;
const OLLAMA_MULTILINGUAL_PROMPT = `You are ViJJI, a friendly assistant for Satkam Vehicle Parts in Nepal. Keep responses short and helpful. Respond in the same language the customer uses (Hindi, Nepali, or English). If the customer asks about specific products, prices, orders, or workshops, tell them you can help and ask them to describe what they need. Contact: ${CUSTOMER_CARE_PHONE}.`;

async function callOllama(message, model, session) {
  const systemPrompt = model === 'qwen2.5:3b' ? OLLAMA_MULTILINGUAL_PROMPT : OLLAMA_SYSTEM_PROMPT;
  const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
    model,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
    stream: false
  }, { timeout: OLLAMA_TIMEOUT });

  const text = response.data?.message?.content;
  if (!text || text.trim().length === 0) throw new Error('Empty response from Ollama');
  return text.trim();
}

// ─────────────────────────────────────────────────────────────
// FAST PATH: vector search → format results without any LLM
// Returns { response, updatedContext, model } or null (fall through)
// ─────────────────────────────────────────────────────────────
async function fastProductSearch(query, session) {
  const start = Date.now();
  try {
    // Strip conversational prefix for cleaner vector + keyword search
    const cleanQuery = stripPrefix(query);
    console.log(`[fast-search] query="${query}" → clean="${cleanQuery}"`);

    // Run embedding + keyword fallback in parallel
    const embeddingPromise = getEmbedding(cleanQuery);

    // Parse query into parts for keyword fallback
    const words = cleanQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    // For multi-word queries, run phrase search AND word-OR search in parallel
    // Phrase search finds "WATER PUMP" products; word-OR search catches single-word queries
    const hasMultipleWords = words.length > 1;
    const phrasePromise = hasMultipleWords
      ? supabase.from('products').select('*').eq('is_active', true)
          .ilike('name', `%${cleanQuery}%`)
          .limit(10)
      : Promise.resolve({ data: [], error: null });
    const keywordPromise = supabase
      .from('products').select('*').eq('is_active', true)
      .or(words.map(w => `name.ilike.%${w}%`).join(','))
      .limit(20);

    const [queryEmbedding, phraseRes, keywordRes] = await Promise.all([embeddingPromise, phrasePromise, keywordPromise]);

    const { data: vectorData, error: vectorError } = await supabase.rpc('match_products_nim', {
      query_embedding: queryEmbedding,
      match_threshold: 0.2,
      match_count: 5
    });

    // ── Smart merge: phrase matches > exact name matches > vector similarity ──
    // Vector search for "water pump" can return fuel/oil pumps (semantically close).
    // Phrase search finds products with "WATER PUMP" literally in the name.
    // Word-OR search finds products matching any word, then filters for ALL words.
    const queryLower = cleanQuery.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const vecResults = (!vectorError && vectorData && vectorData.length > 0) ? vectorData : [];
    const phraseResults = (phraseRes.data && phraseRes.data.length > 0) ? phraseRes.data : [];
    const kwResults = (keywordRes.data && keywordRes.data.length > 0) ? keywordRes.data : [];

    // Check if any keyword results contain ALL query words in their name
    const exactMatches = kwResults.filter(p => {
      const nameLower = (p.name || '').toLowerCase();
      return queryWords.every(w => nameLower.includes(w));
    });

    let data;
    if (phraseResults.length > 0) {
      // Phrase search found exact matches (e.g. "WATER PUMP" in name) — best quality
      const phraseIds = new Set(phraseResults.map(p => p.id));
      const extraExact = exactMatches.filter(p => !phraseIds.has(p.id));
      const usedIds = new Set([...phraseIds, ...extraExact.map(p => p.id)]);
      const extraVec = vecResults.filter(p => !usedIds.has(p.id));
      data = [...phraseResults, ...extraExact, ...extraVec].slice(0, 10);
      console.log(`[fast-search] phrase match: ${phraseResults.length} (+ ${extraExact.length} exact + ${extraVec.length} vector fill)`);
    } else if (exactMatches.length > 0) {
      // Word-OR found products with ALL query words in name
      const exactIds = new Set(exactMatches.map(p => p.id));
      const extraVec = vecResults.filter(p => !exactIds.has(p.id));
      data = [...exactMatches, ...extraVec].slice(0, 10);
      console.log(`[fast-search] exact-name match: ${exactMatches.length} (+ ${extraVec.length} vector fill)`);
    } else if (vecResults.length > 0) {
      data = vecResults;
    } else if (kwResults.length > 0) {
      data = kwResults;
    } else {
      data = null;
    }

    if (!data || data.length === 0) {
      console.log('[fast-search] No results from vector or keyword, falling through');
      return null;
    }

    let results = [...data];

    // Workshop segment filter — same logic as searchProducts()
    if (session.isWorkshop && session.workshopSegment) {
      results = results.filter(p =>
        p.segment === session.workshopSegment || p.segment === 'MUV/PC'
      );
    }

    if (results.length === 0) {
      console.log('[fast-search] No results after filter, falling through');
      return null;
    }

    // Determine pricing region from phone number
    const phone = session.customer?.phone || session.phoneNumber || '';
    const isNepal = phone.startsWith('+977') || phone.startsWith('977');
    const isIndia = phone.startsWith('+91') || phone.startsWith('91');

    // Sort: prioritize Fast-moving (F) products
    results.sort((a, b) => {
      if (a.movement_class === 'F' && b.movement_class !== 'F') return -1;
      if (a.movement_class !== 'F' && b.movement_class === 'F') return 1;
      return 0;
    });

    const lines = results.slice(0, 3).map((p, i) => {
      const availability = getAvailabilityStatus(p.stock_quantity);
      const availText = availability === 'Out of Stock'
        ? 'Not in stock — we can check from the market and get back to you'
        : availability;

      let price;
      if (isNepal) {
        const npr = p.mrp_npr || (p.mrp_inr ? Math.round(p.mrp_inr * 1.6) : null);
        price = npr ? `NPR ${Number(npr).toLocaleString()} (VAT inclusive)` : 'Price on request';
      } else {
        price = p.mrp_inr ? `₹${Number(p.mrp_inr).toLocaleString()} (VAT inclusive)` : 'Price on request';
      }

      const parts = [
        `${i + 1}. *${p.name}*${p.brand ? ` — ${p.brand}` : ''}`,
        `   Code: ${p.product_code}${p.oem_number ? ` | OEM: ${p.oem_number}` : ''}`,
        `   Price: ${price}`,
        `   ${availText}`
      ];
      if (p.vehicle_model) parts.splice(1, 0, `   Vehicle: ${p.vehicle_model}`);
      return parts.join('\n');
    });

    const displayed = Math.min(results.length, 3);
    const response =
      `Found ${displayed} product(s) for "${cleanQuery}":\n\n` +
      lines.join('\n\n') +
      '\n\nReply with a product code to order, or ask me anything!';

    console.log('[fast-search] Hit:', results.length, 'products in', (Date.now() - start) + 'ms');
    return { response, updatedContext: session.context, model: 'fast-search' };

  } catch (err) {
    console.log('[fast-search] Error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// GUARDRAIL: Detect prompt injection or clearly off-topic messages
// Returns a rejection string if blocked, or null to allow through.
// ─────────────────────────────────────────────────────────────
function checkGuardrail(messageText) {
  // Normalize unicode to defeat homoglyph/combining-character bypass attempts
  // e.g. "\u0069gnore" (unicode "i") → normalizes to plain "ignore"
  const normalized = messageText.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const msg = normalized.toLowerCase().trim();

  // Prompt injection patterns
  const injectionPatterns = [
    /ignore\s+(all\s+)?(your\s+)?(previous|prior|above|system)\s+(instructions?|prompts?|rules?)/i,
    /forget\s+(everything|all|your\s+instructions?)/i,
    /you\s+are\s+now\s+a\s+(general|different|new|other)/i,
    /act\s+as\s+(a\s+)?(general|different|unrestricted|another|other|new)/i,
    /your\s+new\s+(instructions?|rules?|role|identity|system\s+prompt)\s+(are|is)/i,
    /pretend\s+(you\s+are|to\s+be)\s+(a\s+)?(general|different|unrestricted|another)/i,
    /\b(dan\s+mode|developer\s+mode|jailbreak|do\s+anything\s+now|unrestricted\s+mode)\b/i,
    /override\s+(your\s+)?(instructions?|system|rules?|restrictions?)/i,
    /disregard\s+(your\s+)?(previous|prior|above|all)\s+(instructions?|rules?)/i,
    /system\s*prompt\s*[:=]/i,
    /new\s+persona/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(normalized)) {
      console.log('[guardrail] Prompt injection attempt blocked:', messageText.substring(0, 80));
      return "I'm ViJJI, your vehicle parts assistant. I can help you with spare parts, orders, and workshops.";
    }
  }

  // ── RELEVANCE CHECK ───────────────────────────────────────
  // If the message contains no vehicle/parts/order context AND looks like
  // a general query (question words, math, etc.), block it immediately.
  // Short greetings (hi, hello, namaste, ok, yes, no, confirm, help) are
  // always allowed through regardless.

  const ALWAYS_ALLOW = /^(hi|hello|namaste|hey|ok|okay|yes|no|confirm|order|help|cancel|start|menu|namskar|namaskar|हेलो|नमस्ते|हाँ|हैं|ठीक|theek|shukriya|dhanyabad|bye|goodbye|thanks|thank\s*you)\b/i;

  const VEHICLE_KEYWORDS = /\b(part|parts|spare|filter|brake|clutch|engine|oil|pump|bearing|belt|gasket|valve|sensor|shock|absorber|battery|tyre|tire|wheel|axle|gear|transmission|alternator|radiator|piston|ring|seal|bush|pin|rod|cam|shaft|pad|disc|rotor|drum|hose|pipe|wire|relay|fuse|switch|lamp|light|horn|mirror|wiper|seat|door|lock|key|handle|bumper|bonnet|hood|boot|trunk|glass|windshield|carpet|mat|vehicle|car|truck|jeep|bolero|scorpio|xuv|thar|ertiga|swift|alto|maruti|mahindra|tata|hyundai|toyota|honda|ford|suzuki|bajaj|tvs|hero|motorcycle|bike|auto|workshop|garage|mechanic|order|cart|price|stock|delivery|oem|product|code|brand|bosch|denso|ngk|lucas|skf|minda|wago|search|buy|add|confirm|place|check|status|history|invoice)\b/i;

  // Product-request prefixes ("do you have", "can I get") are NOT general queries
  const GENERAL_QUERY_PATTERN = /^(what\s+is|what's|who\s+is|who's|how\s+(much|many|do|does|to|is)|where\s+is|when\s+is|why\s+is|calculate|tell\s+me|explain|define|list\s+of|can\s+you\s+tell|do\s+you\s+know|[\d\s+\-*/^()=]+[+\-*/]=?\s*\??\s*$)/i;
  const PRODUCT_REQUEST_PREFIX = /^(do you have|have you got|do you sell|do you stock|can i get|can i have|can i buy|can you show|can you find|show me|give me|get me|find me|i want|i need|looking for)/i;

  if (!ALWAYS_ALLOW.test(msg) && !PRODUCT_REQUEST_PREFIX.test(msg) && GENERAL_QUERY_PATTERN.test(msg) && !VEHICLE_KEYWORDS.test(msg)) {
    console.log('[guardrail] Off-topic message blocked:', msg.substring(0, 80));
    return `I'm ViJJI, your vehicle parts assistant. I can only help with spare parts, orders, and workshop searches. For anything else, please contact us at ${require('../shared').CUSTOMER_CARE_PHONE}.`;
  }

  return null; // Allow through
}

// ─────────────────────────────────────────────────────────────
// FAST GREETING: template response without LLM call (~0ms)
// ─────────────────────────────────────────────────────────────
const GREETING_RE = /^(hi|hello|hey|namaste|namaskar|namskar|good\s*(morning|afternoon|evening|night)|हेलो|नमस्ते|ram\s*ram|jai\s*shree\s*ram)\s*[.!?]*$/i;
const FAREWELL_RE = /^(bye|goodbye|thanks|thank\s*you|thankyou|dhanyabad|dhanyavaad|shukriya|ok|okay)\s*[.!?]*$/i;
const SIMPLE_QA_RE = /^(who\s+are\s+you|what\s+do\s+you\s+do|what\s*(?:'s|is)\s+your\s+name|your\s+name|help|how\s+can\s+you\s+help)\s*[.!?]*$/i;

function fastGreeting(messageText, session) {
  const text = messageText.trim();
  const name = session.customer?.name?.split(/\s/)[0] || '';
  const greeting = name ? `Hello ${name}!` : 'Hello!';

  if (GREETING_RE.test(text)) {
    return { response: `${greeting} I'm ViJJI, your vehicle parts assistant. How can I help you today?`, updatedContext: session.context, model: 'fast-greeting' };
  }
  if (FAREWELL_RE.test(text)) {
    const farewell = /^(thanks|thank|dhanyabad|dhanyavaad|shukriya)/i.test(text)
      ? `You're welcome${name ? ', ' + name : ''}! Feel free to reach out anytime.`
      : `Goodbye${name ? ', ' + name : ''}! Feel free to come back anytime you need vehicle parts.`;
    return { response: farewell, updatedContext: session.context, model: 'fast-greeting' };
  }
  if (SIMPLE_QA_RE.test(text)) {
    return { response: `I'm ViJJI, your vehicle parts assistant! I can help you search for spare parts, place orders, check order status, and find workshops. What would you like to do?`, updatedContext: session.context, model: 'fast-greeting' };
  }
  return null;
}

async function routeMessage(messageText, session, conversationHistory, { stream, onChunk } = {}) {
  const start = Date.now();
  const OLLAMA_ENABLED = process.env.OLLAMA_URL && process.env.OLLAMA_URL.length > 5 && process.env.OLLAMA_URL.startsWith('http');

  // ── GUARDRAIL CHECK ───────────────────────────────────────
  const blocked = checkGuardrail(messageText);
  if (blocked) {
    return { response: blocked, updatedContext: session.context, model: 'guardrail' };
  }

  // ── FAST GREETING: template response, no LLM needed ───────
  if (!session.context?.cart?.length) {
    const greetResult = fastGreeting(messageText, session);
    if (greetResult) {
      console.log(`[fast-greeting] ${Date.now() - start}ms`);
      return greetResult;
    }
  }

  // ── FAST PATH: simple product queries → vector search only ─
  if (isSimpleProductQuery(messageText) && !session.context?.cart?.length) {
    const fastResult = await fastProductSearch(messageText, session);
    if (fastResult) {
      const ms = Date.now() - start;
      console.log(`[fast-path] ${ms}ms`);
      aiStats.fast_search++;
      return fastResult;
    }
  }

  // ── NORMAL PATH ───────────────────────────────────────────
  const classification = classifyMessage(messageText, session);
  console.log(`🔀 AI Router: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}" → ${classification.route}/${classification.model} (${classification.reason})`);

  const llmModel = CONFIG.models[CONFIG.provider] || CONFIG.provider;

  // WhatsApp messages use non-streaming path (no onChunk) — use shorter max_tokens
  // for faster LLM generation. Web/app streaming uses full 1024.
  const isWhatsApp = !(stream && onChunk);
  const llmMaxTokens = isWhatsApp ? 512 : undefined;

  if (classification.route === 'claude') {
    aiStats.claude++;
    const handler = (stream && onChunk)
      ? handleConversationStream(messageText, session, conversationHistory, onChunk)
      : handleConversation(messageText, session, conversationHistory, { maxTokens: llmMaxTokens });
    const result = await handler;
    console.log('[router] LLM response in', (Date.now() - start) + 'ms');
    return { ...result, model: llmModel };
  }

  if (!OLLAMA_ENABLED) {
    console.log('[router] Ollama disabled — routing to LLM directly');
    aiStats.claude++;
    const handler = (stream && onChunk)
      ? handleConversationStream(messageText, session, conversationHistory, onChunk)
      : handleConversation(messageText, session, conversationHistory, { maxTokens: llmMaxTokens });
    const result = await handler;
    console.log('[router] LLM response in (ollama disabled)', (Date.now() - start) + 'ms');
    return { ...result, model: llmModel };
  }

  try {
    const ollamaResponse = await callOllama(messageText, classification.model, session);
    console.log(`✅ Ollama (${classification.model}) responded`);
    console.log('[router] Ollama response in', (Date.now() - start) + 'ms');
    if (classification.model === 'qwen2.5:3b') aiStats.ollama_nepali++;
    else aiStats.ollama_english++;
    return { response: ollamaResponse, updatedContext: session.context, model: classification.model };
  } catch (error) {
    console.warn('[aiRouter] Ollama failed, falling back to Claude:', error.message);
    aiStats.fallbacks++;
    aiStats.claude++;
    const result = await handleConversation(messageText, session, conversationHistory, { maxTokens: llmMaxTokens });
    console.log('[router] Claude response in (ollama fallback)', (Date.now() - start) + 'ms');
    return result;
  }
}

module.exports = { routeMessage, callOllama, fastProductSearch };
