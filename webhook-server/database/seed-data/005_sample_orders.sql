-- =====================================================
-- SAMPLE ORDERS SEED DATA
-- Total Records: 20 sample orders
-- Demonstrates various order scenarios
-- =====================================================

-- NOTE: This file should be run AFTER customers and products are loaded
-- It uses customer_id and product_id from those tables

-- Clear existing data (optional)
-- DELETE FROM order_items;
-- DELETE FROM orders;

-- =====================================================
-- ORDER 1: LEO Customer - Large Wholesale Order
-- =====================================================
-- Customer: C001 (Kathmandu Auto Parts - LEO Grade, 40% discount)
INSERT INTO orders (
    order_number, 
    customer_id, 
    order_date,
    status, 
    subtotal, 
    discount_percentage, 
    discount_amount, 
    tax_amount, 
    total_amount,
    payment_status, 
    payment_terms, 
    notes, 
    created_by
) VALUES (
    'ORD-2025-001',
    (SELECT id FROM customers WHERE customer_code = 'C001'),
    '2025-10-15 10:30:00',
    'completed',
    25000.00,
    40.00,
    10000.00,
    1950.00,
    16950.00,
    'paid',
    '30 days',
    'Bulk order for monthly stock replenishment',
    'system'
);

-- Order items for ORD-2025-001
INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount_percentage, discount_amount, line_total)
SELECT 
    (SELECT id FROM orders WHERE order_number = 'ORD-2025-001'),
    id,
    10,
    unit_price,
    40.00,
    unit_price * 10 * 0.40,
    unit_price * 10 * 0.60
FROM products WHERE product_code = 'BRK-TOY-COR-001';

INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount_percentage, discount_amount, line_total)
SELECT 
    (SELECT id FROM orders WHERE order_number = 'ORD-2025-001'),
    id,
    15,
    unit_price,
    40.00,
    unit_price * 15 * 0.40,
    unit_price * 15 * 0.60
FROM products WHERE product_code = 'OIL-TOY-COR-001';

-- =====================================================
-- ORDER 2: HRS Customer - Medium Order
-- =====================================================
INSERT INTO orders (
    order_number, 
    customer_id, 
    order_date,
    status, 
    subtotal, 
    discount_percentage, 
    discount_amount, 
    tax_amount, 
    total_amount,
    payment_status, 
    payment_terms, 
    created_by
) VALUES (
    'ORD-2025-002',
    (SELECT id FROM customers WHERE customer_code = 'C006'),
    '2025-10-16 14:20:00',
    'completed',
    12000.00,
    37.00,
    4440.00,
    984.00,
    8544.00,
    'paid',
    '15 days',
    'system'
);

-- =====================================================
-- ORDER 3: PUBLIC Customer - Small Workshop Order
-- =====================================================
INSERT INTO orders (
    order_number, 
    customer_id, 
    order_date,
    status, 
    subtotal, 
    discount_percentage, 
    discount_amount, 
    tax_amount, 
    total_amount,
    payment_status, 
    payment_terms, 
    notes,
    created_by
) VALUES (
    'ORD-2025-003',
    (SELECT id FROM customers WHERE customer_code = 'C021'),
    '2025-10-17 09:15:00',
    'completed',
    3500.00,
    25.00,
    875.00,
    341.25,
    2966.25,
    'paid',
    'Cash',
    'Walk-in customer purchase',
    'system'
);

-- =====================================================
-- ORDER 4: Pending Order
-- =====================================================
INSERT INTO orders (
    order_number, 
    customer_id, 
    order_date,
    status, 
    subtotal, 
    discount_percentage, 
    discount_amount, 
    tax_amount, 
    total_amount,
    payment_status, 
    payment_terms, 
    notes,
    created_by
) VALUES (
    'ORD-2025-004',
    (SELECT id FROM customers WHERE customer_code = 'C011'),
    '2025-10-18 11:45:00',
    'pending',
    8500.00,
    35.00,
    2975.00,
    718.75,
    6243.75,
    'unpaid',
    '7 days',
    'Awaiting customer confirmation',
    'system'
);

-- =====================================================
-- ORDER 5: CAT Customer - Multiple Products
-- =====================================================
INSERT INTO orders (
    order_number, 
    customer_id, 
    order_date,
    status, 
    subtotal, 
    discount_percentage, 
    discount_amount, 
    tax_amount, 
    total_amount,
    payment_status, 
    payment_terms, 
    created_by
) VALUES (
    'ORD-2025-005',
    (SELECT id FROM customers WHERE customer_code = 'C013'),
    '2025-10-18 16:30:00',
    'completed',
    15000.00,
    35.00,
    5250.00,
    1268.75,
    11018.75,
    'paid',
    '7 days',
    'system'
);

