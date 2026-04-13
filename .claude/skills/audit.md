# Skill: Audit (ViJJI System Health)

Run before making changes or after a deploy to verify system state.

---

## Quick Audit (2 min)

```bash
# 1. Dokku apps running?
dokku ps:report api | grep -E "Status|Running"
dokku ps:report chat | grep -E "Status|Running"

# 2. API health endpoint
curl -s https://api.vijji.ai/health

# 3. Frontend loads?
curl -s -o /dev/null -w "Frontend HTTP: %{http_code}\n" https://vijji.ai

# 4. Disk space (VPS has limited storage)
df -h / | tail -1

# 5. Memory (2GB swap — watch usage)
free -h | head -2
```

---

## Deep Audit

```bash
# SSL certs
dokku letsencrypt:list

# Recent backend errors (last 50 logs)
dokku logs api --num 50 | grep -i "error\|fail\|crash\|FATAL" | tail -10

# Recent frontend errors
dokku logs chat --num 20 | grep -i "error" | tail -5

# Git status (uncommitted changes?)
echo "--- Backend ---"
cd /root/vehicle-parts-chatbot && git status --short
echo "--- Frontend ---"
cd /root/chat-app-v2 && git status --short

# Check uptime monitor cron
crontab -l | grep monitor

# Monitor script
cat /root/monitor.sh
```

---

## Supabase Health

```bash
# Direct DB connection test
psql "postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres" \
  -c "SELECT COUNT(*) as products FROM products; SELECT COUNT(*) as customers FROM customers;" 2>&1 | tail -10

# Active sessions in last 2 hours
psql "postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres" \
  -c "SELECT COUNT(*) FROM chatbot_sessions WHERE updated_at > NOW() - INTERVAL '2 hours';"
```

See `/skill supabase` for more DB queries.

---

## LLM / Embedding Services

```bash
# Check NIM API key is set
dokku config api | grep -E "NVIDIA|CLAUDE|OPENAI" | sed 's/=.*/=***/'

# Last embedding or LLM call in logs
dokku logs api --num 100 | grep -i "embed\|NIM\|nvidia\|claude" | tail -5

# Voice transcription calls
dokku logs api --num 100 | grep -i "whisper\|transcrib" | tail -5
```

---

## WhatsApp

```bash
# Recent WhatsApp webhook activity
dokku logs api --num 50 | grep "webhook\|whatsapp" | tail -10

# Rate limit hits
dokku logs api --num 100 | grep "rate limit" | tail -5
```

---

## Related Skills

- **`/skill deploy`** — run after audit if deploy is needed
- **`/skill debug-chat`** — if audit reveals chat issues
- **`/skill supabase`** — for deeper DB diagnostics
