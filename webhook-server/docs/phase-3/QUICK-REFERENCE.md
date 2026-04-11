# Phase 3 Quick Reference Card

**Save this for quick access to instructions!**

---

## 📁 Where to Find Instructions

All guides are in: `/docs/phase-3/` folder in your project

```
vehicle-parts-chatbot-main/
└── docs/
    └── phase-3/
        ├── PHASE-3-MASTER-GUIDE.md      ← Start here!
        ├── step-3.1-webhook-setup.md    ← Current step
        ├── step-3.2-railway-deploy.md   ← Next
        ├── step-3.3-whatsapp-connect.md
        ├── step-3.4-claude-integrate.md
        ├── step-3.5-api-connect.md
        └── step-3.6-testing.md
```

---

## 🎯 How to Use

### **In Your Project:**
1. Open VS Code
2. Navigate to `docs/phase-3/`
3. Open the current step file
4. Follow instructions
5. Copy/paste code

### **In Chat:**
- Say **"Next step"** → I'll guide you through next step
- Say **"Help with step X"** → I'll help debug
- Say **"Show step X"** → I'll show that step's instructions
- Say **"Stuck"** → I'll troubleshoot with you

---

## ✅ Progress Tracker

Track your progress here:

```
Phase 3 Steps:

[ ] Step 3.1: Setup Webhook Server (1 hour)
    └─ Create webhook-server folder
    └─ Install dependencies
    └─ Create .env with API keys
    └─ Write index.js
    └─ Test locally

[ ] Step 3.2: Deploy to Railway (30 min)
    └─ Create Railway account
    └─ Deploy webhook server
    └─ Get public URL
    └─ Test deployment

[ ] Step 3.3: Connect WhatsApp (30 min)
    └─ Configure 360Dialog webhook
    └─ Test message reception
    └─ Verify end-to-end

[ ] Step 3.4: Integrate Claude AI (1 hour)
    └─ Add intent detection
    └─ Add product search
    └─ Test conversations

[ ] Step 3.5: Connect to Your API (1 hour)
    └─ Link to Express API
    └─ Test discount calc
    └─ Test orders

[ ] Step 3.6: End-to-End Testing (1 hour)
    └─ Test all flows
    └─ Monitor costs
    └─ Deploy to production
```

---

## 🔑 Key Commands

### **Start Webhook Server:**
```bash
cd /c/Projects/GitHub/vehicle-parts-chatbot-main/webhook-server
npm start
```

### **Test Health Check:**
```bash
curl http://localhost:3000/health
```

### **Test Webhook:**
```bash
curl -X POST http://localhost:3000/whatsapp-webhook \
  -H "Content-Type: application/json" \
  -d '{"from": "+9779841234567", "text": "Hello"}'
```

### **Deploy to Railway:**
```bash
railway login
railway init
railway up
```

### **View Logs:**
```bash
railway logs
```

---

## 🆘 Quick Troubleshooting

**Server won't start:**
```bash
cd webhook-server
npm install
# Check .env file has all keys
npm start
```

**Can't find customer:**
- Check phone number format: `+9779841234567`
- Verify customer exists in Supabase

**Claude not responding:**
- Check CLAUDE_API_KEY in .env
- Verify API key is valid at console.anthropic.com

**WhatsApp not sending:**
- Check WHATSAPP_API_KEY in .env
- Verify webhook URL is configured

---

## 📞 Current Step

**You are on:** Step 3.1 - Webhook Setup

**Instructions:** `docs/phase-3/step-3.1-webhook-setup.md`

**In chat, say:** "Next step" when ready!

---

## 💰 Budget Reminder

**Target:** $21/month (20 calls/day)
- WhatsApp: $14/month
- Claude: $7/month
- Railway: FREE
- Supabase: FREE

---

## 🎯 End Goal

**When Phase 3 is complete:**

```
Customer sends WhatsApp message
    ↓
Your webhook server receives it
    ↓
Claude understands and responds
    ↓
Customer gets personalized reply
    ↓
All logged in Supabase
```

**Working production chatbot! 🚀**

---

**Print this card or keep it open while working!** 📋