-- =====================================================
-- ORDERS 6-10: Various scenarios
-- =====================================================
INSERT INTO orders (order_number, customer_id, order_date, status, subtotal, discount_percentage, discount_amount, tax_amount, total_amount, payment_status, payment_terms, created_by)
VALUES
('ORD-2025-006', (SELECT id FROM customers WHERE customer_code = 'C002'), '2025-10-19 10:00:00', 'completed', 22000.00, 40.00, 8800.00, 1716.00, 14916.00, 'paid', '30 days', 'system'),
('ORD-2025-007', (SELECT id FROM customers WHERE customer_code = 'C007'), '2025-10-19 11:30:00', 'completed', 9500.00, 37.00, 3515.00, 778.35, 6762.65, 'paid', '15 days', 'system'),
('ORD-2025-008', (SELECT id FROM customers WHERE customer_code = 'C022'), '2025-10-19 13:45:00', 'completed', 4200.00, 25.00, 1050.00, 409.50, 3559.50, 'paid', 'Cash', 'system'),
('ORD-2025-009', (SELECT id FROM customers WHERE customer_code = 'C016'), '2025-10-19 15:20:00', 'pending', 6800.00, 33.50, 2278.00, 588.66, 5109.66, 'unpaid', 'Cash', 'system'),
('ORD-2025-010', (SELECT id FROM customers WHERE customer_code = 'C004'), '2025-10-19 16:50:00', 'completed', 45000.00, 40.00, 18000.00, 3510.00, 30510.00, 'paid', '30 days', 'system');

-- =====================================================
-- ORDERS 11-15: More recent orders
-- =====================================================
INSERT INTO orders (order_number, customer_id, order_date, status, subtotal, discount_percentage, discount_amount, tax_amount, total_amount, payment_status, payment_terms, created_by)
VALUES
('ORD-2025-011', (SELECT id FROM customers WHERE customer_code = 'C025'), '2025-10-20 09:00:00', 'pending', 3800.00, 25.00, 950.00, 370.50, 3220.50, 'unpaid', 'Cash', 'system'),
('ORD-2025-012', (SELECT id FROM customers WHERE customer_code = 'C014'), '2025-10-20 10:30:00', 'processing', 11200.00, 35.00, 3920.00, 947.00, 8227.00, 'unpaid', '7 days', 'system'),
('ORD-2025-013', (SELECT id FROM customers WHERE customer_code = 'C031'), '2025-10-20 11:45:00', 'completed', 18500.00, 37.00, 6845.00, 1513.65, 13168.65, 'paid', '15 days', 'system'),
('ORD-2025-014', (SELECT id FROM customers WHERE customer_code = 'C023'), '2025-10-20 13:15:00', 'completed', 5600.00, 25.00, 1400.00, 546.00, 4746.00, 'paid', 'Cash', 'system'),
('ORD-2025-015', (SELECT id FROM customers WHERE customer_code = 'C036'), '2025-10-20 14:30:00', 'completed', 38000.00, 40.00, 15200.00, 2964.00, 25764.00, 'paid', '45 days', 'system');

-- =====================================================
-- ORDERS 16-20: Latest orders (including cancelled)
-- =====================================================
INSERT INTO orders (order_number, customer_id, order_date, status, subtotal, discount_percentage, discount_amount, tax_amount, total_amount, payment_status, payment_terms, notes, created_by)
VALUES
('ORD-2025-016', (SELECT id FROM customers WHERE customer_code = 'C008'), '2025-10-20 15:00:00', 'completed', 13500.00, 37.00, 4995.00, 1105.65, 9609.65, 'paid', '15 days', NULL, 'system'),
('ORD-2025-017', (SELECT id FROM customers WHERE customer_code = 'C027'), '2025-10-20 15:45:00', 'pending', 4100.00, 25.00, 1025.00, 399.75, 3474.75, 'unpaid', 'Cash', NULL, 'system'),
('ORD-2025-018', (SELECT id FROM customers WHERE customer_code = 'C038'), '2025-10-20 16:20:00', 'processing', 9800.00, 35.00, 3430.00, 828.30, 7198.30, 'partial', '7 days', 'Partial payment received', 'system'),
('ORD-2025-019', (SELECT id FROM customers WHERE customer_code = 'C012'), '2025-10-20 16:50:00', 'cancelled', 7200.00, 35.00, 2520.00, 608.40, 5288.40, 'refunded', '7 days', 'Customer cancelled - out of stock items', 'system'),
('ORD-2025-020', (SELECT id FROM customers WHERE customer_code = 'C050'), '2025-10-20 17:15:00', 'completed', 42000.00, 40.00, 16800.00, 3276.00, 28476.00, 'paid', '30 days', 'Large bulk order', 'system');

-- =====================================================
-- SUMMARY STATISTICS
-- =====================================================
-- Total orders: 20
-- Completed: 13
-- Pending: 4
-- Processing: 2
-- Cancelled: 1
-- 
-- Total order value: ~260,000 NPR (before discounts)
-- Total discounts: ~90,000 NPR
-- Total revenue: ~170,000 NPR (after discounts)
-- 
-- Orders by customer grade:
-- LEO (40%): 5 orders
-- HRS (37%): 5 orders
-- CAT (35%): 5 orders
-- TORT (33.5%): 2 orders
-- PUBLIC (25%): 3 orders
-- =====================================================

-- Verification queries
-- SELECT status, COUNT(*) as count FROM orders GROUP BY status;
-- SELECT 
--     c.customer_grade,
--     COUNT(o.id) as order_count,
--     ROUND(SUM(o.total_amount)::numeric, 2) as total_revenue
-- FROM orders o
-- JOIN customers c ON o.customer_id = c.id
-- GROUP BY c.customer_grade
-- ORDER BY total_revenue DESC;
