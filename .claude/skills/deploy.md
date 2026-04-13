# Skill: Deploy (ViJJI Backend)

**Project root:** `/root/vehicle-parts-chatbot/`
**Dokku app:** `api` → https://api.vijji.ai
**Branch mapping:** `master` → `main` on Dokku

---

## Pre-Deploy Checklist

```bash
# 1. Run tests — HARD GATE, do not skip
cd /root/vehicle-parts-chatbot/webhook-server
npm test

# 2. Quick health check (→ see audit skill)
dokku ps:report api | grep -E "Status|Running"
curl -s https://api.vijji.ai/health
```

---

## Deploy Backend

```bash
cd /root/vehicle-parts-chatbot
git add -A
git commit -m "your message"
git push dokku master:main
```

Watch logs during deploy:
```bash
dokku logs api -t
```

---

## Post-Deploy Verification

```bash
# Health check
curl -s https://api.vijji.ai/health

# Check last 20 log lines for errors
dokku logs api --num 20 | grep -i "error\|crash\|fail" | tail -5

# Verify chatbot config endpoint
curl -s https://api.vijji.ai/api/config/public | python3 -m json.tool | head -10
```

Run full audit if anything looks wrong → `/skill audit`

---

## Deploy Frontend (from this VPS)

```bash
cd /root/chat-app-v2
npm run build
git add -A
git commit -m "your message"
git push dokku main
```

Verify: `curl -s -o /dev/null -w "%{http_code}" https://vijji.ai`

---

## Rollback Backend

```bash
cd /root/vehicle-parts-chatbot
git log --oneline -5         # pick the commit to revert to
git revert HEAD              # creates a new revert commit
git push dokku master:main
```

---

## Env Var Changes (no deploy needed)

```bash
dokku config:set api KEY=VALUE
# Takes effect immediately — no git push needed for env changes
```

Required env vars (server won't start without these):
- `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `CLAUDE_API_KEY`, `OPENAI_API_KEY`, `NVIDIA_API_KEY`
- `WHATSAPP_API_URL`, `WHATSAPP_API_KEY`
- `GOOGLE_CLOUD_API_KEY`, `CUSTOMER_CARE_PHONE`, `CHAT_ACCESS_CODE`

---

## Related Skills

- **`/skill audit`** — full system health check before/after deploy
- **`/skill debug-chat`** — if deploy succeeds but chat is broken
