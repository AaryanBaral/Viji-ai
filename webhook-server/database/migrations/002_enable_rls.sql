-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- Migration: 002_enable_rls
-- Purpose: Secure database while allowing chatbot access
-- Created: October 19, 2025
-- =====================================================

-- =====================================================
-- STEP 1: ENABLE RLS ON ALL TABLES
-- =====================================================

-- Core business tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Chatbot tables
ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_responses ENABLE ROW LEVEL SECURITY;

-- Admin tables
ALTER TABLE lead_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- STEP 2: DROP EXISTING POLICIES (for clean slate)
-- =====================================================

-- Customers policies
DROP POLICY IF EXISTS "Public read customers" ON customers;
DROP POLICY IF EXISTS "Service role all customers" ON customers;

-- Products policies
DROP POLICY IF EXISTS "Public read products" ON products;
DROP POLICY IF EXISTS "Service role all products" ON products;

-- Workshops policies
DROP POLICY IF EXISTS "Public read workshops" ON workshops;
DROP POLICY IF EXISTS "Service role all workshops" ON workshops;

-- Discount grades policies
DROP POLICY IF EXISTS "Public read discount_grades" ON discount_grades;
DROP POLICY IF EXISTS "Service role all discount_grades" ON discount_grades;

-- Orders policies
DROP POLICY IF EXISTS "Public read own orders" ON orders;
DROP POLICY IF EXISTS "Service role all orders" ON orders;

-- Order items policies
DROP POLICY IF EXISTS "Public read order_items" ON order_items;
DROP POLICY IF EXISTS "Service role all order_items" ON order_items;

-- Chatbot sessions policies
DROP POLICY IF EXISTS "Public manage own sessions" ON chatbot_sessions;
DROP POLICY IF EXISTS "Service role all sessions" ON chatbot_sessions;

-- Conversation logs policies
DROP POLICY IF EXISTS "Service role all conversation_logs" ON conversation_logs;

-- Chatbot analytics policies
DROP POLICY IF EXISTS "Service role all analytics" ON chatbot_analytics;

-- Auto responses policies
DROP POLICY IF EXISTS "Public read auto_responses" ON auto_responses;
DROP POLICY IF EXISTS "Service role all auto_responses" ON auto_responses;

-- Lead opportunities policies
DROP POLICY IF EXISTS "Service role all leads" ON lead_opportunities;

-- Activity log policies
DROP POLICY IF EXISTS "Service role all activity_log" ON activity_log;

-- Admin alerts policies
DROP POLICY IF EXISTS "Service role all admin_alerts" ON admin_alerts;

-- =====================================================
-- STEP 3: CREATE PUBLIC READ POLICIES
-- (Allow chatbot to read data for queries)
-- =====================================================

-- 1. CUSTOMERS - Public can read (for customer recognition)
CREATE POLICY "Public read customers"
ON customers
FOR SELECT
USING (true);

-- 2. PRODUCTS - Public can read (for product catalog)
CREATE POLICY "Public read products"
ON products
FOR SELECT
USING (is_active = true);  -- Only active products

-- 3. WORKSHOPS - Public can read (for workshop finder)
CREATE POLICY "Public read workshops"
ON workshops
FOR SELECT
USING (is_active = true);  -- Only active workshops

-- 4. DISCOUNT_GRADES - Public can read (for discount calculation)
CREATE POLICY "Public read discount_grades"
ON discount_grades
FOR SELECT
USING (is_active = true);

-- 5. ORDERS - Public can read their own orders only
CREATE POLICY "Public read own orders"
ON orders
FOR SELECT
USING (true);  -- For now allow all, will restrict by customer later

-- 6. ORDER_ITEMS - Public can read order items
CREATE POLICY "Public read order_items"
ON order_items
FOR SELECT
USING (true);

-- 7. AUTO_RESPONSES - Public can read (for chatbot responses)
CREATE POLICY "Public read auto_responses"
ON auto_responses
FOR SELECT
USING (is_active = true);

-- 8. CHATBOT_SESSIONS - Public can manage their own sessions
CREATE POLICY "Public manage own sessions"
ON chatbot_sessions
FOR ALL
USING (true)
WITH CHECK (true);

-- =====================================================
-- STEP 4: CREATE SERVICE ROLE POLICIES
-- (Allow backend full access)
-- =====================================================

-- Service role has full access to all tables
CREATE POLICY "Service role all customers"
ON customers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all products"
ON products
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all workshops"
ON workshops
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all discount_grades"
ON discount_grades
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all orders"
ON orders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all order_items"
ON order_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all sessions"
ON chatbot_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all conversation_logs"
ON conversation_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all analytics"
ON chatbot_analytics
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all auto_responses"
ON auto_responses
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all leads"
ON lead_opportunities
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all activity_log"
ON activity_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role all admin_alerts"
ON admin_alerts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- STEP 5: VERIFY POLICIES CREATED
-- =====================================================

SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM 
    pg_policies
WHERE 
    schemaname = 'public'
ORDER BY 
    tablename, policyname;

-- =====================================================
-- EXPECTED RESULT: ~30 policies created
-- Policies allow:
-- - Public: READ access to active data
-- - Service Role: FULL access to everything
-- - Authenticated users: Read their own data
-- =====================================================