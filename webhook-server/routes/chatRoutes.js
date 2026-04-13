// routes/chatRoutes.js
// /api/chatbot-test/*, /api/auth/*, /api/verify-firebase-token, /api/test-ai-router
// extracted from index.js

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
// firebase-admin was already initialized in index.js; require here returns the same instance
const admin = require('firebase-admin');
const otpService = require('../services/otpService');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start.');

// ==========================================
// PHONE NORMALIZATION HELPER
// (normalizeToE164 — only used by /api/verify-firebase-token here)
// ==========================================

function normalizeToE164(phone) {
  if (!phone) return null;
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, '');

  // Already has + prefix
  if (raw.startsWith('+')) return '+' + digits;

  // 00 international prefix
  if (digits.startsWith('00')) return '+' + digits.slice(2);

  // 977 prefix (Nepal), must be 13 digits total (977 + 10)
  if (digits.startsWith('977') && digits.length >= 12) return '+' + digits;

  // 91 prefix (India), must be 12 digits total (91 + 10)
  if (digits.startsWith('91') && digits.length === 12) return '+' + digits;

  // 10-digit Nepal mobile (starts with 97/98/96)
  if (digits.length === 10 && /^(97|98|96)/.test(digits)) return '+977' + digits;

  // 10-digit India mobile
  if (digits.length === 10) return '+91' + digits;

  return '+' + digits;
}

// ==========================================
// AI ROUTER CLASSIFICATION (shared module)
// ==========================================

const { classifyMessage, aiStats } = require('../ai/classifier');

// ==========================================
// TTS HELPER
// ==========================================

async function generateTTS(text) {
  const start = Date.now();
  const hasDevanagari = /[\u0900-\u097F]/.test(text);

  // Try Google TTS for Hindi/English (fast: ~170ms)
  try {
    const langCode = hasDevanagari ? 'hi-IN' : 'en-IN';
    const voiceName = hasDevanagari ? 'hi-IN-Standard-A' : 'en-IN-Standard-A';

    const gResponse = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_CLOUD_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: { text: text.substring(0, 5000) },
        voice: { languageCode: langCode, name: voiceName },
        audioConfig: { audioEncoding: 'MP3' }
      })
    });

    if (gResponse.ok) {
      const gData = await gResponse.json();
      if (gData.audioContent) {
        const filename = 'tts_' + Date.now() + '.mp3';
        const filepath = '/tmp/' + filename;
        await fs.promises.writeFile(filepath, Buffer.from(gData.audioContent, 'base64'));
        setTimeout(() => { fs.unlink(filepath, () => {}); }, 60000);
        console.log('[tts] Google in ' + (Date.now()-start) + 'ms | ' + langCode);
        return '/api/tts/' + filename;
      }
    }
    console.log('[tts] Google failed (' + gResponse.status + '), trying OpenAI');
  } catch (e) {
    console.log('[tts] Google error: ' + e.message + ', trying OpenAI');
  }

  // Fallback: OpenAI TTS (works for Nepali, everything)
  try {
    const oResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'nova',
        input: text.substring(0, 4096)
      })
    });

    if (!oResponse.ok) throw new Error('OpenAI TTS ' + oResponse.status);

    const arrayBuffer = await oResponse.arrayBuffer();
    const filename = 'tts_' + Date.now() + '.mp3';
    const filepath = '/tmp/' + filename;
    await fs.promises.writeFile(filepath, Buffer.from(arrayBuffer));
    setTimeout(() => { fs.unlink(filepath, () => {}); }, 60000);
    console.log('[tts] OpenAI fallback in ' + (Date.now()-start) + 'ms');
    return '/api/tts/' + filename;
  } catch (e2) {
    console.log('[tts] All TTS failed: ' + e2.message);
    return null;
  }
}

// ==========================================
// FACTORY FUNCTION
// Receives routeMessage (also used by webhookRoutes) and conversationManager
// ==========================================

