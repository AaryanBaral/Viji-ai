// routes/adminRoutes.js
// All /admin/* routes extracted from index.js

const express = require('express');
const router = express.Router();
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const Anthropic = require('@anthropic-ai/sdk');
const { getEmbedding } = require('../db/embeddingService');
const { sendOrderStatusNotification } = require('../services/notifications');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is not set. Server cannot start.');

const catalogueUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ==========================================
// CONFIG CACHE (local copy for admin routes)
// ==========================================

let configCache = {};
let configLastLoaded = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

async function loadConfig() {
  const now = Date.now();
  if (Object.keys(configCache).length > 0 && (now - configLastLoaded) < CONFIG_CACHE_TTL) {
    return configCache;
  }
  try {
    console.log('⚙️ Loading bot config from database...');
    const { data, error } = await supabase.from('bot_config').select('config_key, config_value, config_type');
    if (error) throw error;

    const config = {};
    data.forEach(row => {
      let value = row.config_value;
      if (row.config_type === 'number') value = Number(value);
      else if (row.config_type === 'boolean') value = value === 'true';
      else if (row.config_type === 'json') { try { value = JSON.parse(value); } catch(e) { /* keep as string */ } }
      config[row.config_key] = value;
    });
    configCache = config;
    configLastLoaded = now;
    console.log(`✅ Loaded ${data.length} config settings`);
    return config;
  } catch (error) {
    console.error('❌ Error loading config:', error);
    return configCache;
  }
}

async function reloadConfig() {
  configLastLoaded = 0;
  return await loadConfig();
}

// ==========================================
// ADMIN AUTH MIDDLEWARE (JWT-based)
// ==========================================

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminUser = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.adminUser?.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    next();
  };
}

// ==========================================
// ADMIN - ROOT REDIRECT
// ==========================================

router.get('/', (req, res) => res.redirect('/admin/dashboard'));

