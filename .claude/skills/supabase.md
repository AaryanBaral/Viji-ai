# Skill: Supabase Operations (ViJJI)

**Project:** `gytvgcnrnnffjgxjtndz` (Mumbai ap-south-1)
**Direct DB:** `postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres`

```bash
# Quick alias for this session
export DB="postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres"
psql "$DB"
```

---

## Rules

| DO | DON'T |
|----|-------|
| Use psql / psycopg2 for bulk ops | Use Supabase REST API for >100 rows |
| Batch 500 rows per INSERT | Use Supabase REST API for embedding writes |
| Run schema changes via psql | Run migrations in prod without backup |
| Use `screen` for long operations | Run large jobs without screen |

---

## Common Queries

```sql
-- Product counts by brand
SELECT brand, COUNT(*) FROM products GROUP BY brand ORDER BY count DESC;

-- Products missing NIM embeddings
SELECT COUNT(*) FROM products WHERE embedding_nim IS NULL;

-- Products by vehicle make
SELECT vehicle_make, COUNT(*) FROM products GROUP BY vehicle_make ORDER BY count DESC LIMIT 10;

-- Find a product
SELECT product_code, name, brand, mrp, mrp_npr, stock_quantity
  FROM products
  WHERE name ILIKE '%search term%' OR product_code ILIKE '%code%'
  LIMIT 10;
```

```sql
-- Recent orders
SELECT order_number, status, payment_status, total_amount, created_at
  FROM orders
  ORDER BY created_at DESC LIMIT 10;

-- Order details
SELECT oi.*, p.name, p.brand
  FROM order_items oi JOIN products p ON oi.product_id = p.id
  WHERE oi.order_id = (SELECT id FROM orders WHERE order_number = 'ORDER_NUMBER');
```

```sql
-- Customer lookup
SELECT phone, name, customer_code, city, grade, discount, credit_limit, balance
  FROM customers
  WHERE phone LIKE '%XXXXXXXX%';

-- Active chatbot sessions (last 2h)
SELECT phone, customer_id, updated_at, is_active
  FROM chatbot_sessions
  WHERE updated_at > NOW() - INTERVAL '2 hours'
  ORDER BY updated_at DESC;

-- Recent conversation logs
SELECT session_id, phone, message_type, message_text, timestamp
  FROM conversation_logs
  WHERE phone LIKE '%PHONE%'
  ORDER BY timestamp DESC LIMIT 20;
```

```sql
-- Bot config values
SELECT config_key, config_value, config_type FROM bot_config ORDER BY config_key;

-- Update bot config
UPDATE bot_config SET config_value = 'new_value' WHERE config_key = 'key_name';
```

```sql
-- Recent leads
SELECT phone, raw_message, status, created_at
  FROM leads
  ORDER BY created_at DESC LIMIT 20;

-- Token usage by customer
SELECT customer_id, month_year, total_tokens, total_cost_usd
  FROM customer_token_usage
  ORDER BY total_cost_usd DESC LIMIT 10;
```

---

## RPC Functions

```sql
-- Vector search (current - NIM)
SELECT * FROM match_products_nim(
  '[0.1, 0.2, ...]'::vector,   -- 1024-dim embedding
  10                             -- match_count
);

-- Atomic stock decrement
SELECT decrement_stock('product-uuid', 2);

-- Token usage upsert (used by promptBuilder)
SELECT upsert_token_usage('customer_id', 'YYYY-MM', input_tokens, output_tokens, cost);
```

---

## Schema Reference

| Table | Key Columns |
|-------|------------|
| `customers` | phone, name, customer_code, city, grade, discount, credit_limit, balance |
| `products` | product_code, name, brand, oem_number, category, vehicle_make, vehicle_model, mrp, mrp_npr, stock_quantity, segment, embedding_nim |
| `workshops` | name, city, district, zone, owner_name |
| `workshop_customers` | VIEW: workshop_phone, mechanic_phone, segment, grade |
| `orders` | order_number, customer_id, subtotal, total_amount, status, payment_status |
| `order_items` | order_id, product_id, quantity, mrp, discount, line_total |
| `conversation_logs` | session_id, phone, message_type, message_text, timestamp |
| `chatbot_sessions` | phone, customer_id, context (JSON), is_active, last_activity |
| `bot_config` | config_key, config_value, config_type |
| `product_knowledge` | type, input_term, mapped_to, confidence |
| `admin_users` | name, email, password_hash, role |
| `leads` | phone, raw_message, status (new/contacted/converted) |
| `customer_token_usage` | customer_id, month_year, total_tokens, total_cost_usd |
| `customer_tokens` | phone, token, expires_at |

---

## Maintenance

```sql
-- Check table sizes
SELECT schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index on embedding_nim (HNSW)
SELECT indexname, indexdef FROM pg_indexes
  WHERE tablename = 'products' AND indexname LIKE '%nim%';

-- Rebuild HNSW index (upgrade to 8GB Supabase first!)
REINDEX INDEX CONCURRENTLY products_embedding_nim_idx;
```

---

## Bulk Operations Template

```python
import psycopg2
from psycopg2.extras import execute_values

CONN = "postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres"
BATCH = 500

with psycopg2.connect(CONN) as conn:
    cur = conn.cursor()
    for i in range(0, len(rows), BATCH):
        execute_values(cur, "INSERT INTO table (col1, col2) VALUES %s ON CONFLICT DO NOTHING",
                       [(r['col1'], r['col2']) for r in rows[i:i+BATCH]])
        conn.commit()
        print(f"Batch {i//BATCH + 1} done")
```

---

## Related Skills

- **`/skill product-import`** — full import pipeline using these patterns
- **`/skill debug-chat`** — session/order/conversation queries
- **`/skill audit`** — check Supabase health metrics
