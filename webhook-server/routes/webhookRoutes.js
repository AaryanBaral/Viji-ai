// routes/webhookRoutes.js
// WhatsApp webhook routes extracted from index.js
//
// Exported as a factory function to receive shared deps (routeMessage,
// conversationManager, transcribeAudio) that are also used by other routes
// still in index.js, avoiding a circular-require.

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { supabase, CUSTOMER_CARE_PHONE } = require('../shared');
require('dotenv').config();

// ==========================================
// WHATSAPP WEBHOOK SIGNATURE VERIFICATION
// Meta sends X-Hub-Signature-256: sha256=<HMAC-SHA256(rawBody, appSecret)>
// ==========================================

function verifyMetaSignature(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // Secret not configured — log warning but allow through (degraded mode)
    console.warn('[webhook-sig] WHATSAPP_APP_SECRET not set — skipping signature check (insecure!)');
    return true;
  }
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) {
    console.warn('[webhook-sig] Missing X-Hub-Signature-256 header — rejecting request');
    return false;
  }
  const rawBody = req.rawBody;
  if (!rawBody) {
    console.warn('[webhook-sig] Raw body not available — rejecting request');
    return false;
  }
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ==========================================
// IN-MEMORY RATE LIMITER (per WhatsApp user)
// ==========================================

const userMessageTimestamps = new Map();
const RATE_LIMIT_WINDOW = 60000;  // 1 minute
const RATE_LIMIT_MAX = 10;        // max 10 messages per minute per user

function isRateLimited(phoneNumber) {
  const now = Date.now();
  const timestamps = userMessageTimestamps.get(phoneNumber) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  if (recent.length >= RATE_LIMIT_MAX) {
    return true;
  }
  recent.push(now);
  userMessageTimestamps.set(phoneNumber, recent);
  return false;
}

// Clean up old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [phone, timestamps] of userMessageTimestamps.entries()) {
    const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (recent.length === 0) userMessageTimestamps.delete(phone);
    else userMessageTimestamps.set(phone, recent);
  }
}, 300000);

