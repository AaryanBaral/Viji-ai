# GitHub Setup Guide

## Prerequisites
- GitHub account
- Git or GitHub Desktop installed
- Basic understanding of version control

## Step 1: Clone Repository

**GitHub Desktop:**
1. File → Clone Repository
2. Select: vehicle-parts-chatbot-main
3. Choose local path
4. Click: Clone

**Command Line:**
```bash
git clone https://github.com/YOUR-USERNAME/vehicle-parts-chatbot-main.git
cd vehicle-parts-chatbot-main
```

## Step 2: Create .env File

Copy the template:
```bash
cp .env.example .env
```

Fill in your credentials (see Phase 2 for values).

## Step 3: Install Dependencies
```bash
npm install
```

## Step 4: Verify Setup
```bash
npm run lint  # Should pass
npm test      # Should pass (if tests exist)
```

## Troubleshooting

**Problem:** Git clone fails with authentication error
**Solution:** Set up SSH key or use Personal Access Token