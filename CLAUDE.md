# ViJJI Backend — Claude Code Context

> Full project instructions: `webhook-server/CLAUDE.md`
> This file provides the project-root quick reference.

---

## Project Identity

- **App name:** ViJJI (vehicle spare parts AI chatbot — India & Nepal)
- **Repo root:** `/root/vehicle-parts-chatbot/`
- **Live API:** https://api.vijji.ai
- **VPS:** 147.93.20.37 (Hostinger, 8GB RAM, 2GB swap)

---

## Key Directories

```
/root/vehicle-parts-chatbot/
├── webhook-server/          # All application code (Node.js 20)
│   ├── CLAUDE.md            # ← Full code-level instructions (read this)
│   ├── index.js             # Express entry point
│   ├── aiRouter.js          # Routing: fast vector → Claude
│   ├── handleConversation.js
│   ├── promptBuilder.js     # System prompt + 10 Claude tools
│   ├── toolHandlers.js
│   ├── routes/
│   │   ├── webhookRoutes.js # WhatsApp webhook
│   │   ├── chatRoutes.js    # Web chat API + JWT auth
│   │   └── adminRoutes.js
│   └── scripts/
│       ├── embedAllProducts.js    # NIM embedding batch job
│       └── fetchProductImages.js  # DO NOT auto-run
├── .claude/
│   └── skills/              # Project-scoped skills (see below)
├── Procfile                 # web: node webhook-server/index.js
└── package.json
```

---

## Deploy (Backend Only)

```bash
cd /root/vehicle-parts-chatbot
git add -A
git commit -m "your message"
git push dokku master:main
```

- `dokku ps:restart api` does NOT pick up file changes — must git push
- Run Jest tests first: `cd webhook-server && npm test`
- Verify after: `curl -s https://api.vijji.ai/health`

---

## Skills Available (project-scoped)

Run these with `/skill <name>` from inside this project directory:

| Skill | Purpose |
|-------|---------|
| `deploy` | Deploy backend to Dokku with pre/post checks |
| `audit` | System health check (apps, SSL, disk, memory, logs) |
| `debug-chat` | Diagnose chat/WhatsApp/API issues |
| `product-import` | Bulk product import pipeline (TATA, Suzuki, etc.) |
| `supabase` | DB query patterns, bulk ops, schema reference |

> Skills interconnect: `deploy` calls `audit` post-deploy; `debug-chat` uses `supabase` queries.

---

## Supabase

- Project: `gytvgcnrnnffjgxjtndz` (Mumbai ap-south-1)
- Direct DB: `postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres`
- Use **direct psql** for bulk ops — REST API depletes IO budget
- Key tables: `customers`, `products`, `orders`, `order_items`, `conversation_logs`, `chatbot_sessions`, `bot_config`, `leads`

---

## Critical Rules

1. **Never re-enable Ollama** — removed from VPS, `OLLAMA_URL` must stay unset
2. **Embeddings = NIM only** — `nvidia/nv-embedqa-e5-v5`, RPC `match_products_nim()`
3. **No bulk REST API calls** — use psql for >100 row operations
4. **Tests before deploy** — hard gate, not optional
5. **screen sessions** for long-running jobs (embedding, DB migration)
6. **JWT_SECRET required** — server won't start without it
