# Botpress Setup Guide

## Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Code editor (VS Code recommended)
- Basic JavaScript knowledge

## Step 1: Install Botpress CLI

**Using npm:**
```bash
npm install -g @botpress/cli
```

**Using yarn:**
```bash
yarn global add @botpress/cli
```

## Step 2: Initialize Botpress Project

1. Navigate to the botpress folder:
```bash
cd botpress
```

2. Initialize new bot:
```bash
bp init
```

3. Follow the interactive prompts to configure your bot

## Step 3: Configure Bot Settings

1. Open `botpress/bot.config.json`
2. Update bot name: `vehicle-parts-chatbot`
3. Set language: `en` (English) and `ne` (Nepali)
4. Configure webhook URL for WhatsApp integration

## Step 4: Install Required Modules
```bash
bp install @botpress/channel-whatsapp
bp install @botpress/analytics
bp install @botpress/nlu
```

## Step 5: Start Development Server
```bash
bp start
```

Access the bot at: `http://localhost:3000`

## Troubleshooting

**Port already in use:**
```bash
bp start --port 3001
```

**Module installation fails:**
- Check Node.js version: `node --version`
- Clear npm cache: `npm cache clean --force`
- Try reinstalling: `npm install`

## Next Steps

- Configure flows in Botpress Studio
- Set up NLU (Natural Language Understanding)
- Connect to WhatsApp Business API

---

*Detailed instructions will be added in Phase 2.*