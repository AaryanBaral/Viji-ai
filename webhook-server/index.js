// index.js
// Main webhook server for WhatsApp chatbot — Express app setup, middleware, routes

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'vijji-be89a' });

const { supabase, CUSTOMER_CARE_PHONE } = require('./shared');
const conversationManager = require('./db/conversationManager');
const { transcribeAudio } = require('./services/voiceTranscriber');
const { routeMessage } = require('./ai/aiRouter');
const { handleConversation } = require('./ai/handleConversation');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start.');

const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;
if (!WHATSAPP_APP_SECRET) {
  console.warn('⚠️  WARNING: WHATSAPP_APP_SECRET is not set. Webhook signature verification is DISABLED. Set this to your Meta App Secret to prevent forged webhook messages.');
}

const app = express();
// Capture raw body for WhatsApp webhook HMAC-SHA256 signature verification (must run before JSON parsing)
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// Allowed origins — includes production domains and Capacitor mobile app scheme
const ALLOWED_ORIGINS = new Set([
  'https://vijji.ai',
  'https://chat.vijji.ai',
  'https://www.vijji.ai',
  'capacitor://localhost',
  'http://localhost:5173',  // Vite dev server
  'http://localhost:3000',  // Local backend
]);

// Global CORS for all routes
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Chat-Token, X-Phone-Number');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Multer for voice audio uploads
const audioUpload = multer({
  storage: multer.diskStorage({
    destination: '/tmp',
    filename: (req, file, cb) => cb(null, 'voice_web_' + Date.now() + '.webm')
  }),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// ==========================================
// HEALTH CHECK ENDPOINT
// ==========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Satkam Vehicle Parts Chatbot is running!',
    timestamp: new Date().toISOString()
  });
});

// Public frontend config (safe to expose — Maps key is domain-restricted, accessCode gates guest chat)
app.get('/api/config/public', (req, res) => {
  res.json({
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    customerCarePhone: CUSTOMER_CARE_PHONE,
    chatAccessCode: process.env.CHAT_ACCESS_CODE || ''
  });
});

// ==========================================
// DEEP LINK ENTRY POINT (inlined from openRoute.js)
// ==========================================

app.get('/open', async (req, res) => {
  const { phone, token } = req.query;
  if (!phone || !token) return res.redirect('https://chat.vijji.ai');

  try {
    const { data, error } = await supabase
      .from('customer_tokens')
      .select('id, phone, token, expires_at')
      .eq('phone', phone)
      .eq('token', token)
      .single();

    if (error || !data) {
      console.log(`[/open] Invalid token for phone=${phone}`);
      return res.redirect('https://chat.vijji.ai');
    }

    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      console.log(`[/open] Expired token for phone=${phone}`);
      return res.redirect('https://chat.vijji.ai');
    }

    const userAgent = req.get('User-Agent') || '';
    await supabase.from('link_clicks').insert({
      phone,
      clicked_at: new Date().toISOString(),
      user_agent: userAgent,
      source: 'open_link',
    });

    const params = `phone=${encodeURIComponent(phone)}&token=${encodeURIComponent(token)}`;
    if (userAgent.includes('VijjiApp')) return res.redirect(`vijji://chat?${params}`);
    return res.redirect(`https://chat.vijji.ai?${params}`);
  } catch (err) {
    console.error('[/open] Error:', err.message);
    return res.redirect('https://chat.vijji.ai');
  }
});

const webhookRoutes = require('./routes/webhookRoutes')({ routeMessage, conversationManager, transcribeAudio, handleConversation });
app.use('/', webhookRoutes);

// ==========================================
// WEB VOICE TRANSCRIBE ENDPOINT
// ==========================================

