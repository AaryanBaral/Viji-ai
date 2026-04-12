-- =====================================================
-- FOREIGN KEY CONSTRAINTS MIGRATION
-- File: database/migrations/003_add_foreign_keys.sql
-- Date: October 19, 2025
-- Purpose: Add referential integrity to spare_parts_db
-- =====================================================

-- =================
-- BEFORE RUNNING THIS MIGRATION
-- =================
-- 1. Backup your database first!
-- 2. Verify all tables exist
-- 3. Check for orphaned records (records that reference non-existent parents)
-- 4. Test in development environment first

-- =================
-- STEP 1: CHECK FOR ORPHANED RECORDS
-- =================
-- Run these queries BEFORE adding constraints to find problems:

-- Check for orders with invalid customer_id
-- SELECT order_number, customer_id 
-- FROM orders 
-- WHERE customer_id NOT IN (SELECT id FROM customers);

-- Check for order_items with invalid order_id
-- SELECT id, order_id 
-- FROM order_items 
-- WHERE order_id NOT IN (SELECT id FROM orders);

-- Check for order_items with invalid product_id
-- SELECT id, product_id 
-- FROM order_items 
-- WHERE product_id NOT IN (SELECT id FROM products);

-- Check for chatbot_sessions with invalid customer_id
-- SELECT id, customer_id 
-- FROM chatbot_sessions 
-- WHERE customer_id IS NOT NULL 
-- AND customer_id NOT IN (SELECT id FROM customers);

-- Check for conversation_logs with invalid session_id
-- SELECT id, session_id 
-- FROM conversation_logs 
-- WHERE session_id NOT IN (SELECT id FROM chatbot_sessions);

-- Check for customers with invalid workshop assignment
-- SELECT customer_code, assigned_workshop_id 
-- FROM customers 
-- WHERE assigned_workshop_id IS NOT NULL 
-- AND assigned_workshop_id NOT IN (SELECT id FROM workshops);

-- =================
-- STEP 2: ADD FOREIGN KEY CONSTRAINTS
-- =================

-- CONSTRAINT 1: orders.customer_id → customers.id
-- Purpose: Every order must belong to a valid customer
ALTER TABLE orders
ADD CONSTRAINT fk_orders_customer
FOREIGN KEY (customer_id)
REFERENCES customers(id)
ON DELETE RESTRICT  -- Prevent deleting customer with orders
ON UPDATE CASCADE;  -- Update order if customer ID changes

COMMENT ON CONSTRAINT fk_orders_customer ON orders IS 
'Ensures every order belongs to a valid customer. Prevents customer deletion if they have orders.';

-- CONSTRAINT 2: order_items.order_id → orders.id
-- Purpose: Every order item must belong to a valid order
ALTER TABLE order_items
ADD CONSTRAINT fk_order_items_order
FOREIGN KEY (order_id)
REFERENCES orders(id)
ON DELETE CASCADE   -- Delete order items when order deleted
ON UPDATE CASCADE;

COMMENT ON CONSTRAINT fk_order_items_order ON order_items IS 
'Ensures order items belong to valid orders. Cascades deletion when order is deleted.';

-- CONSTRAINT 3: order_items.product_id → products.id
-- Purpose: Every order item must reference a valid product
ALTER TABLE order_items
ADD CONSTRAINT fk_order_items_product
FOREIGN KEY (product_id)
REFERENCES products(id)
ON DELETE RESTRICT  -- Prevent deleting product in existing orders
ON UPDATE CASCADE;

COMMENT ON CONSTRAINT fk_order_items_product ON order_items IS 
'Ensures order items reference valid products. Prevents deletion of products in orders.';

-- CONSTRAINT 4: customers.assigned_workshop_id → workshops.id
-- Purpose: Customer workshop assignment must be valid
ALTER TABLE customers
ADD CONSTRAINT fk_customers_workshop
FOREIGN KEY (assigned_workshop_id)
REFERENCES workshops(id)
ON DELETE SET NULL  -- Clear assignment if workshop deleted
ON UPDATE CASCADE;

COMMENT ON CONSTRAINT fk_customers_workshop ON customers IS 
'Links customers to their assigned workshop. Sets to NULL if workshop deleted.';

