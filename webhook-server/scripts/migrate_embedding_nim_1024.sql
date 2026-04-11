-- Migration: reset embedding_nim column to vector(1024) for NVIDIA NIM model
-- Run this in Supabase SQL Editor BEFORE running embedAllProducts.js
-- ⚠️  This drops all existing embedding_nim data (was 1536-dim OpenAI, wrong model)

-- 1. Drop existing HNSW index on embedding_nim (if any)
DROP INDEX IF EXISTS products_embedding_nim_idx;

-- 2. Drop the column and recreate with correct dimensions
ALTER TABLE products DROP COLUMN IF EXISTS embedding_nim;
ALTER TABLE products ADD COLUMN embedding_nim vector(1024);

-- 3. Update match_products_nim RPC to accept vector(1024)
CREATE OR REPLACE FUNCTION match_products_nim(
    query_embedding vector(1024),
    match_threshold float DEFAULT 0.3,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    name text,
    product_code text,
    brand text,
    category text,
    vehicle_make text,
    vehicle_model text,
    mrp numeric,
    mrp_npr numeric,
    stock_quantity int,
    oem_number text,
    segment text,
    movement text,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        p.id,
        p.name,
        p.product_code,
        p.brand,
        p.category,
        p.vehicle_make,
        p.vehicle_model,
        p.mrp,
        p.mrp_npr,
        p.stock_quantity,
        p.oem_number,
        p.segment,
        p.movement,
        1 - (p.embedding_nim <=> query_embedding) AS similarity
    FROM products p
    WHERE p.embedding_nim IS NOT NULL
      AND 1 - (p.embedding_nim <=> query_embedding) > match_threshold
    ORDER BY p.embedding_nim <=> query_embedding
    LIMIT match_count;
$$;

-- 4. NOTE: HNSW index should be built AFTER all embeddings are loaded.
--    Run this separately after embedAllProducts.js finishes:
--
-- CREATE INDEX products_embedding_nim_idx
--   ON products USING hnsw (embedding_nim vector_cosine_ops)
--   WITH (m = 16, ef_construction = 64);