module.exports = function createChatRoutes({ routeMessage, conversationManager }) {
  const router = express.Router();

  // ==========================================
  // CHATBOT TEST API (for web frontend)
  // ==========================================

  const CHAT_ACCESS_CODE = process.env.CHAT_ACCESS_CODE || 'vijji2026test';
  if (!process.env.CHAT_ACCESS_CODE) {
    console.warn('⚠️  WARNING: CHAT_ACCESS_CODE env var not set. Using insecure default "vijji2026test". Set this in production.');
  }

  function generatePhoneToken(phone) {
    return crypto.createHmac('sha256', CHAT_ACCESS_CODE).update(phone).digest('hex').substring(0, 32);
  }

  function chatAuth(req, res, next) {
    const token = req.headers['x-chat-token'];
    const phone = req.headers['x-phone-number'] || req.body.phoneNumber;
    if (!token || !phone) return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
    const expected = generatePhoneToken(phone.replace(/\D/g, ''));
    if (token !== expected) return res.status(401).json({ success: false, error: 'Invalid token. Please log in again.' });
    next();
  }

  router.post('/api/chatbot-test/verify', (req, res) => {
    const { phoneNumber, accessCode } = req.body;

    if (accessCode) {
      if (accessCode === CHAT_ACCESS_CODE) {
        // Token is generated with '' as phone so chatAuth(X-Phone-Number: 'guest') passes:
        // chatAuth strips non-digits from 'guest' → '' → generatePhoneToken('') matches
        return res.json({ success: true, token: generatePhoneToken(''), phoneNumber: 'guest' });
      }
      return res.status(401).json({ success: false, error: 'Invalid access code' });
    }

    if (!phoneNumber) return res.status(400).json({ success: false, error: 'Phone number is required' });

    const normalized = conversationManager.normalizePhone(phoneNumber);
    if (normalized.length < 7) return res.status(400).json({ success: false, error: 'Please enter a valid phone number (at least 7 digits)' });

    const token = generatePhoneToken(normalized);
    res.json({ success: true, token, phoneNumber: normalized });
  });

  router.post('/api/chatbot-test/init', chatAuth, async (req, res) => {
    try {
      const phone = req.body.phoneNumber || req.headers['x-phone-number'];
      const session = await conversationManager.getOrCreateSession(phone, { channel: 'web' });
      res.json({
        success: true,
        sessionId: session.sessionId,
        phoneNumber: phone,
        customer: session.customer,
        isNewCustomer: session.isNewCustomer
      });
    } catch (error) {
      console.error('❌ Error initializing test session:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/api/chatbot-test/message', chatAuth, async (req, res) => {
    const perfStart = Date.now();
    let _tSession = 0, _tAi = 0;
    try {
      const { sessionId, phoneNumber, message, customerForEmployee, customerType, isVoice } = req.body;
      if (!sessionId || !message) return res.status(400).json({ success: false, error: 'sessionId and message are required' });

      const phone = phoneNumber || 'web-test';
      const _tSess = Date.now();
      const session = await conversationManager.getOrCreateSession(phone, { channel: 'web' });
      try { _tSession = Date.now() - _tSess; } catch(e) {}
      const history = session.conversationHistory;

      // Employee session setup: check JWT for role
      const EMPLOYEE_ROLES = ['employee', 'field_staff', 'admin', 'admin_user', 'admin user', 'field staff'];
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, JWT_SECRET);
          const roleLC = (decoded.role || '').toLowerCase();
          if (EMPLOYEE_ROLES.includes(roleLC)) {
            session.isEmployee = true;
            console.log(`[auth] 👔 Employee session: phone=${decoded.phone} role=${decoded.role}`);
          }
        } catch(e) {
          // JWT invalid or expired — proceed as regular session
        }
      }

      // Set selected customer ID for employee (resolved later by resolveOrderingCustomer)
      if (session.isEmployee && customerForEmployee) {
        session.customerForEmployee = customerForEmployee;
        session.customerType = customerType || 'customer';
        session.isEmployee = true;
      }

      // Always use the session ID from Supabase (not the frontend's stored sessionId)
      // so logs and context are written to the correct row.
      const actualSessionId = session.sessionId;

      // Log user message (fire-and-forget — don't block AI call)
      conversationManager.logMessage(actualSessionId, phone, session.customer?.id || null, 'user', message)
        .catch(e => console.error('[bg] logMessage (user) failed:', e.message));

      const _tAiStart = Date.now();
      const result = await routeMessage(message, session, history);
      try { _tAi = Date.now() - _tAiStart; } catch(e) {}

      // Send response immediately — don't wait for DB writes or TTS
      let audioUrl = null;
      if (isVoice && process.env.GOOGLE_CLOUD_API_KEY) {
        audioUrl = await generateTTS(result.response);
      }
      try {
        const _tTotal = Date.now() - perfStart;
        console.log(`[PERF SUMMARY] web total=${_tTotal}ms | session=${_tSession}ms | ai=${_tAi}ms | voice=${!!isVoice} | model=${result.model || 'unknown'}`);
      } catch(e) {}
      res.json({ success: true, response: result.response, model: result.model || 'unknown', audioUrl });

      // Fire-and-forget: save context + log bot response after sending
      conversationManager.saveContext(actualSessionId, result.updatedContext)
        .catch(e => console.error('[bg] saveContext failed:', e.message));
      conversationManager.logMessage(actualSessionId, phone, session.customer?.id || null, 'bot', result.response)
        .catch(e => console.error('[bg] logMessage (bot) failed:', e.message));
    } catch (error) {
      console.error('❌ Error in test message:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==========================================
  // SSE STREAMING MESSAGE ENDPOINT
  // Same auth/session/history logic as /message but streams tokens via SSE.
  // ==========================================

  router.post('/api/chatbot-test/message/stream', chatAuth, async (req, res) => {
    const perfStart = Date.now();
    try {
      const { sessionId, phoneNumber, message, customerForEmployee, customerType } = req.body;
      if (!sessionId || !message) return res.status(400).json({ success: false, error: 'sessionId and message are required' });

      const phone = phoneNumber || 'web-test';
      const session = await conversationManager.getOrCreateSession(phone, { channel: 'web' });
      const history = session.conversationHistory;

      // Employee session setup (same as /message)
      const EMPLOYEE_ROLES = ['employee', 'field_staff', 'admin', 'admin_user', 'admin user', 'field staff'];
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const decoded = jwt.verify(token, JWT_SECRET);
          const roleLC = (decoded.role || '').toLowerCase();
          if (EMPLOYEE_ROLES.includes(roleLC)) {
            session.isEmployee = true;
          }
        } catch(e) { /* proceed as regular session */ }
      }
      if (session.isEmployee && customerForEmployee) {
        session.customerForEmployee = customerForEmployee;
        session.customerType = customerType || 'customer';
      }

      const actualSessionId = session.sessionId;

      // Log user message before streaming starts
      await conversationManager.logMessage(actualSessionId, phone, session.customer?.id || null, 'user', message);

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      // Stream tokens to client
      const onChunk = (text) => {
        res.write(`data: ${JSON.stringify({ token: text })}\n\n`);
      };

      const result = await routeMessage(message, session, history, { stream: true, onChunk });

      // Signal end of stream
      res.write('data: [DONE]\n\n');
      res.end();

      // Fire-and-forget: save context + log bot response after stream completes
      const fullResponse = result.response;
      conversationManager.saveContext(actualSessionId, result.updatedContext).catch(e =>
        console.warn('⚠️ saveContext after stream failed:', e.message)
      );
      conversationManager.logMessage(actualSessionId, phone, session.customer?.id || null, 'bot', fullResponse).catch(e =>
        console.warn('⚠️ logMessage after stream failed:', e.message)
      );

      try {
        console.log(`[PERF SUMMARY] stream total=${Date.now() - perfStart}ms | model=${result.model || 'unknown'}`);
      } catch(e) {}

    } catch (error) {
      console.error('❌ Error in stream message:', error);
      // If headers already sent, write error as SSE event
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  });

  // ==========================================
  // CHAT HISTORY & JWT REFRESH ENDPOINTS
  // ==========================================

  router.get('/api/chatbot-test/history', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authorization header required' });
      }
      const token = authHeader.split(' ')[1];
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (e) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }

      const phone = decoded.phone;
      if (!phone) return res.status(400).json({ success: false, error: 'Phone not found in token' });

      // Normalize phone for lookup
      const normalized = conversationManager.normalizePhone(phone);
      const variants = [...new Set([phone, normalized, '977' + normalized, '+977' + normalized])];

      const { data: messages, error } = await supabase
        .from('conversation_logs')
        .select('message_type, message_text, timestamp')
        .in('phone_number', variants)
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Get customer info
      let customerInfo = { name: decoded.customerName || null, grade: null };
      if (decoded.customerId) {
        const { data: cust } = await supabase
          .from('customers')
          .select('name, customer_grade')
          .eq('id', decoded.customerId)
          .single();
        if (cust) customerInfo = { name: cust.name, grade: cust.customer_grade };
      }

      const formatted = (messages || []).reverse().map(m => ({
        role: m.message_type === 'user' ? 'user' : 'assistant',
        content: m.message_text,
        timestamp: m.timestamp
      }));

      res.json({ success: true, messages: formatted, customer: customerInfo });
    } catch (error) {
      console.error('❌ /api/chatbot-test/history error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.post('/api/auth/refresh', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authorization header required' });
      }
      const token = authHeader.split(' ')[1];
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (e) {
        return res.status(401).json({ success: false, error: 'Token invalid or expired' });
      }

      // 72-hour idle timeout check (critical) — verify last activity in chatbot_sessions
      const IDLE_MS = 72 * 60 * 60 * 1000;
      const phoneForLookup = decoded.phone ? conversationManager.normalizePhone(decoded.phone) : null;
      if (phoneForLookup) {
        const { data: sessionRow } = await supabase
          .from('chatbot_sessions')
          .select('last_activity')
          .eq('phone', phoneForLookup)
          .order('last_activity', { ascending: false })
          .limit(1)
          .single();
        if (sessionRow?.last_activity) {
          const idleMs = Date.now() - new Date(sessionRow.last_activity).getTime();
          if (idleMs > IDLE_MS) {
            return res.status(401).json({ success: false, error: 'Session expired due to inactivity. Please log in again.', code: 'IDLE_TIMEOUT' });
          }
        }
      }

      // Issue new 7-day sliding token
      const { iat, exp, ...payload } = decoded;
      const newToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
      res.json({ success: true, token: newToken, expires_in: 7 * 86400 });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==========================================
  // FIREBASE PHONE AUTH - TOKEN VERIFICATION
  // ==========================================

  /**
   * POST /api/verify-firebase-token
   * Body: { idToken, phone }
   * Verifies Firebase ID token, looks up customer in Supabase, returns chat token + customer info.
   */
  router.post('/api/verify-firebase-token', async (req, res) => {
    try {
      const { idToken, phone } = req.body;
      if (!idToken) return res.status(400).json({ success: false, error: 'idToken is required' });

      // Verify Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);

      // Get phone from token (Firebase sets phone_number claim)
      const firebasePhone = decodedToken.phone_number || phone;
      if (!firebasePhone) return res.status(400).json({ success: false, error: 'Phone number not found in token' });

      // Normalize to E.164 format
      const e164 = normalizeToE164(firebasePhone);
      console.log(`🔐 Firebase token verified for ${e164}`);

      // Lookup customer in Supabase by phone (try multiple formats)
      const normalized = conversationManager.normalizePhone(e164);
      const variants = [...new Set([e164, normalized, '977' + normalized, '+977' + normalized])];
      console.log("🔍 DEBUG login lookup:", JSON.stringify({ e164, normalized, variants }));
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .in('phone', variants)
        .eq('is_active', true)
        .limit(1)
        .single();

      // Check employees table independently
      const { data: employeeCheck } = await supabase
        .from('employees')
        .select('role, name')
        .or('phone.eq.' + e164 + ',phone.eq.' + normalized)
        .eq('active', true)
        .limit(1)
        .single();

      const foundIn = customer ? 'customer' : employeeCheck ? 'employee' : 'none';
      console.log(`[auth] phone: ${normalized} found_in: ${foundIn} customer: ${!!customer} employee: ${!!employeeCheck} role: ${employeeCheck?.role || 'n/a'}`);

      if (!customer && !employeeCheck) {
        console.log(`[auth] REJECTED: phone ${normalized} not found in customers or employees table`);
        return res.status(404).json({ success: false, error: 'Phone number not registered' });
      }

      // Generate chat token (sha256 hash used by chatbot API)
      const chatToken = generatePhoneToken(normalized);

      // Role from employeeCheck above — normalize inconsistent DB values
      const userRole = employeeCheck
        ? (employeeCheck.role || 'employee').toLowerCase().replace(' ', '_')
        : 'customer';
      console.log(`[auth] JWT role assigned: ${userRole}`);

      // Generate JWT with customer info and role
      const jwtPayload = {
        phone: e164,
        customerId: customer?.id || null,
        customerName: customer?.name || employeeCheck?.name || null,
        role: userRole
      };
      const jwtToken = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '7d' });

      // Device tracking — fire-and-forget, increments login_count on repeat visits
      const { deviceInfo } = req.body;
      if (deviceInfo?.fingerprint) {
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || null;
        supabase.rpc('track_device', {
          p_customer_id: customer?.id || null,
          p_phone: normalized,
          p_fingerprint: deviceInfo.fingerprint,
          p_user_agent: deviceInfo.userAgent || null,
          p_platform: deviceInfo.platform || null,
          p_screen: deviceInfo.screenResolution || null,
          p_language: deviceInfo.language || null,
          p_timezone: deviceInfo.timezone || null,
          p_ip: ip,
        }).then(({ error }) => {
          if (error) console.warn('[device-tracking] rpc failed:', error.message);
        });
      }

      res.json({
        success: true,
        isExisting: true,
        isEmployee: !!employeeCheck,
        token: chatToken,
        jwtToken,
        phone: normalized,
        customer: {
          id: customer?.id || null,
          name: customer?.name || employeeCheck?.name || null,
          customer_code: customer?.customer_code || null,
          customer_grade: customer?.customer_grade || null,
          base_discount_percentage: customer?.base_discount_percentage || null
        }
      });
    } catch (err) {
      console.error('❌ verify-firebase-token error:', err.message);
      let msg = 'Token verification failed. Please try again.';
      if (err.code === 'auth/id-token-expired') msg = 'Session expired. Please log in again.';
      else if (err.code === 'auth/argument-error') msg = 'Invalid token. Please log in again.';
      res.status(401).json({ success: false, error: msg });
    }
  });

  // ==========================================
  // AAKASH SMS OTP AUTH — SEND OTP
  // POST /api/auth/send-otp
  // Body: { phone }
  // ==========================================

  router.post('/api/auth/send-otp', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ success: false, error: 'phone is required' });
      const result = await otpService.sendOTP(phone);
      res.json(result);
    } catch (err) {
      console.error('[send-otp] error:', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // AAKASH SMS OTP AUTH — VERIFY OTP
  // POST /api/auth/verify-otp
  // Body: { phone, otp }
  // Returns same shape as /api/verify-firebase-token
  // ==========================================

  router.post('/api/auth/verify-otp', async (req, res) => {
    try {
      const { phone, otp } = req.body;
      if (!phone || !otp) return res.status(400).json({ success: false, error: 'phone and otp are required' });

      const verification = otpService.verifyOTP(phone, otp);
      if (!verification.success) {
        return res.status(401).json({ success: false, error: verification.error });
      }

      // OTP verified — look up customer in Supabase
      const e164 = normalizeToE164(phone);
      const normalized = conversationManager.normalizePhone(e164);
      const variants = [...new Set([e164, normalized, '977' + normalized, '+977' + normalized])];
      console.log('[verify-otp] OTP OK, looking up phone:', normalized);

      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .in('phone', variants)
        .eq('is_active', true)
        .limit(1)
        .single();

      const { data: employeeCheck } = await supabase
        .from('employees')
        .select('role, name')
        .or('phone.eq.' + e164 + ',phone.eq.' + normalized)
        .eq('active', true)
        .limit(1)
        .single();

      const foundIn = customer ? 'customer' : employeeCheck ? 'employee' : 'none';
      console.log('[verify-otp] phone:', normalized, 'found_in:', foundIn);

      if (!customer && !employeeCheck) {
        // New user — return 404 so frontend shows registration form
        return res.status(404).json({ success: false, error: 'Phone number not registered' });
      }

      const chatToken = generatePhoneToken(normalized);
      const userRole = employeeCheck
        ? (employeeCheck.role || 'employee').toLowerCase().replace(' ', '_')
        : 'customer';

      const jwtPayload = {
        phone: e164,
        customerId: customer?.id || null,
        customerName: customer?.name || employeeCheck?.name || null,
        role: userRole
      };
      const jwtToken = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '7d' });

      // Device tracking — fire-and-forget
      const { deviceInfo } = req.body;
      if (deviceInfo?.fingerprint) {
        const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || null;
        supabase.rpc('track_device', {
          p_customer_id: customer?.id || null,
          p_phone: normalized,
          p_fingerprint: deviceInfo.fingerprint,
          p_user_agent: deviceInfo.userAgent || null,
          p_platform: deviceInfo.platform || null,
          p_screen: deviceInfo.screenResolution || null,
          p_language: deviceInfo.language || null,
          p_timezone: deviceInfo.timezone || null,
          p_ip: ip,
        }).then(({ error }) => {
          if (error) console.warn('[device-tracking] verify-otp rpc failed:', error.message);
        });
      }

      res.json({
        success: true,
        isExisting: true,
        isEmployee: !!employeeCheck,
        token: chatToken,
        jwtToken,
        phone: normalized,
        customer: {
          id: customer?.id || null,
          name: customer?.name || employeeCheck?.name || null,
          customer_code: customer?.customer_code || null,
          customer_grade: customer?.customer_grade || null,
          base_discount_percentage: customer?.base_discount_percentage || null
        }
      });
    } catch (err) {
      console.error('[verify-otp] error:', err.message);
      res.status(500).json({ success: false, error: 'Verification failed. Please try again.' });
    }
  });

  // ==========================================
  // TEST LOGIN BYPASS (Google Play Store review)
  // Only active when ENABLE_TEST_LOGIN=true
  // ==========================================

  router.post('/api/auth/test-login', async (req, res) => {
    if (process.env.ENABLE_TEST_LOGIN !== 'true') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }

    const TEST_PHONE = '+9779766560722';
    const TEST_PASSWORD = 'Cyrus_phibo9';

    const { phone, password } = req.body;
    if (phone !== TEST_PHONE || password !== TEST_PASSWORD) {
      console.log(`[test-login] ❌ Rejected attempt — phone: ${phone}`);
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    console.log(`[test-login] ⚠️  Test login used for Google Play review — phone: ${TEST_PHONE}`);

    try {
      const e164 = TEST_PHONE;
      const normalized = conversationManager.normalizePhone(e164);
      const variants = [...new Set([e164, normalized, '977' + normalized, '+977' + normalized])];

      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .in('phone', variants)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (!customer) {
        return res.status(404).json({ success: false, error: 'Test customer not found' });
      }

      const chatToken = generatePhoneToken(normalized);
      const jwtPayload = {
        phone: e164,
        customerId: customer.id,
        customerName: customer.name,
        role: 'customer'
      };
      const jwtToken = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '7d' });

      res.json({
        success: true,
        isExisting: true,
        isEmployee: false,
        token: chatToken,
        jwtToken,
        phone: normalized,
        customer: {
          id: customer.id,
          name: customer.name,
          customer_code: customer.customer_code || null,
          customer_grade: customer.customer_grade || null,
          base_discount_percentage: customer.base_discount_percentage || null
        }
      });
    } catch (err) {
      console.error('❌ test-login error:', err.message);
      res.status(500).json({ success: false, error: 'Internal error' });
    }
  });

  // ==========================================
  // AI ROUTER TEST ENDPOINT
  // ==========================================

  router.get('/api/test-ai-router', async (req, res) => {
    const testMessages = [
      'Hi',
      'नमस्ते मलाई brake pad चाहियो',
      'I need Bosch brake pads for Toyota Hilux 2019',
      'add that to my cart',
      'مرحبا كيف حالك'
    ];

    const fakeSession = {
      sessionId: 'test-session',
      customer: null,
      isNewCustomer: true,
      context: { cart: [] }
    };

    const results = [];
    for (const msg of testMessages) {
      const t0 = Date.now();
      const classification = classifyMessage(msg, fakeSession);
      const ms = Date.now() - t0;
      results.push({
        message: msg,
        route: classification.route,
        model: classification.model,
        reason: classification.reason,
        ms
      });
    }

    res.json({ results, stats: aiStats });
  });

  // ==========================================
  // CUSTOMER SEARCH (employee use)
  // GET /api/customers/search?q=&limit=20
  // Requires valid JWT (any role)
  // ==========================================

  router.get('/api/customers/search', async (req, res) => {
    try {
      // Require valid JWT
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
      }
      try {
        jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      } catch(e) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }

      const { q, limit = 20 } = req.query;

      let query = supabase
        .from('customers')
        .select('id, name, phone, customer_code, customer_grade, city, base_discount_percentage')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .limit(parseInt(limit) || 20);

      if (q) {
        query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%,customer_code.ilike.%${q}%`);
      }

      const { data: customers, error } = await query;
      if (error) throw error;

      res.json({ success: true, count: (customers || []).length, customers: customers || [] });
    } catch(err) {
      console.error('❌ /api/customers/search error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // HELPERS: coordinate validation + haversine
  // ==========================================

  function isValidCoord(la, lo) {
    if (la == null || lo == null) return false;
    const a = parseFloat(la), o = parseFloat(lo);
    return !isNaN(a) && !isNaN(o) && a >= 20 && a <= 35 && o >= 68 && o <= 98 && a !== 0 && o !== 0;
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  }

  // ==========================================
  // UNIFIED FIND SEARCH
  // GET /api/find/search?q=&type=all&lat=&lng=&limit=30
  // Requires valid JWT (any role)
  // ==========================================

  router.get('/api/find/search', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
      }
      try { jwt.verify(authHeader.split(' ')[1], JWT_SECRET); }
      catch(e) { return res.status(401).json({ success: false, error: 'Invalid or expired token' }); }

      const { q, type = 'all', lat, lng, limit = 30 } = req.query;
      const lim = Math.min(parseInt(limit) || 30, 100);
      const userLat = lat ? parseFloat(lat) : null;
      const userLng = lng ? parseFloat(lng) : null;
      const hasUserLoc = isValidCoord(userLat, userLng);

      let results = [];

      if (type === 'workshop' || type === 'all') {
        let wq = supabase
          .from('workshops')
          .select('id, name, city, address, latitude, longitude, owner_whatsapp, mechanic_phone')
          .eq('is_active', true)
          .limit(lim);
        if (q) wq = wq.or(`name.ilike.%${q}%,city.ilike.%${q}%,address.ilike.%${q}%`);
        const { data: ws, error: we } = await wq;
        if (we) throw we;
        (ws || []).forEach(w => {
          const la = w.latitude != null ? parseFloat(w.latitude) : null;
          const lo = w.longitude != null ? parseFloat(w.longitude) : null;
          results.push({
            id: w.id, name: w.name || 'Workshop', city: w.city || '', address: w.address || '',
            latitude: isValidCoord(la, lo) ? la : null,
            longitude: isValidCoord(la, lo) ? lo : null,
            phone: w.owner_whatsapp || w.mechanic_phone || null,
            owner_whatsapp: w.owner_whatsapp || null,
            mechanic_phone: w.mechanic_phone || null,
            type: 'workshop'
          });
        });
      }

      if (type === 'retailer' || type === 'all') {
        let rq = supabase
          .from('customers')
          .select('id, name, city, address, latitude, longitude, phone, segment, customer_grade')
          .eq('is_active', true)
          .limit(lim);
        if (q) rq = rq.or(`name.ilike.%${q}%,city.ilike.%${q}%`);
        const { data: rs, error: re } = await rq;
        if (re) throw re;
        (rs || []).forEach(r => {
          const la = r.latitude != null ? parseFloat(r.latitude) : null;
          const lo = r.longitude != null ? parseFloat(r.longitude) : null;
          results.push({
            id: r.id, name: r.name || 'Retailer', city: r.city || '', address: r.address || '',
            latitude: isValidCoord(la, lo) ? la : null,
            longitude: isValidCoord(la, lo) ? lo : null,
            phone: r.phone || null, segment: r.segment || null,
            customer_grade: r.customer_grade || null,
            type: 'retailer'
          });
        });
      }

      if (hasUserLoc) {
        results = results.map(r => ({
          ...r,
          distance_km: (r.latitude !== null && r.longitude !== null)
            ? haversineKm(userLat, userLng, r.latitude, r.longitude) : null
        })).sort((a, b) => {
          if (a.distance_km === null) return 1;
          if (b.distance_km === null) return -1;
          return a.distance_km - b.distance_km;
        });
      } else {
        results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }

      res.json({ success: true, count: results.length, results });
    } catch(err) {
      console.error('❌ /api/find/search error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // CUSTOMER LOCATION CAPTURE
  // PATCH /api/customers/:id/location
  // Requires employee/admin/field_staff JWT role
  // ==========================================

  router.patch('/api/customers/:id/location', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
      }
      let decoded;
      try { decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET); }
      catch(e) { return res.status(401).json({ success: false, error: 'Invalid or expired token' }); }
      if (!['employee', 'admin', 'field_staff'].includes(decoded.role)) {
        return res.status(403).json({ success: false, error: 'Employee role required' });
      }
      const { latitude, longitude } = req.body;
      const lat = parseFloat(latitude), lng = parseFloat(longitude);
      if (isNaN(lat) || lat < 20 || lat > 35) return res.status(400).json({ success: false, error: 'latitude must be 20-35' });
      if (isNaN(lng) || lng < 68 || lng > 98) return res.status(400).json({ success: false, error: 'longitude must be 68-98' });
      const { data, error } = await supabase
        .from('customers')
        .update({ latitude: lat, longitude: lng })
        .eq('id', req.params.id).select('name').single();
      if (error) throw error;
      console.log(`📍 Location captured for customer: ${data?.name || req.params.id}, ${lat}, ${lng}`);
      res.json({ success: true, message: 'Location saved' });
    } catch(err) {
      console.error('❌ /api/customers/:id/location error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // WORKSHOP LOCATION CAPTURE
  // PATCH /api/workshops/:id/location
  // Requires employee/admin/field_staff JWT role
  // ==========================================

  router.patch('/api/workshops/:id/location', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Authorization required' });
      }
      let decoded;
      try { decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET); }
      catch(e) { return res.status(401).json({ success: false, error: 'Invalid or expired token' }); }
      if (!['employee', 'admin', 'field_staff'].includes(decoded.role)) {
        return res.status(403).json({ success: false, error: 'Employee role required' });
      }
      const { latitude, longitude } = req.body;
      const lat = parseFloat(latitude), lng = parseFloat(longitude);
      if (isNaN(lat) || lat < 20 || lat > 35) return res.status(400).json({ success: false, error: 'latitude must be 20-35' });
      if (isNaN(lng) || lng < 68 || lng > 98) return res.status(400).json({ success: false, error: 'longitude must be 68-98' });
      const { data, error } = await supabase
        .from('workshops')
        .update({ latitude: lat, longitude: lng })
        .eq('id', req.params.id).select('name').single();
      if (error) throw error;
      console.log(`📍 Location captured for workshop: ${data?.name || req.params.id}, ${lat}, ${lng}`);
      res.json({ success: true, message: 'Location saved' });
    } catch(err) {
      console.error('❌ /api/workshops/:id/location error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // PUBLIC CUSTOMER SELF-REGISTRATION
  // POST /api/customers/register
  // No auth required (pre-login)
  // ==========================================

  const MONTHLY_SERVICING_GRADE = {
    'Above 200': 'PLATINUM',
    '100-200':   'GOLD',
    '50-100':    'PREMIUM',
    'Below 50':  'STANDARD',
  };

  router.post('/api/customers/register', async (req, res) => {
    try {
      const { name, phone, city, segment, businessName, latitude, longitude, customerType, monthlyServicing } = req.body;
      if (!name || !phone || !city || !segment) {
        return res.status(400).json({ success: false, error: 'name, phone, city, and segment are required' });
      }
      const validSegments = ['PC', 'MUV', 'LCV', 'HCV', 'AE', 'TW'];
      if (!validSegments.includes(segment)) {
        return res.status(400).json({ success: false, error: 'segment must be one of: ' + validSegments.join(', ') });
      }
      const e164 = normalizeToE164(phone);
      if (!e164) return res.status(400).json({ success: false, error: 'Invalid phone number' });
      const normalized = conversationManager.normalizePhone(e164);
      const variants = [...new Set([e164, normalized, '977' + normalized, '+977' + normalized])];
      const { data: existing } = await supabase
        .from('customers').select('id').in('phone', variants).limit(1).single();
      if (existing) return res.status(409).json({ success: false, error: 'Phone number already registered' });
      let lat = null, lng = null;
      if (latitude !== undefined && longitude !== undefined) {
        const la = parseFloat(latitude), lo = parseFloat(longitude);
        if (isValidCoord(la, lo)) { lat = la; lng = lo; }
      }
      const address = businessName ? `${String(businessName).trim()}, ${city.trim()}` : city.trim();
      const customerCode = 'PUB' + Date.now().toString().slice(-7);
      const workshopGradeForCustomer = MONTHLY_SERVICING_GRADE[monthlyServicing] || 'STANDARD';
      const customerGrade = customerType === 'Workshop' ? workshopGradeForCustomer : 'PUBLIC';
      const { data: newCustomer, error: insertErr } = await supabase
        .from('customers')
        .insert({
          name: String(name).trim(), phone: e164, whatsapp_number: e164,
          city: String(city).trim(), address,
          customer_code: customerCode,
          segment: segment, customer_grade: customerGrade,
          customer_type: customerType || 'Retailer',
          business_name: businessName ? String(businessName).trim() : null,
          base_discount_percentage: 20, is_active: true,
          latitude: lat, longitude: lng,
          balance_lcy: 0, credit_limit: 0,
          created_at: new Date().toISOString()
        })
        .select('*').single();
      if (insertErr) throw insertErr;
      console.log(`✅ New customer registered: ${newCustomer.name} (${e164})`);

      // If registering as a Workshop, also create a workshops record
      if (customerType === 'Workshop') {
        const { error: wsErr } = await supabase.from('workshops').insert({
          name: (businessName ? String(businessName).trim() : null) || String(name).trim(),
          phone: e164,
          city: String(city).trim(),
          segment: segment,
          monthly_servicing: monthlyServicing || null,
          workshop_grade: workshopGradeForCustomer,
          customer_id: newCustomer.id,
          is_active: true
        });
        if (wsErr) {
          console.error(`⚠️ Workshop insert failed (customer still created): ${wsErr.message}`);
        } else {
          console.log(`🏭 Workshop record created for ${newCustomer.name} (grade: ${workshopGradeForCustomer})`);
        }
      }

      const chatToken = crypto.createHash('sha256')
        .update(normalized + '-vijji-chat-' + (process.env.CHAT_ACCESS_CODE || 'vijji2026test'))
        .digest('hex').substring(0, 32);
      const jwtToken = jwt.sign(
        { phone: e164, customerId: newCustomer.id, customerName: newCustomer.name, role: 'customer' },
        JWT_SECRET, { expiresIn: '7d' }
      );
      res.json({
        success: true, token: chatToken, jwtToken, phone: normalized,
        customer: {
          id: newCustomer.id, name: newCustomer.name,
          customer_code: newCustomer.customer_code || null,
          customer_grade: newCustomer.customer_grade,
          base_discount_percentage: newCustomer.base_discount_percentage
        }
      });
    } catch(err) {
      console.error('❌ /api/customers/register error:', err.message);
      if (err.code === '23505') return res.status(409).json({ success: false, error: 'Phone number already registered' });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==========================================
  // TTS FILE SERVING
  // ==========================================

  router.get('/api/tts/:filename', (req, res) => {
    const filename = path.basename(req.params.filename); // sanitize path traversal
    if (!filename.startsWith('tts_') || !filename.endsWith('.mp3')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const filepath = path.join('/tmp', filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'Audio file not found or expired' });
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.sendFile(filepath);
  });

  return router;
};