-- CONSTRAINT 5: chatbot_sessions.customer_id → customers.id
-- Purpose: Chatbot session must belong to valid customer (if identified)
ALTER TABLE chatbot_sessions
ADD CONSTRAINT fk_chatbot_sessions_customer
FOREIGN KEY (customer_id)
REFERENCES customers(id)
ON DELETE SET NULL  -- Keep session but clear customer link if deleted
ON UPDATE CASCADE;

COMMENT ON CONSTRAINT fk_chatbot_sessions_customer ON chatbot_sessions IS 
'Links chatbot sessions to identified customers. Nullifies link if customer deleted.';

-- CONSTRAINT 6: conversation_logs.session_id → chatbot_sessions.id
-- Purpose: Every conversation log must belong to a valid session
ALTER TABLE conversation_logs
ADD CONSTRAINT fk_conversation_logs_session
FOREIGN KEY (session_id)
REFERENCES chatbot_sessions(id)
ON DELETE CASCADE   -- Delete logs when session deleted
ON UPDATE CASCADE;

COMMENT ON CONSTRAINT fk_conversation_logs_session ON conversation_logs IS 
'Ensures conversation logs belong to valid sessions. Cascades deletion with session.';

-- CONSTRAINT 7: conversation_logs.customer_id → customers.id
-- Purpose: Log customer reference must be valid (if present)
ALTER TABLE conversation_logs
ADD CONSTRAINT fk_conversation_logs_customer
FOREIGN KEY (customer_id)
REFERENCES customers(id)
ON DELETE SET NULL  -- Keep log but clear customer link if deleted
ON UPDATE CASCADE;

COMMENT ON CONSTRAINT fk_conversation_logs_customer ON conversation_logs IS 
'Links conversation logs to customers. Nullifies link if customer deleted.';

-- =================
-- STEP 3: CREATE INDEXES ON FOREIGN KEY COLUMNS
-- =================
-- Foreign key columns should have indexes for performance
-- (Some may already exist from migration 001)

-- Index for orders.customer_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_orders_customer_id 
ON orders(customer_id);

-- Index for order_items.order_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
ON order_items(order_id);

-- Index for order_items.product_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_order_items_product_id 
ON order_items(product_id);

-- Index for customers.assigned_workshop_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_customers_workshop_id 
ON customers(assigned_workshop_id);

-- Index for chatbot_sessions.customer_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_customer_id 
ON chatbot_sessions(customer_id);

-- Index for conversation_logs.session_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_conversation_logs_session_id 
ON conversation_logs(session_id);

-- Index for conversation_logs.customer_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_conversation_logs_customer_id 
ON conversation_logs(customer_id);

-- =================
-- STEP 4: VERIFY CONSTRAINTS WERE ADDED
-- =================
-- Run this query to see all foreign keys:
-- SELECT
--   tc.table_name, 
--   kcu.column_name, 
--   ccu.table_name AS foreign_table_name,
--   ccu.column_name AS foreign_column_name,
--   rc.delete_rule,
--   rc.update_rule
-- FROM information_schema.table_constraints AS tc 
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
-- JOIN information_schema.referential_constraints AS rc
--   ON rc.constraint_name = tc.constraint_name
-- WHERE tc.constraint_type = 'FOREIGN KEY'
-- ORDER BY tc.table_name, kcu.column_name;

-- =================
-- ROLLBACK SCRIPT (IF NEEDED)
-- =================
-- If you need to remove these constraints:
/*
ALTER TABLE conversation_logs DROP CONSTRAINT IF EXISTS fk_conversation_logs_customer;
ALTER TABLE conversation_logs DROP CONSTRAINT IF EXISTS fk_conversation_logs_session;
ALTER TABLE chatbot_sessions DROP CONSTRAINT IF EXISTS fk_chatbot_sessions_customer;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS fk_customers_workshop;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS fk_order_items_product;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS fk_order_items_order;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS fk_orders_customer;
*/

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Total Foreign Keys Added: 7
-- Tables Affected: 5 (orders, order_items, customers, chatbot_sessions, conversation_logs)
-- Next Steps:
--   1. Test with sample data
--   2. Verify cascade behavior
--   3. Update API to handle constraint errors
-- =====================================================