app.post('/api/transcribe', (req, res) => {
  audioUpload.single('audio')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: 'No audio file provided' });

    console.log('[transcribe-debug] headers:', JSON.stringify({
      auth: req.headers['authorization']?.substring(0, 20),
      token: req.headers['x-chat-token']?.substring(0, 10),
      phone_header: req.headers['x-phone-number'],
    }));
    console.log('[transcribe-debug] body:', JSON.stringify(req.body));
    console.log('[transcribe-debug] file:', req.file?.originalname, req.file?.size);

    // Auth: valid JWT Bearer OR valid X-Chat-Token + phone (same hash as chatAuth middleware)
    let authorized = false;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try { jwt.verify(authHeader.slice(7), JWT_SECRET); authorized = true; } catch(e) {}
    }
    if (!authorized) {
      const token = req.headers['x-chat-token'];
      const phone = (req.body.phone || req.headers['x-phone-number'] || '').replace(/\D/g, '');
      if (token && phone) {
        const chatAccessCode = process.env.CHAT_ACCESS_CODE || 'vijji2026test';
        const expected = crypto.createHmac('sha256', chatAccessCode)
          .update(phone)
          .digest('hex').substring(0, 32);
        authorized = (token === expected);
      }
    }
    if (!authorized) {
      try { require('fs').unlinkSync(req.file.path); } catch(e) {}
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const filePath = req.file.path;
    try {
      const text = await transcribeAudio(filePath);
      try { require('fs').unlinkSync(filePath); } catch(e) {}
      if (!text || text.trim().length === 0) {
        return res.json({ success: false, text: '', error: 'Could not transcribe audio' });
      }
      res.json({ success: true, text: text.trim() });
    } catch (tErr) {
      try { require('fs').unlinkSync(filePath); } catch(e) {}
      console.error('[/api/transcribe] error:', tErr.message);
      res.status(500).json({ success: false, error: tErr.message });
    }
  });
});

const adminRoutes = require('./routes/adminRoutes');
app.use('/admin', adminRoutes);

const chatRoutes = require('./routes/chatRoutes')({ routeMessage, conversationManager });
app.use('/', chatRoutes);

// ==========================================
// SEED DEFAULT ADMIN USER
// ==========================================

async function initAdminUsers() {
  try {
    const { data: existing, error: checkError } = await supabase.from('admin_users').select('id').limit(1);

    if (checkError) {
      console.error('⚠️  admin_users table not found. Please create it in Supabase SQL Editor:');
      console.error(`
CREATE TABLE admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin', 'admin', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ
);

CREATE INDEX idx_admin_users_email ON admin_users(email);
`);
      return;
    }

    if (existing && existing.length > 0) {
      console.log('✅ Admin users table exists with', existing.length, 'user(s)');
      return;
    }

    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const password_hash = await bcrypt.hash(defaultPassword, 10);
    const seedData = { name: 'Riddi', email: 'riddi@vijji.ai', role: 'super_admin', is_active: true };

    let { error: insertError } = await supabase.from('admin_users').insert({ ...seedData, password_hash });

    if (insertError && (insertError.code === '42703' || insertError.message?.includes('password_hash'))) {
      ({ error: insertError } = await supabase.from('admin_users').insert({ ...seedData, password: password_hash }));
    }

    if (insertError) {
      console.error('❌ Failed to seed default admin:', insertError.message);
    } else {
      console.log('✅ Default super_admin created: riddi@vijji.ai');
    }
  } catch (err) {
    console.error('❌ initAdminUsers error:', err.message);
  }
}

// ==========================================
// START SERVER
// ==========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log('🚀 ========================================');
  console.log('🚀 Satkam Vehicle Parts Chatbot Server');
  console.log('🚀 ========================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🚀 Health check: http://localhost:${PORT}/health`);
  console.log(`🚀 Webhook URL: http://localhost:${PORT}/whatsapp-webhook`);
  console.log(`🚀 Admin Dashboard: http://localhost:${PORT}/admin/dashboard`);
  console.log('🚀 ========================================');

  await initAdminUsers();

  console.log('🚀 Status: Ready to receive messages!');
  console.log('🚀 Waiting for WhatsApp messages...\n');
});
