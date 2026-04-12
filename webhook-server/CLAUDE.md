# ViJJI Project — Claude Code Instructions

This file is auto-read by Claude Code at the start of every session.

---

## Bot Identity

- Name: **ViJJI** (capital V, capital JJ, capital I)
- Always say `"Hello, I am ViJJI!"` — never `"vijji.ai"`
- Refer to the bot as `ViJJI` in all code, prompts, and UI
- Supports: Hindi, Nepali, English

---

## Project Overview

WhatsApp + Web AI chatbot for vehicle spare parts (India & Nepal markets).

- VPS: 147.93.20.37 (Hostinger, 8GB RAM, 2GB swap — respect memory limits)
- Backend domain: `api.vijji.ai`
- Frontend (chat): `chat.vijji.ai`
- Marketing site: `www.vijji.ai` — hosted on **Vercel**, NOT Dokku

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, Express |
| Primary AI | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| Routing | aiRouter.js — fast vector search path + Claude |
| Database | Supabase PostgreSQL (`db.gytvgcnrnnffjgxjtndz.supabase.co`) |
| Messaging | WhatsApp Business API (Meta Cloud) |
| Auth | Firebase Admin SDK (`vijji-be89a`) + JWT + SHA256 chat token |
| Voice STT | OpenAI Whisper (`whisper-1`) via `voiceTranscriber.js` |
| Voice TTS | Google Cloud TTS (Hindi/English) + OpenAI TTS fallback (Nepali) |
| Embeddings | NVIDIA NIM `nvidia/nv-embedqa-e5-v5` via `embeddingService.js` |
| Deploy | Dokku |
| Mobile | Capacitor 8 + Android (`/root/vijji-app/`) — NOT deployed via Dokku |

> **Ollama has been removed from the VPS.** `aiRouter.js` still contains Ollama code but it is
> disabled at runtime unless `OLLAMA_URL` env var is set to a valid URL. Do NOT re-enable or
> reference Ollama in new code.

---

## Key Files

```
webhook-server/
├── index.js                  # Express setup, CORS, health, /open deep-link, /api/transcribe, route mounting
├── aiRouter.js               # Message routing: fast vector search path → Claude; Ollama code disabled
├── handleConversation.js     # Claude API call + tool execution loop
├── promptBuilder.js          # buildSystemPrompt(), claudeTools (10 tools), loadConfig(), trackTokenUsage()
├── toolHandlers.js           # processToolCall() — 10 tool implementations
├── conversationManager.js    # Session, customer lookup, phone normalization, history
├── productService.js         # searchProducts(), searchWorkshops() — vector + keyword fallback
├── orderService.js           # addToCart(), createOrder(), checkStockForCart(), decrementStock()
├── knowledgeBase.js          # Local terms/typos — saveKnowledge(), lookupKnowledge()
├── embeddingService.js       # getEmbedding() — see EMBEDDING RULES
├── voiceTranscriber.js       # transcribeAudio() via OpenAI Whisper, 15s timeout
├── notifications.js          # sendOrderConfirmation(), sendWhatsAppText() — best-effort, never throw
├── shared.js                 # Singleton exports: supabase, anthropic, CUSTOMER_CARE_PHONE
├── utils/classifier.js       # classifyMessage(), isSimpleProductQuery(), aiStats
├── routes/webhookRoutes.js   # WhatsApp webhook, rate limiting (10 msg/60s/user), lead gate
├── routes/chatRoutes.js      # Web chat API, JWT/Firebase auth, TTS helper, /api/chatbot-test/*
├── routes/adminRoutes.js     # Admin dashboard
└── scripts/
    ├── embedAllProducts.js   # Batch embedding job (PAGE_SIZE=200 to avoid OOM)
    └── fetchProductImages.js # Google image fetch → Supabase storage (DO NOT auto-run)
```

> **Obsolete references** (no longer exist): `claudeOrchestrator.js`, `databaseHelpers.js`

---

## Claude Tools (defined in promptBuilder.js)

1. `search_products` — search by vehicle/category/code/OEM/brand/keyword
2. `search_workshops` — find garages by location
3. `add_to_cart` — add product to session cart
4. `view_cart` — show current cart
5. `place_order` — confirm order, handles partial stock decisions
6. `check_order_status` — look up an order by number
7. `get_my_orders` — customer order history
8. `get_product_image` — fetch product image URL
9. `bulk_search_products` — search up to 10 items at once
10. `learn_product_term` / `lookup_knowledge` — self-learning knowledge base

---

## Database Tables (Supabase)