// For Meta WhatsApp Cloud API: digits only, with country code, no + prefix
function normalizeForWA(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

// Haversine distance in km (rounded to 1 decimal)
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

const LEAD_GATE_REPLY = '🙏 Vijji.ai मा स्वागत छ! सेवा लिन कृपया पहिले https://chat.vijji.ai मा register गर्नुहोस् — ३० सेकेन्ड मात्र लाग्छ। वा हाम्रो टोलीले तपाईंलाई छिट्टै सम्पर्क गर्नेछ। 🙏 Welcome to Vijji.ai! Please register at https://chat.vijji.ai first (30 seconds), or our team will contact you shortly!';

module.exports = function createWebhookRoutes({ routeMessage, conversationManager, transcribeAudio, handleConversation }) {
  const router = express.Router();

  // ==========================================
  // LEAD GATE HELPERS
  // ==========================================

  // Insert a lead if no 'new' lead exists for this phone in the last 24 hours
  async function createLeadIfNew(phoneNumber, rawMessage) {
    const normalized = conversationManager.normalizePhone(phoneNumber);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', normalized)
      .eq('status', 'new')
      .gte('created_at', cutoff)
      .limit(1)
      .single();

    if (existing) {
      console.log(`📋 Lead already exists for ${normalized} within 24h — skipping duplicate`);
      return;
    }

    const { error } = await supabase.from('leads').insert({
      phone: normalized,
      raw_message: rawMessage ? rawMessage.substring(0, 500) : null,
      source: 'whatsapp',
      status: 'new'
    });
    if (error) console.error('❌ createLeadIfNew error:', error.message);
    else console.log(`📋 New lead created for ${normalized}`);
  }

  // ==========================================
  // SEND WHATSAPP MESSAGE
  // ==========================================

  async function sendWhatsAppMessage(to, text) {
    try {
      const toNumber = normalizeForWA(to);
      console.log(`📤 Sending WhatsApp to: ${toNumber} (input was: ${to})`);

      const response = await axios.post(
        `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: toNumber,
          type: 'text',
          text: { body: text }
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ WhatsApp message sent to ${toNumber}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
      throw error;
    }
  }

  // ==========================================
  // SEND WHATSAPP IMAGE MESSAGE
  // ==========================================

  async function sendWhatsAppImage(to, imageUrl, caption = '') {
    try {
      const toNumber = normalizeForWA(to);
      console.log(`📤 Sending WhatsApp image to: ${toNumber}`);
      await axios.post(
        `${process.env.WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: toNumber,
          type: 'image',
          image: { link: imageUrl, caption: caption || '' }
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ WhatsApp image sent to ${toNumber}`);
    } catch (error) {
      console.error('❌ Error sending WhatsApp image:', error.response?.data || error.message);
    }
  }

  // ==========================================
  // VOICE MESSAGE HANDLER (WhatsApp)
  // ==========================================

  async function handleVoiceMessage(phoneNumber, mediaId) {
    if (isRateLimited(phoneNumber)) {
      console.log(`Rate limited: ${phoneNumber}`);
      return;
    }
    const session = await conversationManager.getOrCreateSession(phoneNumber);
    if (session.isNewCustomer) {
      console.log(`🚫 Unregistered phone ${phoneNumber} (voice) — creating lead and sending gate reply`);
      Promise.all([
        createLeadIfNew(phoneNumber, '[Voice message]'),
        sendWhatsAppMessage(phoneNumber, LEAD_GATE_REPLY)
      ]).catch(err => console.error('❌ lead gate post-actions error:', err.message));
      return;
    }
    const tmpPath = `/tmp/voice_${Date.now()}.ogg`;
    try {
      // Step 1: Get media URL
      const mediaRes = await axios.get(
        `https://graph.facebook.com/v22.0/${mediaId}`,
        { headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_API_KEY } }
      );
      const mediaUrl = mediaRes.data.url;

      // Step 2: Download audio file
      const fileRes = await axios.get(mediaUrl, {
        headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_API_KEY },
        responseType: 'arraybuffer'
      });
      await require('fs').promises.writeFile(tmpPath, Buffer.from(fileRes.data));

      // Step 3: Transcribe
      let transcript = '';
      try {
        transcript = await transcribeAudio(tmpPath);
        console.log(`[voice] Transcribed: ${transcript}`);
      } catch (tErr) {
        console.warn('[voice] Transcription failed:', tErr.message);
      }

      // Step 4: Cleanup
      try { require('fs').unlinkSync(tmpPath); } catch(e) {}

      if (!transcript || transcript.trim().length === 0) {
        await sendWhatsAppMessage(phoneNumber, 'Sorry, I could not understand the voice message. Please type instead. 🙏');
        return;
      }

      // Step 5: Process as regular message (prefixed) — reuse session from above
      const history = session.conversationHistory;
      conversationManager.logMessage(session.sessionId, phoneNumber, session.customer?.id || null, 'user', transcript, 'voice');
      const result = await routeMessage(transcript, session, history);
      const reply = '🎤 ' + result.response;
      await sendWhatsAppMessage(phoneNumber, reply);
      conversationManager.saveContext(session.sessionId, result.updatedContext);
      conversationManager.logMessage(session.sessionId, phoneNumber, session.customer?.id || null, 'bot', reply);

    } catch (error) {
      console.error('❌ handleVoiceMessage error:', error.message);
      try { require('fs').unlinkSync(tmpPath); } catch(e) {}
      try { await sendWhatsAppMessage(phoneNumber, 'Sorry, I could not process the voice message. Please type instead. 🙏'); } catch(e) {}
    }
  }

  // ==========================================
  // IMAGE MESSAGE HANDLER (WhatsApp vision)
  // ==========================================

  async function handleImageMessage(phoneNumber, mediaId) {
    if (isRateLimited(phoneNumber)) {
      console.log(`Rate limited: ${phoneNumber}`);
      return;
    }
    const session = await conversationManager.getOrCreateSession(phoneNumber);
    if (session.isNewCustomer) {
      console.log(`🚫 Unregistered phone ${phoneNumber} (image) — creating lead and sending gate reply`);
      Promise.all([
        createLeadIfNew(phoneNumber, '[Image message]'),
        sendWhatsAppMessage(phoneNumber, LEAD_GATE_REPLY)
      ]).catch(err => console.error('❌ lead gate post-actions error:', err.message));
      return;
    }
    const tmpPath = `/tmp/wa_image_${Date.now()}.jpg`;
    try {
      // Step 1: Get media URL
      const mediaRes = await axios.get(
        `https://graph.facebook.com/v22.0/${mediaId}`,
        { headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_API_KEY } }
      );
      const mediaUrl = mediaRes.data.url;

      // Step 2: Download image
      const fileRes = await axios.get(mediaUrl, {
        headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_API_KEY },
        responseType: 'arraybuffer'
      });
      const imageBuffer = Buffer.from(fileRes.data);
      await require('fs').promises.writeFile(tmpPath, imageBuffer);
      const base64Image = imageBuffer.toString('base64');

      // Step 3: Build vision content for Claude
      const visionContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64Image }
        },
        {
          type: 'text',
          text: 'Customer sent this image. Identify the vehicle spare part shown. Then search our products database for this part and tell the customer what we have in stock with prices. If you cannot identify it, ask the customer to describe the part.'
        }
      ];

      // Step 4: Process with Claude directly (skip Ollama routing) — reuse session from above
      const history = session.conversationHistory;
      conversationManager.logMessage(session.sessionId, phoneNumber, session.customer?.id || null, 'user', '[Image message]', 'image');

      const result = await handleConversation(visionContent, session, history);

      // Send reply first, then persist async
      if (result.imageResult?.image_url) {
        await sendWhatsAppImage(phoneNumber, result.imageResult.image_url, result.imageResult.product_name);
      }
      await sendWhatsAppMessage(phoneNumber, result.response);
      conversationManager.saveContext(session.sessionId, result.updatedContext);
      conversationManager.logMessage(session.sessionId, phoneNumber, session.customer?.id || null, 'bot', result.response);

      // Cleanup
      try { require('fs').unlinkSync(tmpPath); } catch(e) {}

    } catch (error) {
      console.error('❌ handleImageMessage error:', error.message);
      try { require('fs').unlinkSync(tmpPath); } catch(e) {}
      try { await sendWhatsAppMessage(phoneNumber, 'Sorry, I could not process the image. Please describe the part you need instead. 🙏'); } catch(e) {}
    }
  }

  // ==========================================
  // MAIN MESSAGE HANDLER
  // ==========================================

  async function handleMessage(phoneNumber, messageText) {
    const _t0 = Date.now();
    let _tSession = 0, _tAi = 0, _tSend = 0;
    try {
      console.log(`\n🤖 Processing message from ${phoneNumber}: "${messageText}"`);

      if (isRateLimited(phoneNumber)) {
        console.log(`Rate limited: ${phoneNumber}`);
        return;
      }

      console.log('📍 Step 1: Getting session...');
      const _tSessionStart = Date.now();
      const session = await conversationManager.getOrCreateSession(phoneNumber);
      try { _tSession = Date.now() - _tSessionStart; console.log(`[PERF] session: ${_tSession}ms`); } catch(e) {}
      console.log(`✅ Session ID: ${session.sessionId}`);

      // Lead gate: block unregistered customers
      if (session.isNewCustomer) {
        console.log(`🚫 Unregistered phone ${phoneNumber} — creating lead and sending gate reply`);
        Promise.all([
          createLeadIfNew(phoneNumber, messageText),
          sendWhatsAppMessage(phoneNumber, LEAD_GATE_REPLY)
        ]).catch(err => console.error('❌ lead gate post-actions error:', err.message));
        return;
      }

      if (session.customer) {
        console.log(`👤 Customer: ${session.customer.name} (${session.customer.customer_grade} - ${session.customer.base_discount_percentage}% discount)`);
      } else {
        console.log(`👤 New/Unknown customer`);
      }

      const history = session.conversationHistory;
      console.log(`✅ Loaded ${history.length} previous messages (from session)`);

      // Step 3: Log user message (fire-and-forget — don't block AI call)
      conversationManager.logMessage(
        session.sessionId, phoneNumber, session.customer?.id || null, 'user', messageText
      );

      console.log('📍 Step 4: Routing message to AI...');
      const _tAiStart = Date.now();
      const result = await routeMessage(messageText, session, history);
      try { _tAi = Date.now() - _tAiStart; console.log(`[PERF] ai: ${_tAi}ms`); } catch(e) {}
      console.log(`✅ AI responded: "${result.response.substring(0, 100)}..."`);

      // Steps 5 & 6: Send reply first, then save context + log bot message async
      console.log('📍 Step 7: Sending WhatsApp message...');
      const _tSendStart = Date.now();
      // Send product image first if Claude fetched one
      if (result.imageResult?.image_url) {
        await sendWhatsAppImage(phoneNumber, result.imageResult.image_url, result.imageResult.product_name);
      }
      await sendWhatsAppMessage(phoneNumber, result.response);
      try { _tSend = Date.now() - _tSendStart; console.log(`[PERF] waSend: ${_tSend}ms`); } catch(e) {}

      // Fire-and-forget post-send operations (don't delay the reply)
      conversationManager.saveContext(session.sessionId, result.updatedContext);
      conversationManager.logMessage(
        session.sessionId, phoneNumber, session.customer?.id || null, 'bot', result.response
      );

      try {
        const _tTotal = Date.now() - _t0;
        console.log(`[PERF SUMMARY] total=${_tTotal}ms | session=${_tSession}ms | ai=${_tAi}ms | send=${_tSend}ms`);
      } catch(e) {}
      console.log('✅ Message processed successfully!\n');

    } catch (error) {
      console.error('❌ Error in handleMessage:', error);
      try { console.log(`[PERF SUMMARY] total=${Date.now() - _t0}ms (error) | session=${_tSession}ms | ai=${_tAi}ms | send=${_tSend}ms`); } catch(e) {}
      try {
        await sendWhatsAppMessage(phoneNumber, `Sorry, I encountered an error. Please try again or contact us at ${CUSTOMER_CARE_PHONE}.`);
      } catch (sendError) {
        console.error('❌ Failed to send error message:', sendError);
      }
    }
  }

  // ==========================================
  // WHATSAPP WEBHOOK VERIFICATION
  // ==========================================

  router.get('/whatsapp-webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!VERIFY_TOKEN) {
      console.error('[webhook-verify] WHATSAPP_VERIFY_TOKEN env var not set — rejecting all verification attempts');
      return res.sendStatus(403);
    }

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully!');
      res.status(200).send(challenge);
    } else {
      console.log('❌ Webhook verification failed');
      res.sendStatus(403);
    }
  });

  // ==========================================
  // WHATSAPP WEBHOOK - RECEIVE MESSAGES
  // ==========================================

  router.post('/whatsapp-webhook', async (req, res) => {
    // Verify Meta HMAC-SHA256 signature before processing anything
    if (!verifyMetaSignature(req)) {
      console.warn('[webhook] Rejected request with invalid/missing Meta signature');
      return res.sendStatus(403);
    }

    try {
      console.log('📨 Received webhook:', JSON.stringify(req.body, null, 2));
      res.sendStatus(200);

      const entry = req.body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages) {
        console.log('ℹ️ Not a message event, ignoring');
        return;
      }

      const message = value.messages[0];
      const from = message.from;
      const messageText = message.text?.body;
      const messageType = message.type;

      console.log(`📱 Message from: ${from} (WA format, no + prefix)`);
      console.log(`💬 Message: ${messageText}`);
      console.log(`📋 Type: ${messageType}`);

      if (messageType === 'audio') {
        console.log(`🎤 Voice message received from ${from}`);
        await handleVoiceMessage(from, message.audio.id);
        return;
      }

      if (messageType === 'image') {
        console.log(`📷 Image message received from ${from}`);
        await handleImageMessage(from, message.image.id);
        return;
      }

      if (messageType !== 'text') {
        console.log('ℹ️ Not a text message, ignoring');
        return;
      }

      await handleMessage(from, messageText);

    } catch (error) {
      console.error('❌ Error in webhook:', error);
    }
  });

  // ==========================================
  // WORKSHOP SEARCH (Employee Navigator)
  // GET /api/workshops/search?q=&type=&lat=&lng=&limit=20
  // ==========================================

  router.get('/api/workshops/search', async (req, res) => {
    try {
      const { q, type, lat, lng, limit = 20 } = req.query;

      let query = supabase
        .from('workshops')
        .select('*')
        .eq('is_active', true)
        .limit(parseInt(limit));

      if (q) {
        query = query.or(`name.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%,district.ilike.%${q}%`);
      }
      // type filter skipped — workshops table has no type column

      const { data: workshops, error } = await query;
      if (error) throw error;

      // Normalize column aliases: lat/lng, phone
      let results = (workshops || []).map(w => ({
        ...w,
        lat:   w.lat   ?? w.latitude  ?? null,
        lng:   w.lng   ?? w.longitude ?? null,
        phone: w.phone ?? w.owner_whatsapp ?? w.mechanic_phone ?? null,
        owner_phone: w.owner_phone ?? w.owner_whatsapp ?? w.mechanic_phone ?? null,
        name:  (w.name || '').trim() || w.owner_name || 'Workshop'
      }));

      // Calculate and sort by distance if lat/lng provided
      if (lat && lng) {
        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);
        results = results
          .map(w => ({
            ...w,
            distance_km: (w.lat && w.lng) ? haversineDistance(userLat, userLng, parseFloat(w.lat), parseFloat(w.lng)) : null
          }))
          .sort((a, b) => {
            if (a.distance_km === null) return 1;
            if (b.distance_km === null) return -1;
            return a.distance_km - b.distance_km;
          });
      } else {
        results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }

      res.json({ success: true, count: results.length, workshops: results });
    } catch (err) {
      console.error('❌ /api/workshops/search error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
