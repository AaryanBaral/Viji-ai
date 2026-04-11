# Skill: Product Import Pipeline (ViJJI)

For importing new brand products (TATA DURAfit, TGP, Suzuki, SKF, etc.)

---

## Overview Flow

```
Raw PDF/Excel
    ↓
PDF extraction (if needed) → /root/scripts/pdf_table_extractor.py
    ↓
Column mapping + enrichment (Python/pandas)
    ↓
Dedup + filter existing codes (Supabase psql)
    ↓
Batch INSERT 500 rows/batch via psql
    ↓
NIM embedding (screen session, PAGE_SIZE=200)
    ↓
Verify in DB
```

---

## Step 1 — PDF → Excel (if source is PDF)

```bash
# TATA DURAfit / TGP price list PDFs
python3 /root/scripts/pdf_table_extractor.py input.pdf output.xlsx --verbose

# Output columns: SN, PART NUMBER, DESCRIPTION, MPG, MRP, APPLICATION, CATEGORY
# Already processed:
#   /root/durafit_price_list.xlsx   (791 rows)
#   /root/tgp_price_list.xlsx       (3829 rows)
```

---

## Step 2 — Column Mapping (Python)

```python
import pandas as pd

df = pd.read_excel('new_products.xlsx')

# Standard mapping
df_mapped = pd.DataFrame({
    'product_code':    df['Part No'].str.strip().str.upper(),
    'oem_number':      df['Part No'].str.strip().str.upper(),
    'name':            df['Part Desc'].str.strip(),
    'category':        df['Division Desc'].str.strip(),
    'description':     df['HSN'].astype(str),
    'brand':           'TATA Genuine Parts',   # adjust per brand
    'vehicle_make':    'TATA',                  # adjust per brand
    'mrp':             pd.to_numeric(df['MRP'], errors='coerce'),
    'stock_quantity':  50,
})

# Drop rows with missing product_code or mrp
df_mapped = df_mapped.dropna(subset=['product_code', 'mrp'])

# Dedup on product_code
df_mapped = df_mapped.drop_duplicates(subset='product_code')

print(f"Rows ready for import: {len(df_mapped)}")
```

---

## Step 3 — Filter Existing Codes

```python
import psycopg2

CONN = "postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres"

with psycopg2.connect(CONN) as conn:
    cur = conn.cursor()
    cur.execute("SELECT UPPER(product_code) FROM products")
    existing = {row[0] for row in cur.fetchall()}

new_products = df_mapped[~df_mapped['product_code'].str.upper().isin(existing)]
print(f"New products to insert: {len(new_products)} (filtered {len(df_mapped) - len(new_products)} existing)")
```

---

## Step 4 — Batch INSERT (psql / psycopg2)

```python
# NEVER use Supabase REST API for this — use direct psql
# Batch 500 rows at a time

from psycopg2.extras import execute_values

BATCH = 500
rows = new_products.to_dict('records')

with psycopg2.connect(CONN) as conn:
    cur = conn.cursor()
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        execute_values(cur, """
            INSERT INTO products
              (product_code, oem_number, name, category, description,
               brand, vehicle_make, mrp, stock_quantity)
            VALUES %s
            ON CONFLICT (product_code) DO NOTHING
        """, [(
            r['product_code'], r['oem_number'], r['name'], r['category'],
            r['description'], r['brand'], r['vehicle_make'],
            r['mrp'], r['stock_quantity']
        ) for r in batch])
        conn.commit()
        print(f"Inserted batch {i//BATCH + 1}")
```

---

## Step 5 — NIM Embedding (screen session)

```bash
# Run in screen — can take hours for large batches
screen -S embed
cd /root/vehicle-parts-chatbot/webhook-server

# Embed new (un-embedded) products only
node scripts/embedAllProducts.js 2>&1 | tee /tmp/embed_$(date +%Y%m%d).log

# Detach: Ctrl+A, D
# Re-attach: screen -r embed
```

**Rules:**
- `PAGE_SIZE=200` — set in embedAllProducts.js, do NOT increase (OOM risk)
- Uses NIM `nvidia/nv-embedqa-e5-v5`, writes to `embedding_nim` column
- Do NOT mix with OpenAI embeddings
- For HNSW index rebuild: upgrade Supabase to 8GB first, rebuild, then downgrade

---

## Step 6 — Verify

```bash
psql "postgresql://postgres:nvCalebsiynJcyTg@db.gytvgcnrnnffjgxjtndz.supabase.co:5432/postgres" << 'SQL'
-- Count by brand
SELECT brand, COUNT(*) FROM products GROUP BY brand ORDER BY count DESC LIMIT 10;

-- Check new products have embeddings
SELECT COUNT(*) as no_embedding FROM products
  WHERE embedding_nim IS NULL AND brand = 'TATA Genuine Parts';
SQL
```

---

## Pricing Formulas

| Market | Formula |
|--------|---------|
| Nepal (mrp_npr) | `MRP × 0.62 × (1 + tariff%) × 1.04 × 1.15 × 1.6 ÷ 0.75` |
| SKF special | `mrp_npr = MRP × 1.77` |
| India | `mrp` field directly (INR) |

Tariff rates: `/root/tariff_tool/tariff_automation.py` + Nepal tariff XLSX at `/root/nepal_tariff_2082_83.xlsx`

---

## Related Skills

- **`/skill supabase`** — DB queries to verify import, check counts
- **`/skill audit`** — check memory/disk before large import jobs
