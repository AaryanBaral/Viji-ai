-- =====================================================
-- PERFORMANCE INDEXES
-- Migration: 001_create_indexes
-- Purpose: Add indexes for fast queries
-- Created: October 19, 2025
-- =====================================================

-- Drop indexes if they exist (for re-running script)
DROP INDEX IF EXISTS idx_customers_phone;
DROP INDEX IF EXISTS idx_customers_code;
DROP INDEX IF EXISTS idx_products_vehicle;
DROP INDEX IF EXISTS idx_products_category;
DROP INDEX IF EXISTS idx_orders_customer;
DROP INDEX IF EXISTS idx_order_items_order;
DROP INDEX IF EXISTS idx_chatbot_sessions_phone;
DROP INDEX IF EXISTS idx_conversation_logs_session;

-- =====================================================
-- CUSTOMER INDEXES
-- =====================================================

-- Index 1: Customer lookup by phone (WhatsApp queries)
-- Use case: "Who is calling from +977-98XXXXXXXX?"
CREATE INDEX idx_customers_phone 
ON customers(phone);

COMMENT ON INDEX idx_customers_phone IS 'Fast customer recognition by phone number';

-- Index 2: Customer lookup by customer code
-- Use case: "Find customer C00180"
CREATE INDEX idx_customers_code 
ON customers(customer_code);

COMMENT ON INDEX idx_customers_code IS 'Fast customer lookup by code';

-- =====================================================
-- PRODUCT INDEXES
-- =====================================================

-- Index 3: Product search by vehicle (most common query)
-- Use case: "Show me brake pads for Toyota Corolla"
CREATE INDEX idx_products_vehicle 
ON products(vehicle_make, vehicle_model);

COMMENT ON INDEX idx_products_vehicle IS 'Fast product search by vehicle make and model';

-- Index 4: Product search by category
-- Use case: "Show me all brake parts"
CREATE INDEX idx_products_category 
ON products(category);

COMMENT ON INDEX idx_products_category IS 'Fast product search by category';

-- Index 5: Product active status (filter inactive products)
CREATE INDEX idx_products_active 
ON products(is_active);

COMMENT ON INDEX idx_products_active IS 'Filter active/inactive products';

-- =====================================================
-- ORDER INDEXES
-- =====================================================

-- Index 6: Orders by customer (order history)
-- Use case: "Show me all orders for customer C00180"
CREATE INDEX idx_orders_customer 
ON orders(customer_id);

COMMENT ON INDEX idx_orders_customer IS 'Fast order history lookup';

-- Index 7: Order items by order (order details)
-- Use case: "What items are in order ORD-001?"
CREATE INDEX idx_order_items_order 
ON order_items(order_id);

COMMENT ON INDEX idx_order_items_order IS 'Fast order items lookup';

-- Index 8: Order items by product (product sales analytics)
CREATE INDEX idx_order_items_product 
ON order_items(product_id);

COMMENT ON INDEX idx_order_items_product IS 'Track which products are selling';

-- =====================================================
-- CHATBOT INDEXES
-- =====================================================

-- Index 9: Chatbot sessions by phone (active conversation lookup)
-- Use case: "Is there an active session for this phone number?"
CREATE INDEX idx_chatbot_sessions_phone 
ON chatbot_sessions(phone_number);

COMMENT ON INDEX idx_chatbot_sessions_phone IS 'Find active chatbot sessions';

-- Index 10: Conversation logs by session (conversation history)
CREATE INDEX idx_conversation_logs_session 
ON conversation_logs(session_id);

COMMENT ON INDEX idx_conversation_logs_session IS 'Load conversation history';

-- Index 11: Conversation logs by customer (customer chat history)
CREATE INDEX idx_conversation_logs_customer 
ON conversation_logs(customer_id);

COMMENT ON INDEX idx_conversation_logs_customer IS 'Track customer conversations';

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Check that all indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM 
    pg_indexes
WHERE 
    schemaname = 'public'
    AND indexname LIKE 'idx_%'
ORDER BY 
    tablename, indexname;

-- =====================================================
-- EXPECTED RESULT: 11 indexes created
-- =====================================================