// ==========================================
// ADMIN - LOGIN & USER MANAGEMENT
// ==========================================

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data: user, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .eq('is_active', true)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const storedHash = user.password_hash || user.password;
    if (!storedHash) {
      console.error(`[Login] No password hash in DB for ${email}. Columns present:`, Object.keys(user));
      return res.status(500).json({ error: 'Account not configured correctly. Contact super admin.' });
    }

    const valid = await bcrypt.compare(password, storedHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await supabase.from('admin_users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', adminAuth, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('admin_users')
      .select('id, name, email, role, is_active, created_at, last_login')
      .eq('id', req.adminUser.id)
      .eq('is_active', true)
      .single();

    if (error || !user) return res.status(401).json({ error: 'User not found or inactive' });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/users', adminAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });

    const validRoles = ['super_admin', 'admin', 'viewer'];
    if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role. Must be: super_admin, admin, or viewer' });

    const password_hash = await bcrypt.hash(password, 10);
    const baseInsert = { name, email: email.toLowerCase().trim(), role: role || 'viewer', is_active: true };

    let { data: user, error } = await supabase.from('admin_users').insert({ ...baseInsert, password_hash }).select('id, name, email, role, is_active, created_at').single();

    if (error && (error.code === '42703' || error.message?.includes('password_hash'))) {
      ({ data: user, error } = await supabase.from('admin_users').insert({ ...baseInsert, password: password_hash }).select('id, name, email, role, is_active, created_at').single());
    }

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'A user with this email already exists' });
      throw error;
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users', adminAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { data: users, error } = await supabase.from('admin_users').select('id, name, email, role, is_active, created_at, last_login').order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ success: true, users: users || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/users/:id', adminAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, is_active, password } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email.toLowerCase().trim();
    if (role !== undefined) {
      if (!['super_admin', 'admin', 'viewer'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      updates.role = role;
    }
    if (is_active !== undefined) updates.is_active = is_active;
    const newHash = password ? await bcrypt.hash(password, 10) : null;
    if (newHash) updates.password_hash = newHash;

    let { data: user, error } = await supabase.from('admin_users').update(updates).eq('id', id).select('id, name, email, role, is_active, created_at, last_login').single();

    if (error && newHash && (error.code === '42703' || error.message?.includes('password_hash'))) {
      const fallbackUpdates = { ...updates };
      delete fallbackUpdates.password_hash;
      fallbackUpdates.password = newHash;
      ({ data: user, error } = await supabase.from('admin_users').update(fallbackUpdates).eq('id', id).select('id, name, email, role, is_active, created_at, last_login').single());
    }

    if (error) throw error;
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', adminAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.adminUser.id) return res.status(400).json({ error: 'Cannot deactivate your own account' });
    const { error } = await supabase.from('admin_users').update({ is_active: false }).eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ADMIN - STATS
// ==========================================

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [messagesRes, sessionsRes, ordersRes, productsRes] = await Promise.all([
      supabase.from('conversation_logs').select('*', { count: 'exact', head: true }).gte('timestamp', today),
      supabase.from('chatbot_sessions').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('orders').select('*', { count: 'exact', head: true }).gte('order_date', today),
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true)
    ]);
    res.json({
      success: true,
      stats: {
        messages_today: messagesRes.count || 0,
        active_sessions: sessionsRes.count || 0,
        orders_today: ordersRes.count || 0,
        total_products: productsRes.count || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - ORDERS
// ==========================================

const VALID_ORDER_STATUSES = ['pending', 'confirmed', 'processing', 'completed', 'cancelled', 'pending_stock', 'partial_stock'];

router.get('/orders', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { status, search } = req.query;

    let ordersQuery = supabase
      .from('orders')
      .select(`*, order_items!order_items_order_id_fkey(id, quantity, mrp, discount_percentage, discount_amount, line_total, products!order_items_product_id_fkey(product_code, name))`)
      .order('order_date', { ascending: false })
      .limit(limit);
    if (status) ordersQuery = ordersQuery.eq('status', status);

    const { data: orders, error } = await ordersQuery;
    if (error) throw error;

    const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
    let customerMap = {};
    let workshopCustomerIds = new Set();

    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, customer_code, name, phone, city, address, segment, customer_grade')
        .in('id', customerIds);
      if (customers) customers.forEach(c => { customerMap[c.id] = c; });

      const { data: workshops } = await supabase
        .from('workshop_customers')
        .select('customer_id')
        .in('customer_id', customerIds);
      if (workshops) workshops.forEach(w => { if (w.customer_id) workshopCustomerIds.add(w.customer_id); });
    }

    let result = orders.map(o => {
      const cust = customerMap[o.customer_id] || {};
      const items = (o.order_items || []).map(item => {
        const mrp = Number(item.mrp) || 0;
        return {
          ...item,
          unit_price: mrp,
          price_excl_vat: Math.round((mrp / 1.13) * 100) / 100,
          vat_amount: Math.round((mrp - mrp / 1.13) * 100) / 100,
          vat_rate: 13,
        };
      });
      const totalAmount = Number(o.total_amount) || 0;
      return {
        ...o,
        order_items: items,
        customer_name: cust.name || 'Unknown',
        customer_phone: cust.phone || null,
        customer_city: cust.city || null,
        customer_address: cust.address || null,
        customer_segment: cust.segment || null,
        customer_grade: cust.customer_grade || null,
        customer_code: cust.customer_code || null,
        is_workshop: workshopCustomerIds.has(o.customer_id),
        total_excl_vat: Math.round((totalAmount / 1.13) * 100) / 100,
        total_vat: Math.round((totalAmount - totalAmount / 1.13) * 100) / 100,
      };
    });

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        (o.order_number || '').toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.customer_phone || '').includes(q)
      );
    }

    res.json({ success: true, orders: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/orders/:id/status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });
    if (!VALID_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID_ORDER_STATUSES.join(', ')}` });
    }
    const { data, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, order: data });

    // Fire-and-forget: notify customer of status change
    if (data.customer_id && data.order_number) {
      supabase
        .from('customers')
        .select('phone')
        .eq('id', data.customer_id)
        .single()
        .then(({ data: cust }) => {
          if (cust?.phone) {
            sendOrderStatusNotification(cust.phone, data.order_number, status, {
              expected_delivery_days: data.expected_delivery_days || '2-5'
            });
          }
        })
        .catch(err => console.error('Status notification lookup error:', err.message));
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/orders/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_status, notes } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (payment_status !== undefined) updates.payment_status = payment_status;
    if (notes !== undefined) updates.notes = notes;
    if (Object.keys(updates).length === 1) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }
    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, order: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - CONVERSATIONS
// ==========================================

router.get('/conversations', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const { data: conversations, error } = await supabase.from('conversation_logs').select('*').order('timestamp', { ascending: false }).limit(limit);
    if (error) throw error;

    const phones = [...new Set(conversations.map(c => c.phone_number).filter(Boolean))];
    let phoneMap = {};
    if (phones.length > 0) {
      const { data: customers } = await supabase.from('customers').select('phone, name').in('phone', phones);
      if (customers) customers.forEach(c => { phoneMap[c.phone] = c.name; });
    }

    const convsWithNames = conversations.map(c => ({ ...c, customer_name: phoneMap[c.phone_number] || null }));
    res.json({ success: true, conversations: convsWithNames });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - BOT CONFIG
// ==========================================

router.get('/config', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('bot_config').select('*').order('id');
    if (error) throw error;
    res.json({ success: true, config: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/config/:key', adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const { data, error } = await supabase
      .from('bot_config')
      .update({ config_value: value, updated_at: new Date().toISOString(), updated_by: req.adminUser?.name || 'admin' })
      .eq('config_key', key)
      .select()
      .single();
    if (error) throw error;
    await reloadConfig();
    res.json({ success: true, updated: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reload-config', adminAuth, async (req, res) => {
  try {
    const config = await reloadConfig();
    res.json({ success: true, message: 'Config reloaded', keys: Object.keys(config) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - PRODUCTS (CRUD)
// ==========================================

router.get('/products', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name');
    if (error) throw error;
    res.json({ success: true, products: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/products', adminAuth, async (req, res) => {
  try {
    const { product_code, name, category, description, vehicle_make, vehicle_model, mrp_inr, stock_quantity } = req.body;
    if (!product_code || !name) return res.status(400).json({ success: false, error: 'Product code and name are required' });
    const { data, error } = await supabase.from('products').insert({
      product_code, name, category, description, vehicle_make, vehicle_model,
      mrp_inr: mrp_inr || 0, stock_quantity: stock_quantity || 0, is_active: true
    }).select().single();
    if (error) throw error;
    res.json({ success: true, product: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { product_code, name, category, description, vehicle_make, vehicle_model, mrp_inr, stock_quantity } = req.body;
    const { data, error } = await supabase.from('products').update({
      product_code, name, category, description, vehicle_make, vehicle_model,
      mrp_inr: mrp_inr || 0, stock_quantity: stock_quantity || 0
    }).eq('id', id).select().single();
    if (error) throw error;
    res.json({ success: true, product: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
    if (error) throw error;
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - PDF CATALOGUE UPLOAD
// ==========================================

router.post('/upload-catalogue', adminAuth, (req, res) => {
  catalogueUpload.array('files', 20)(req, res, async (multerErr) => {
    if (multerErr) {
      const msg = multerErr.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 50MB)' : multerErr.message;
      return res.status(400).json({ success: false, error: msg });
    }
    try {
      const files = req.files;
      if (!files || files.length === 0) return res.status(400).json({ success: false, error: 'No files uploaded. Accepted: .pdf, .xlsx, .xls, .csv' });

      const results = [];
      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.pdf') {
          try {
            const data = await pdfParse(file.buffer);
            results.push({ filename: file.originalname, type: 'pdf', text: data.text, pages: data.numpages });
          } catch (pdfErr) {
            results.push({ filename: file.originalname, type: 'pdf', text: '', pages: 0, error: `Could not extract text: ${pdfErr.message}.` });
          }
        } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
          try {
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            let allRows = [];
            for (const sheetName of workbook.SheetNames) {
              allRows = allRows.concat(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }));
            }
            results.push({ filename: file.originalname, type: ext.replace('.', ''), rows: allRows, rowCount: allRows.length });
          } catch (xlsErr) {
            return res.status(400).json({ success: false, error: `Failed to read ${file.originalname}: ${xlsErr.message}` });
          }
        }
      }
      res.json({ success: true, files: results });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

router.post('/parse-catalogue', adminAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, error: 'No text provided' });

    const systemPrompt = `You are a product data extractor for a vehicle spare parts database. Extract ALL products from this catalogue text into a JSON array. Each product should have:
- product_code: the part number (ZF PN, TRW PN, IP Ref, etc.)
- name: product description/name
- category: product category (e.g., Steering & Suspension, Brake Pads, Piston Assembly, Connecting Rod, Valve, Camshaft, Rocker Arm, Steering Cone Set, Cylinder Block Kit)
- brand: manufacturer brand (e.g., Lemförder, TRW, IPL)
- mrp: MRP price as number
- unit_of_measure: content/quantity unit (e.g., 1 NOS, 2 NOS, Set)
- vehicle_make: vehicle manufacturer (e.g., Maruti Suzuki, Tata, Honda, Bajaj)
- vehicle_model: specific vehicle model (e.g., Swift, Wagon R, Pulsar 150)
- oem_number: HSN code if available
- supplier_name: supplier company name
Return ONLY valid JSON array, no markdown.`;

    const words = text.split(/\s+/);
    const CHUNK_SIZE = 3000;
    const chunks = [];
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      chunks.push(words.slice(i, i + CHUNK_SIZE).join(' '));
    }

    let allProducts = [];
    for (const chunk of chunks) {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: chunk }]
      });
      const responseText = message.content[0].text;
      try {
        const products = JSON.parse(responseText);
        if (Array.isArray(products)) allProducts = allProducts.concat(products);
      } catch (parseErr) {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          try {
            const products = JSON.parse(jsonMatch[0]);
            if (Array.isArray(products)) allProducts = allProducts.concat(products);
          } catch (e) { console.error('Failed to parse chunk response:', e.message); }
        }
      }
    }

    const seen = new Map();
    allProducts.forEach(p => { if (p.product_code && !seen.has(p.product_code)) seen.set(p.product_code, p); });
    res.json({ success: true, products: Array.from(seen.values()), chunks: chunks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/import-products', adminAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const { products } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) return res.status(400).json({ success: false, error: 'No products to import' });

    const rows = products.map(p => ({
      product_code: p.product_code,
      name: p.name || '',
      description: p.description || '',
      category: p.category || '',
      brand: p.brand || '',
      mrp_inr: Number(p.mrp_inr) || 0,
      unit_of_measure: p.unit_of_measure || '',
      vehicle_make: p.vehicle_make || '',
      vehicle_model: p.vehicle_model || '',
      oem_number: p.oem_number || '',
      supplier_name: p.supplier_name || '',
      is_active: true
    }));

    const { data, error } = await supabase.from('products').upsert(rows, { onConflict: 'product_code' }).select();
    if (error) throw error;

    // Auto-embed all upserted products
    const unembedded = data.filter(p => !p.embedding);
    if (unembedded.length > 0) {
      console.log(`🔄 Embedding ${unembedded.length} new/updated products...`);
      for (const product of unembedded) {
        try {
          const text = `${product.name} ${product.brand || ''} ${product.product_code} ${product.category || ''}`.trim();
          const embedding = await getEmbedding(text);
          await supabase.from('products').update({ embedding }).eq('id', product.id);
        } catch (embedErr) {
          console.error(`⚠️ Embedding failed for ${product.name}:`, embedErr.message);
        }
      }
      console.log('✅ Bulk embedding complete');
    }

    res.json({ success: true, imported: data?.length || rows.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/export-products-excel', adminAuth, (req, res) => {
  try {
    const { products } = req.body;
    if (!products || !products.length) return res.status(400).json({ success: false, error: 'No products to export' });

    const headers = ['product_code', 'name', 'description', 'category', 'brand', 'mrp_inr', 'unit_of_measure', 'vehicle_make', 'vehicle_model', 'oem_number', 'supplier_name'];
    const exportData = products.map(p => { const row = {}; headers.forEach(h => { row[h] = p[h] ?? ''; }); return row; });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=catalogue-products.xlsx');
    res.send(Buffer.from(buf));
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - LEADS
// ==========================================

router.get('/leads', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, leads: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/leads/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, assigned_to } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;
    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, lead: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ADMIN - TOKEN USAGE
// ==========================================

router.get('/token-usage', adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const defaultMonth = now.toISOString().slice(0, 7);
    const month = req.query.month || defaultMonth;

    const { data, error } = await supabase
      .from('customer_token_usage')
      .select('customer_id, month_year, input_tokens, output_tokens, estimated_cost_npr, technical_queries')
      .eq('month_year', month)
      .order('estimated_cost_npr', { ascending: false });

    if (error) throw error;

    const customerIds = (data || []).map(r => r.customer_id).filter(Boolean);
    let customerMap = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, phone, customer_grade')
        .in('id', customerIds);
      if (customers) customers.forEach(c => { customerMap[c.id] = c; });
    }

    // Also check workshop grades
    let workshopGradeMap = {};
    if (customerIds.length > 0) {
      const { data: workshops } = await supabase
        .from('workshop_customers')
        .select('customer_id, workshop_grade')
        .in('customer_id', customerIds);
      if (workshops) workshops.forEach(w => { workshopGradeMap[w.customer_id] = w.workshop_grade; });
    }

    const rows = (data || []).map(r => {
      const cust = customerMap[r.customer_id] || {};
      const workshopGrade = workshopGradeMap[r.customer_id] || null;
      return {
        customer_id: r.customer_id,
        customer_name: cust.name || 'Unknown',
        customer_phone: cust.phone || null,
        customer_grade: cust.customer_grade || null,
        workshop_grade: workshopGrade,
        effective_grade: workshopGrade || cust.customer_grade || null,
        month_year: r.month_year,
        input_tokens: r.input_tokens || 0,
        output_tokens: r.output_tokens || 0,
        total_tokens: (r.input_tokens || 0) + (r.output_tokens || 0),
        estimated_cost_npr: parseFloat(r.estimated_cost_npr || 0),
        technical_queries: r.technical_queries || 0
      };
    });

    res.json({ success: true, month, count: rows.length, usage: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/token-usage/summary', adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const defaultMonth = now.toISOString().slice(0, 7);
    const month = req.query.month || defaultMonth;

    const { data, error } = await supabase
      .from('customer_token_usage')
      .select('customer_id, input_tokens, output_tokens, estimated_cost_npr, technical_queries')
      .eq('month_year', month);

    if (error) throw error;

    const rows = data || [];
    const totalCost = rows.reduce((sum, r) => sum + parseFloat(r.estimated_cost_npr || 0), 0);
    const totalInputTokens = rows.reduce((sum, r) => sum + (r.input_tokens || 0), 0);
    const totalOutputTokens = rows.reduce((sum, r) => sum + (r.output_tokens || 0), 0);
    const totalTechnical = rows.reduce((sum, r) => sum + (r.technical_queries || 0), 0);
    const avgCost = rows.length > 0 ? totalCost / rows.length : 0;

    // Top 5 customers by cost
    const top5 = [...rows]
      .sort((a, b) => parseFloat(b.estimated_cost_npr) - parseFloat(a.estimated_cost_npr))
      .slice(0, 5);
    const top5Ids = top5.map(r => r.customer_id).filter(Boolean);
    let top5Map = {};
    if (top5Ids.length > 0) {
      const { data: custs } = await supabase.from('customers').select('id, name, phone').in('id', top5Ids);
      if (custs) custs.forEach(c => { top5Map[c.id] = c; });
    }
    const top5Customers = top5.map(r => ({
      customer_id: r.customer_id,
      name: top5Map[r.customer_id]?.name || 'Unknown',
      phone: top5Map[r.customer_id]?.phone || null,
      estimated_cost_npr: parseFloat(r.estimated_cost_npr || 0),
      technical_queries: r.technical_queries || 0
    }));

    res.json({
      success: true,
      month,
      summary: {
        total_cost_npr: parseFloat(totalCost.toFixed(2)),
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens,
        total_technical_queries: totalTechnical,
        avg_cost_per_customer: parseFloat(avgCost.toFixed(2)),
        customer_count: rows.length,
        top_5_customers: top5Customers
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve admin dashboard
router.use('/dashboard', express.static(path.join(__dirname, '..', 'admin')));

module.exports = router;
