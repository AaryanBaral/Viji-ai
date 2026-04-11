-- =====================================================
-- MASTER SEED DATA FILE
-- Run this file to populate all tables with test data
-- =====================================================
-- 
-- INSTRUCTIONS:
-- 1. Open Supabase SQL Editor
-- 2. Copy and paste the contents of each file below in order
-- 3. Or run each file individually in the order listed
-- 
-- EXECUTION ORDER:
-- =====================================================

-- Step 1: Discount Grades (MUST RUN FIRST)
-- File: 001_discount_grades.sql
-- Creates: 5 discount grade records
-- 
-- This establishes the discount tiers used by customers
-- Run this before customers!

-- Step 2: Customers (AFTER discount grades)
-- File: 002_customers_sample.sql
-- Creates: 50 sample customer records
-- 
-- These are your test customers across different grades
-- Real CSV has 958 customers - replace this later

-- Step 3: Products (Can run anytime)
-- File: 003_products_sample.sql
-- Creates: 30 sample product records
-- 
-- Sample vehicle parts inventory
-- Real CSV has 231 products - replace this later

-- Step 4: Workshops (Can run anytime)
-- File: 004_workshops_sample.sql
-- Creates: 40 sample workshop records
-- 
-- Partner workshop locations across Nepal
-- Real CSV has 1,225 workshops - replace this later

-- Step 5: Auto Responses (Can run anytime)
-- File: 006_auto_responses.sql
-- Creates: 20 bilingual chatbot responses
-- 
-- Predefined English/Nepali responses for common queries

-- Step 6: Sample Orders (MUST RUN LAST)
-- File: 005_sample_orders.sql
-- Creates: 20 sample order records
-- 
-- Demonstrates various order scenarios
-- Requires customers and products to exist first!

-- =====================================================
-- QUICK START - COPY/PASTE METHOD:
-- =====================================================
-- 
-- Option A: Run each file separately in Supabase SQL Editor
-- 1. Open file 001_discount_grades.sql
-- 2. Copy entire contents
-- 3. Paste in Supabase SQL Editor and click "RUN"
-- 4. Repeat for files 002, 003, 004, 006, 005 (in that order!)
-- 
-- Option B: Combine all files (advanced)
-- 1. Combine all SQL files into one large file
-- 2. Paste in Supabase SQL Editor
-- 3. Click "RUN" once
-- 
-- =====================================================
-- VERIFICATION AFTER SEEDING:
-- =====================================================

-- Check discount grades
SELECT * FROM discount_grades ORDER BY sort_order;

-- Check customers by grade
SELECT customer_grade, COUNT(*) as count 
FROM customers 
GROUP BY customer_grade 
ORDER BY count DESC;

-- Check products by category
SELECT category, COUNT(*) as count 
FROM products 
WHERE category IS NOT NULL
GROUP BY category 
ORDER BY count DESC;

-- Check workshops by city
SELECT city, COUNT(*) as count 
FROM workshops 
GROUP BY city 
ORDER BY count DESC 
LIMIT 10;

-- Check auto responses by category
SELECT category, COUNT(*) as count 
FROM auto_responses 
WHERE is_active = true 
GROUP BY category;

-- Check orders by status
SELECT status, COUNT(*) as count, 
       ROUND(SUM(total_amount)::numeric, 2) as total_revenue
FROM orders 
GROUP BY status;

-- Overall database status
SELECT 
    'discount_grades' as table_name, COUNT(*) as record_count FROM discount_grades
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'workshops', COUNT(*) FROM workshops
UNION ALL
SELECT 'auto_responses', COUNT(*) FROM auto_responses
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items;

-- =====================================================
-- EXPECTED RESULTS:
-- =====================================================
-- discount_grades: 5 records
-- customers: 50 records
-- products: 30 records
-- workshops: 40 records
-- auto_responses: 20 records
-- orders: 20 records
-- order_items: 2+ records (from sample orders)
-- 
-- Total test data: ~167 records across 7 tables
-- =====================================================

-- =====================================================
-- NEXT STEPS AFTER SEEDING:
-- =====================================================
-- 
-- 1. Test customer recognition:
--    SELECT * FROM customers WHERE phone = '+9779841234567';
-- 
-- 2. Test product search:
--    SELECT * FROM products 
--    WHERE vehicle_make = 'Toyota' AND vehicle_model = 'Corolla';
-- 
-- 3. Test discount calculation:
--    SELECT p.name, p.unit_price, dg.discount_percentage,
--           (p.unit_price * (1 - dg.discount_percentage/100)) as discounted_price
--    FROM products p, discount_grades dg
--    WHERE dg.grade_code = 'LEO'
--    LIMIT 5;
-- 
-- 4. Test workshop finder:
--    SELECT name, address, city, 
--           ROUND(CAST(latitude as numeric), 4) as lat,
--           ROUND(CAST(longitude as numeric), 4) as lon
--    FROM workshops 
--    WHERE city = 'Kathmandu'
--    LIMIT 5;
-- 
-- 5. Test API endpoints with this data
-- 
-- =====================================================
-- IMPORTANT NOTES:
-- =====================================================
-- 
-- ⚠️ This is SAMPLE data for development/testing
-- ⚠️ Replace with FULL CSV data before production:
--    - 958 customers (from customers_cleaned_for_supabase.csv)
--    - 231 products (from LTVS_Items_For_SupabaseSheet1 2.csv)
--    - 1,225 workshops (from workshops_cleaned_for_supabase.csv)
-- 
-- ⚠️ Remember to update phone numbers in customers
--    to real test numbers for WhatsApp testing
-- 
-- ⚠️ Order data is completely fictional
--    Real orders will come from Botpress integration
-- 
-- =====================================================
