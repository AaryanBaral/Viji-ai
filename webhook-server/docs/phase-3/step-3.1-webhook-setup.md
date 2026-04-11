# Step 3.1: Setup Webhook Server

**Time Required:** 1 hour  
**Difficulty:** Beginner  
**Status:** 📝 Ready to start

---

## 🎯 Objective

Create a webhook server that receives WhatsApp messages, processes them with Claude, and sends responses back.

---

## 📋 What You'll Create

```
webhook-server/
├── index.js              ← Main server file
├── package.json          ← Dependencies
├── .env                  ← API keys (don't commit!)
└── .gitignore           ← Ignore sensitive files
```

---

## 🚀 Step-by-Step Instructions

### **1. Create Webhook Folder (2 minutes)**

Open your terminal (Git Bash):

```bash
cd /c/Projects/GitHub/vehicle-parts-chatbot-main

# Create webhook-server folder
mkdir webhook-server
cd webhook-server

# Initialize npm project
npm init -y
```

**Expected output:**
```
Wrote to .../webhook-server/package.json
```

---

### **2. Install Dependencies (2 minutes)**

```bash
npm install express dotenv @anthropic-ai/sdk @supabase/supabase-js axios
```

**What each does:**
- `express` - Web server framework
- `dotenv` - Loads environment variables
- `@anthropic-ai/sdk` - Claude API
- `@supabase/supabase-js` - Database connection
- `axios` - HTTP requests to WhatsApp

**Expected output:**
```
added 125 packages
```

---

### **3. Create .env File (3 minutes)**

```bash
# Create .env file
touch .env
code .env
```

**Add this content (replace with YOUR keys):**

```env
# Supabase (from your existing project)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Claude API (from Anthropic console)
CLAUDE_API_KEY=sk-ant-api03-your-key-here

# WhatsApp API (from 360Dialog dashboard)
WHATSAPP_API_KEY=your-360dialog-key
WHATSAPP_API_URL=https://waba.360dialog.io/v1/messages

# Server Configuration
PORT=3000
NODE_ENV=development

# Your Express API URL (local for now)
API_BASE_URL=http://localhost:3000/api
```

**⚠️ Important:** Replace `your-project`, `your-key-here` with YOUR actual keys!

---

### **4. Create .gitignore (1 minute)**

```bash
touch .gitignore
code .gitignore
```

**Add this content:**

```
# Environment variables
.env
.env.local
.env.production

# Dependencies
node_modules/

# Logs
logs/
*.log

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
```

**Why:** Prevents committing sensitive API keys to GitHub!

---

### **5. Create Main Server File (10 minutes)**

```bash
touch index.js
code index.js
```

**Copy this complete code:**

```javascript
// webhook-server/index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.json());

// Initialize connections
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY
});

console.log('🔌 Initializing connections...');
console.log('✅ Supabase:', process.env.SUPABASE_URL ? 'Connected' : '❌ Missing');
console.log('✅ Claude:', process.env.CLAUDE_API_KEY ? 'Connected' : '❌ Missing');
console.log('✅ WhatsApp:', process.env.WHATSAPP_API_KEY ? 'Connected' : '❌ Missing');

// ==========================================
// HEALTH CHECK ENDPOINT
// ==========================================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        connections: {
            supabase: process.env.SUPABASE_URL ? '✅' : '❌',
            claude: process.env.CLAUDE_API_KEY ? '✅' : '❌',
            whatsapp: process.env.WHATSAPP_API_KEY ? '✅' : '❌'
        }
    });
});

// ==========================================
// WHATSAPP WEBHOOK ENDPOINT
// ==========================================
app.post('/whatsapp-webhook', async (req, res) => {
    try {
        console.log('📨 Received webhook:', JSON.stringify(req.body, null, 2));
        
        // Extract message data
        const { from, text, timestamp } = req.body;
        
        if (!from || !text) {
            console.log('⚠️  Invalid webhook data');
            return res.status(400).json({ error: 'Missing from or text' });
        }
        
        console.log(`💬 Message from ${from}: "${text}"`);
        
        // Process message
        const response = await handleMessage(from, text);
        
        console.log(`✅ Response: "${response}"`);
        
        // Send response back to WhatsApp
        await sendWhatsAppMessage(from, response);
        
        res.status(200).json({ success: true });
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// HANDLE MESSAGE LOGIC
// ==========================================
async function handleMessage(phone, message) {
    console.log(`🔍 Looking up customer: ${phone}`);
    
    // Get customer from Supabase
    const { data: customer, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .single();
    
    if (error || !customer) {
        console.log('⚠️  Customer not found');
        return "Welcome! I don't recognize your number. Please contact us to register.";
    }
    
    console.log(`✅ Found customer: ${customer.name} (${customer.customer_grade})`);
    
    // Ask Claude to respond
    const claudeResponse = await askClaude(customer, message);
    
    return claudeResponse;
}

// ==========================================
// ASK CLAUDE AI
// ==========================================
async function askClaude(customer, message) {
    console.log('🤖 Asking Claude...');
    
    const prompt = `
You are a helpful vehicle parts sales assistant.

CUSTOMER CONTEXT:
- Name: ${customer.name}
- Customer Code: ${customer.customer_code}
- Grade: ${customer.customer_grade}
- Discount: ${customer.base_discount_percentage}%
- Balance: Rs. ${customer.balance_lcy}

USER MESSAGE: "${message}"

Instructions:
1. Be friendly and professional
2. Mention their discount percentage if relevant
3. If they're asking for products, acknowledge and say you'll search
4. Keep responses concise (2-3 sentences)
5. Use their name naturally

