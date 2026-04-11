# Skill: Debug Chat Issues (ViJJI)

Use when: chat not responding, wrong product results, auth errors, voice issues, order failures.

---

## Step 1 — Live Logs

```bash
# Stream live logs
dokku logs api -t

# Last 50 lines
dokku logs api --num 50 | tail -30

# Filter by phone number or session
dokku logs api --num 100 | grep "PHONE_OR_SESSION_ID"

# Errors only
dokku logs api --num 100 | grep -i "error\|fail\|crash\|FATAL"
```

---

## Step 2 — API Endpoint Tests

```bash
# Health
curl -s https://api.vijji.ai/health

# Public config (verify chatAccessCode + Google Maps key exists)
curl -s https://api.vijji.ai/api/config/public | python3 -m json.tool

# Get access code
ACCESS_CODE=$(curl -s https://api.vijji.ai/api/config/public | python3 -c "import sys,json; print(json.load(sys.stdin)['chatAccessCode'])")

# Verify chat access
curl -X POST https://api.vijji.ai/api/chat/verify \
  -H "Content-Type: application/json" \
  -d "{\"accessCode\":\"$ACCESS_CODE\"}"
```

---

## Step 3 — Auth Debug

**Web chat token (SHA256):**
```bash
# Token formula: SHA256(phone_digits + '-vijji-chat-' + CHAT_ACCESS_CODE)[0:32]
python3 -c "
import hashlib, sys
phone = '9851XXXXXX'       # 10-digit Nepal or +91XXXXXXXXXX India
code = 'vijji2026test'     # CHAT_ACCESS_CODE from env
raw = phone + '-vijji-chat-' + code
token = hashlib.sha256(raw.encode()).hexdigest()[:32]
print('X-Chat-Token:', token)
"

# JWT decode (no verify)
echo "JWT_HERE" | python3 -c "
import sys, base64, json
t = sys.stdin.read().strip().split('.')[1]
t += '=' * (4 - len(t) % 4)
print(json.dumps(json.loads(base64.b64decode(t)), indent=2))
"
```

---

## Step 4 — LLM / AI Router Debug

```bash
# Which path is being taken (fast vector vs Claude)
dokku logs api --num 100 | grep -E "fastProductSearch|classifyMessage|routeMessage|route=" | tail -10

# Claude API calls
dokku logs api --num 100 | grep -i "claude\|anthropic\|handleConversation" | tail -10

# Tool calls
dokku logs api --num 100 | grep -i "tool_use\|processToolCall" | tail -10

# NIM embedding calls
dokku logs api --num 100 | grep -i "embed\|NIM\|nvidia\|match_products_nim" | tail -10
```

---

## Step 5 — DB / Product Search Debug

```bash
# Check if product exists in DB
psql "postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres" \
  -c "SELECT product_code, name, brand, mrp, stock_quantity FROM products WHERE name ILIKE '%TERM%' LIMIT 5;"

# Check customer record
psql "postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres" \
  -c "SELECT phone, name, customer_code, grade FROM customers WHERE phone LIKE '%PHONE%';"

# Recent conversation logs for a phone
psql "postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres" \
  -c "SELECT session_id, message_type, message_text, timestamp FROM conversation_logs WHERE phone LIKE '%PHONE%' ORDER BY timestamp DESC LIMIT 20;"
```

See `/skill supabase` for more query patterns.

---

## Step 6 — Voice / Transcription Debug

```bash
# Recent transcription calls
dokku logs api --num 100 | grep -i "whisper\|transcrib\|voice\|audio" | tail -10

# TTS calls (Google + OpenAI fallback)
dokku logs api --num 100 | grep -i "TTS\|google.*tts\|openai.*tts" | tail -5
```

---

## Step 7 — WhatsApp Webhook Debug

```bash
# Incoming webhook events
dokku logs api --num 100 | grep "webhook" | tail -10

# Rate limit hits (10 msg/60s/user)
dokku logs api --num 100 | grep "rate limit" | tail -5

# Outgoing notifications
dokku logs api --num 100 | grep -i "notification\|sendWhatsApp" | tail -5
```

---

## Common Issues & Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No response to chat | Claude API key expired or rate-limited | Check `CLAUDE_API_KEY` in Dokku config |
| Products not found | NIM embeddings not indexed or wrong RPC | Check `match_products_nim()`, verify `embedding_nim` column populated |
| Auth failing | Wrong `CHAT_ACCESS_CODE` or expired JWT | Check env var, re-generate token |
| Voice not transcribing | OpenAI Whisper timeout (15s limit) | Check audio size, `OPENAI_API_KEY` |
| Slow responses | Fast vector path not triggering | Check `isSimpleProductQuery()` in `utils/classifier.js` |

---

## Related Skills

- **`/skill audit`** — check overall system health first
- **`/skill supabase`** — detailed DB queries for session/order/product issues