| Table | Purpose |
|-------|---------|
| `customers` | phone, name, customer_code, city, grade, discount, credit_limit, balance |
| `products` | product_code, name, brand, oem_number, category, vehicle_make/model, mrp, mrp_npr, stock_quantity, segment |
| `workshops` | name, city, district, zone, owner_name |
| `workshop_customers` | VIEW: workshop_phone, mechanic_phone, segment, grade |
| `orders` | order_number, customer_id, subtotal, total_amount, status, payment_status |
| `order_items` | order_id, product_id, quantity, mrp, discount, line_total |
| `conversation_logs` | session_id, phone, message_type, message_text, timestamp |
| `chatbot_sessions` | phone, customer_id, context (JSON), is_active, last_activity |
| `bot_config` | config_key/value/type — 5-min cache in promptBuilder |
| `product_knowledge` | type, input_term, mapped_to, confidence — self-learning terms |
| `admin_users` | name, email, password_hash, role (super_admin/admin/viewer) |
| `leads` | phone, raw_message, status (new/contacted/converted) |
| `customer_token_usage` | monthly token cost tracking per customer |
| `customer_tokens` | deep-link auth tokens (phone, token, expires_at) |
| `link_clicks` | deep-link click analytics |

**RPC functions:**
- `search_products_vector(query_embedding, match_count)` — current vector search (OpenAI embeddings)
- `match_products_nim(query_embedding, match_count)` — **target RPC** after NIM migration
- `upsert_token_usage(...)` — monthly cost upsert
- `decrement_stock(p_product_id, p_quantity)` — atomic stock decrement

---

## Pricing Rules

| Market | Price Field | Notes |
|--------|-------------|-------|
| Nepal (+977) | `mrp_npr` | Formula: `MRP × 0.62 × (1+tariff%) × 1.04 × 1.15 × 1.6 ÷ 0.75` |
| India (+91) | `mrp` (INR) | Show INR with VAT |
| SaaS tenants | `mrp` (INR) | Default |

- Tariff rates from `AS_PriceList_with_tariff.xlsx`
- `fastProductSearch()` in aiRouter.js approximates NPR as `mrp × 1.6` when mrp_npr is null

---

## Phone Normalization (`conversationManager.js`)

- **Nepal:** returns 10-digit local format (e.g., `9851069717`) or `+977XXXXXXXXXX`
- **India:** returns E.164 format `+91XXXXXXXXXX`
- DB has 854 rows with `+977`, 17 with `+91`, 3 non-standard — SQL fix prepared but **NOT YET APPLIED** (require user confirmation)

---

## Authentication

**WhatsApp:** phone number only (no token needed for webhook)

**Web Chat:**
- `X-Chat-Token` (SHA256 hash) + `X-Phone-Number` headers
  - Hash: `SHA256(phone_digits + '-vijji-chat-' + CHAT_ACCESS_CODE).substring(0, 32)`
  - `CHAT_ACCESS_CODE` defaults to `vijji2026test`