Respond in a natural, conversational way.
`;

    const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [{
            role: 'user',
            content: prompt
        }]
    });
    
    const reply = response.content[0].text;
    console.log('✅ Claude responded');
    
    return reply;
}

// ==========================================
// SEND MESSAGE TO WHATSAPP
// ==========================================
async function sendWhatsAppMessage(to, message) {
    console.log(`📤 Sending to WhatsApp: ${to}`);
    
    try {
        const response = await axios.post(
            process.env.WHATSAPP_API_URL,
            {
                to: to,
                type: 'text',
                text: { body: message }
            },
            {
                headers: {
                    'D360-API-KEY': process.env.WHATSAPP_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ WhatsApp message sent');
        return response.data;
        
    } catch (error) {
        console.error('❌ WhatsApp send error:', error.response?.data || error.message);
        throw error;
    }
}

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║   🚀 WEBHOOK SERVER RUNNING           ║
╚═══════════════════════════════════════╝

Port: ${PORT}
Environment: ${process.env.NODE_ENV}

Endpoints:
- Health Check: http://localhost:${PORT}/health
- WhatsApp Webhook: http://localhost:${PORT}/whatsapp-webhook

Connections:
- Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌'}
- Claude API: ${process.env.CLAUDE_API_KEY ? '✅' : '❌'}
- WhatsApp API: ${process.env.WHATSAPP_API_KEY ? '✅' : '❌'}

Ready to receive messages! 📨
`);
});
```

---

### **6. Update package.json (2 minutes)**

```bash
code package.json
```

**Add this to the "scripts" section:**

```json
{
  "name": "webhook-server",
  "version": "1.0.0",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@supabase/supabase-js": "^2.38.0",
    "axios": "^1.6.0",
    "dotenv": "^16.3.1",
    "express": "^4.18.2"
  }
}
```

---

### **7. Install nodemon for Development (Optional) (1 minute)**

```bash
npm install --save-dev nodemon
```

**What it does:** Auto-restarts server when you save files.

---

## 🧪 Testing Your Webhook Server

### **Test 1: Start the Server (1 minute)**

```bash
# Make sure you're in webhook-server folder
cd /c/Projects/GitHub/vehicle-parts-chatbot-main/webhook-server

# Start server
npm start
```

**Expected output:**
```
╔═══════════════════════════════════════╗
║   🚀 WEBHOOK SERVER RUNNING           ║
╚═══════════════════════════════════════╝

Port: 3000
...
Ready to receive messages! 📨
```

**✅ If you see this, SUCCESS!**

---

### **Test 2: Health Check (2 minutes)**

**Open another terminal:**

```bash
curl http://localhost:3000/health
```

**Expected output:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-27T...",
  "connections": {
    "supabase": "✅",
    "claude": "✅",
    "whatsapp": "✅"
  }
}
```

**✅ All three should show ✅**

---

### **Test 3: Simulate WhatsApp Message (5 minutes)**

**In another terminal:**

```bash
curl -X POST http://localhost:3000/whatsapp-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+9779841234567",
    "text": "Hello",
    "timestamp": "2025-10-27T10:00:00Z"
  }'
```

**Watch your server terminal!** You should see:
```
📨 Received webhook: ...
🔍 Looking up customer: +9779841234567
✅ Found customer: Ram Bahadur (LEO)
🤖 Asking Claude...
✅ Claude responded
📤 Sending to WhatsApp: +9779841234567
```

**Note:** The WhatsApp send might fail (that's OK for now - we'll fix in Step 3.3)

---

## ✅ Step 3.1 Completion Checklist

Before moving to Step 3.2, verify:

- [ ] `webhook-server/` folder created
- [ ] Dependencies installed (`node_modules/` exists)
- [ ] `.env` file created with YOUR API keys
- [ ] `.gitignore` file created
- [ ] `index.js` file created with complete code
- [ ] Server starts without errors (`npm start`)
- [ ] Health check returns all ✅
- [ ] Test webhook receives and logs messages
- [ ] Can see customer lookup in logs

---

## 🐛 Common Issues & Fixes

### **Issue 1: "Cannot find module 'express'"**
**Fix:**
```bash
cd webhook-server
npm install
```

### **Issue 2: "SUPABASE_URL is undefined"**
**Fix:**
- Check `.env` file exists in `webhook-server/` folder
- Verify no typos in variable names
- Restart server after editing `.env`

### **Issue 3: "Customer not found"**
**Fix:**
- Use a phone number that exists in your Supabase customers table
- Check phone format matches exactly (with +977 prefix)

### **Issue 4: Port 3000 already in use**
**Fix:**
```bash
# Change PORT in .env to 3001
PORT=3001
```

---

## 📸 Screenshots to Verify

**Your terminal should look like this:**

```
[Terminal 1 - Server running]
🚀 WEBHOOK SERVER RUNNING
Ready to receive messages! 📨

[Terminal 2 - Testing]
$ curl http://localhost:3000/health
{"status":"ok", "connections": {...}}
```

---

## 🎯 What You've Accomplished

✅ Created webhook server from scratch  
✅ Connected to Supabase (customer data)  
✅ Connected to Claude AI (intelligence)  
✅ Connected to WhatsApp API (messaging)  
✅ Tested basic message flow  

**You can now receive messages, recognize customers, and get Claude responses!**

---

## ➡️ Next Step

**Ready for Step 3.2?**

In the chat, say: **"Next step"** or **"Start Step 3.2"**

We'll deploy this webhook server to Railway so it has a public URL that WhatsApp can reach!

---

## 💾 Commit Your Progress

Before moving on:

```bash
cd /c/Projects/GitHub/vehicle-parts-chatbot-main

git add webhook-server/
git commit -m "Add webhook server for WhatsApp + Claude + Supabase integration"
git push origin main
```

**Great job! You're making real progress!** 🚀