- OR `Authorization: Bearer <JWT>` — JWT payload: `{ phone, customerId, customerName }`
  - Signed with `JWT_SECRET` (required env var — server won't start without it)

**Admin:** session-based login via `admin_users` table (bcrypt passwords)

---

## Deploy

```bash
# Backend (api app) — note: master:main branch mapping
cd /root/vehicle-parts-chatbot && git push dokku master:main

# Frontend (chat app)
cd /root/chat-app && git push dokku main
```

**Rules:**
- Run Jest tests before EVERY deploy — this is a hard gate, not optional
- `dokku ps:restart` does NOT pick up file changes — must git push
- Config/env changes: `dokku config:set api KEY=VALUE` — no code changes needed

```bash
# Logs
dokku logs api -t

# Restart
dokku ps:restart api

# Set env var
dokku config:set api SOME_KEY=some_value
```

---

## EMBEDDING RULES — CRITICAL

> **Migration to NVIDIA NIM is complete.** Do NOT introduce new code using OpenAI embeddings.

- **Model:** NVIDIA NIM `nvidia/nv-embedqa-e5-v5` (1024-dim)
- **Column:** `embedding_nim` on the `products` table
- **RPC:** `match_products_nim()` with HNSW index
- **embeddingService.js** calls NIM via `process.env.NVIDIA_API_KEY`
- **Old RPC `search_products_vector`** (OpenAI-based) is no longer used — do not re-introduce it
- Always use `input_type="query"` when calling NIM for query embeddings
- **NEVER mix embedding models** in the same search — all vectors must be same model
- Embedding batch jobs: `PAGE_SIZE=200` to avoid OOM on this VPS
- Run long embedding jobs in `screen` sessions, log to file

---

## DATABASE RULES — CRITICAL

- Supabase instance: `db.gytvgcnrnnffjgxjtndz.supabase.co:5432`
- Supabase Pro on t4g.nano has severe IO limits
- **NEVER do bulk operations via Supabase REST API** — depletes IO budget, causes `57014` timeout errors
- Use direct `psql` or `psycopg2` for migrations and bulk work
- For HNSW index builds: temporarily upgrade Supabase to 8GB, then downgrade after
- Use `screen` sessions for long-running database operations

---

## Voice / STT / TTS

**Current STT:** OpenAI Whisper (`voiceTranscriber.js`) — 15s timeout
- Note: Deepgram Nova-2 was evaluated (sub-300ms, auto-detects Hindi/Nepali/English) and is the intended replacement

**Current TTS:** (`chatRoutes.js → generateTTS()`)
- Primary: Google Cloud TTS for Hindi (Devanagari detected) and English (~170ms)
- Fallback: OpenAI TTS for Nepali and everything else

**Rejected STT/TTS options (do not revisit):**
- Sarvam AI — no Nepali support
- MiniCPM-o — English/Chinese only, requires GPU
- Azure — no Nepali TTS in Mumbai region
- Groq/OpenAI STT routes — already removed

---

## AI Routing Flow (`aiRouter.js`)

```
Message in
    │
    ├─ isSimpleProductQuery()? ──► fastProductSearch() ──► vector search → format (no LLM, ~300ms)
    │                                      │ miss
    │                                      ▼
    └─ classifyMessage()
            │
            ├─ route=claude → handleConversation() (Claude Sonnet 4.6)
            └─ route=ollama → [DISABLED — OLLAMA_URL not set] → Claude fallback
```

- `OLLAMA_ENABLED` check: `process.env.OLLAMA_URL && OLLAMA_URL.startsWith('http')`
- **Ollama is removed from this VPS.** Do not set `OLLAMA_URL` in production.
- Timeout was 8000ms (code still present but irrelevant without Ollama)

---

## Product Import Pipeline

1. Raw Excel → enrich `vehicle_model` (3 layers: PDF catalogue, part number pattern decode, Division Desc)
2. `drop_duplicates` on Part No → filter existing Supabase codes (uppercase) → batch INSERT 500
3. Column mapping: `Part No → product_code + oem_number`, `Part Desc → name`, `Division Desc → category`, `HSN → description`

---

## WhatsApp Rate Limiting

- In-memory per-user: max 10 messages per 60-second window (webhookRoutes.js)
- 10 msgs/min/user limit also applies to outgoing notifications
- Cleanup interval: every 5 minutes

---

## Uptime Monitor

- Cron every 5 minutes: `monitor.sh` at `/root/monitor.sh`
- Sends WhatsApp alert on downtime

---

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `JWT_SECRET` | **YES** | Server won't start without it |
| `SUPABASE_URL` | YES | |
| `SUPABASE_SERVICE_KEY` | YES | Service role key |
| `CLAUDE_API_KEY` | YES | Anthropic |
| `OPENAI_API_KEY` | YES | Whisper STT + embeddings (current) |
| `WHATSAPP_API_URL` | YES | Meta Cloud API endpoint |
| `WHATSAPP_API_KEY` | YES | WhatsApp Business Account key |
| `GOOGLE_CLOUD_API_KEY` | YES | TTS synthesis |
| `GOOGLE_MAPS_API_KEY` | YES | Domain-restricted, safe to expose via `/api/config/public` |
| `CUSTOMER_CARE_PHONE` | YES | Default: `+977-9851069717` |
| `CHAT_ACCESS_CODE` | YES | Default: `vijji2026test` |
| `DEFAULT_ADMIN_PASSWORD` | no | Default: `admin123` (seed only) |
| `OLLAMA_URL` | no | Leave unset — Ollama removed from VPS |
| `PORT` | no | Default: 3000 |

---

## General Rules

- Never expose API keys or passwords in code
- `CUSTOMER_CARE_PHONE` is centralized via env var — never hardcode the number
- System prompt must say "You are ViJJI" not "vijji.ai"
- WhatsApp only for customer messaging (no email, SMS, etc.)
- VPS has 2GB swap — respect memory limits (PAGE_SIZE=200 for batch jobs)
- Use `screen` sessions for long-running operations
- Marketing site (`www.vijji.ai`) is on Vercel — not Dokku
