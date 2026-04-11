-- =====================================================
-- PRODUCTS SEED DATA - SAMPLE
-- Total Records: 30 sample products
-- Note: Replace with full 231 products from your CSV
-- =====================================================

-- Clear existing data (optional)
-- DELETE FROM products;

-- Insert sample products
INSERT INTO products (
    product_code, name, description, category, brand,
    unit_price, cost_price, stock_quantity, reorder_point,
    unit_of_measure, vehicle_make, vehicle_model,
    sales_target, movement, safety_stock_quantity
) VALUES
-- Toyota Corolla Parts
('BRK-TOY-COR-001', 'Toyota Corolla Brake Pad (Front)', 'Front brake pads for Toyota Corolla', 'Brake', 'Genuine Toyota', 2500.00, 1800.00, 50, 10, 'SET', 'Toyota', 'Corolla', 100, 'Fast', 15),
('BRK-TOY-COR-002', 'Toyota Corolla Brake Pad (Rear)', 'Rear brake pads for Toyota Corolla', 'Brake', 'Genuine Toyota', 2200.00, 1600.00, 45, 10, 'SET', 'Toyota', 'Corolla', 90, 'Fast', 15),
('BRK-TOY-COR-003', 'Toyota Corolla Brake Disc (Front)', 'Front brake disc for Toyota Corolla', 'Brake', 'Genuine Toyota', 3500.00, 2500.00, 30, 8, 'PCS', 'Toyota', 'Corolla', 60, 'Medium', 10),
('OIL-TOY-COR-001', 'Toyota Corolla Engine Oil Filter', 'Oil filter for Toyota Corolla engines', 'Filter', 'Genuine Toyota', 450.00, 300.00, 100, 20, 'PCS', 'Toyota', 'Corolla', 200, 'Fast', 30),
('AIR-TOY-COR-001', 'Toyota Corolla Air Filter', 'Air filter for Toyota Corolla', 'Filter', 'Genuine Toyota', 650.00, 450.00, 80, 15, 'PCS', 'Toyota', 'Corolla', 150, 'Fast', 25),

-- Honda City Parts  
('BRK-HON-CTY-001', 'Honda City Brake Pad (Front)', 'Front brake pads for Honda City', 'Brake', 'Genuine Honda', 2800.00, 2000.00, 40, 10, 'SET', 'Honda', 'City', 80, 'Fast', 15),
('BRK-HON-CTY-002', 'Honda City Brake Pad (Rear)', 'Rear brake pads for Honda City', 'Brake', 'Genuine Honda', 2400.00, 1700.00, 35, 10, 'SET', 'Honda', 'City', 70, 'Fast', 12),
('OIL-HON-CTY-001', 'Honda City Engine Oil Filter', 'Oil filter for Honda City engines', 'Filter', 'Genuine Honda', 500.00, 350.00, 90, 20, 'PCS', 'Honda', 'City', 180, 'Fast', 30),
('AIR-HON-CTY-001', 'Honda City Air Filter', 'Air filter for Honda City', 'Filter', 'Genuine Honda', 700.00, 500.00, 70, 15, 'PCS', 'Honda', 'City', 140, 'Fast', 25),
('CLT-HON-CTY-001', 'Honda City Clutch Plate', 'Complete clutch plate assembly', 'Clutch', 'Genuine Honda', 8500.00, 6500.00, 15, 5, 'SET', 'Honda', 'City', 30, 'Slow', 5),

-- Maruti Suzuki Swift Parts
('BRK-MAR-SWT-001', 'Maruti Swift Brake Pad (Front)', 'Front brake pads for Maruti Swift', 'Brake', 'Genuine Maruti', 2200.00, 1600.00, 60, 12, 'SET', 'Maruti', 'Swift', 120, 'Fast', 18),
('BRK-MAR-SWT-002', 'Maruti Swift Brake Pad (Rear)', 'Rear brake pads for Maruti Swift', 'Brake', 'Genuine Maruti', 1900.00, 1400.00, 55, 12, 'SET', 'Maruti', 'Swift', 110, 'Fast', 18),
('OIL-MAR-SWT-001', 'Maruti Swift Engine Oil Filter', 'Oil filter for Maruti Swift engines', 'Filter', 'Genuine Maruti', 400.00, 280.00, 120, 25, 'PCS', 'Maruti', 'Swift', 250, 'Fast', 35),
('AIR-MAR-SWT-001', 'Maruti Swift Air Filter', 'Air filter for Maruti Swift', 'Filter', 'Genuine Maruti', 600.00, 420.00, 100, 20, 'PCS', 'Maruti', 'Swift', 200, 'Fast', 30),
('SUS-MAR-SWT-001', 'Maruti Swift Shock Absorber (Front)', 'Front shock absorber for Maruti Swift', 'Suspension', 'Genuine Maruti', 4500.00, 3200.00, 20, 5, 'PCS', 'Maruti', 'Swift', 40, 'Medium', 8),

-- Hyundai i20 Parts
('BRK-HYU-I20-001', 'Hyundai i20 Brake Pad (Front)', 'Front brake pads for Hyundai i20', 'Brake', 'Genuine Hyundai', 2600.00, 1900.00, 45, 10, 'SET', 'Hyundai', 'i20', 90, 'Fast', 15),
('BRK-HYU-I20-002', 'Hyundai i20 Brake Pad (Rear)', 'Rear brake pads for Hyundai i20', 'Brake', 'Genuine Hyundai', 2300.00, 1650.00, 40, 10, 'SET', 'Hyundai', 'i20', 80, 'Fast', 12),
('OIL-HYU-I20-001', 'Hyundai i20 Engine Oil Filter', 'Oil filter for Hyundai i20 engines', 'Filter', 'Genuine Hyundai', 480.00, 330.00, 95, 20, 'PCS', 'Hyundai', 'i20', 190, 'Fast', 30),
('AIR-HYU-I20-001', 'Hyundai i20 Air Filter', 'Air filter for Hyundai i20', 'Filter', 'Genuine Hyundai', 680.00, 480.00, 75, 15, 'PCS', 'Hyundai', 'i20', 150, 'Fast', 25),
('WIP-HYU-I20-001', 'Hyundai i20 Wiper Blade Set', 'Complete wiper blade set for Hyundai i20', 'Wiper', 'Genuine Hyundai', 1200.00, 850.00, 50, 10, 'SET', 'Hyundai', 'i20', 100, 'Medium', 15),

-- Universal/Generic Parts
('OIL-UNV-001', 'Engine Oil 10W-40 (4L)', 'Semi-synthetic engine oil 10W-40', 'Oil', 'Castrol', 2800.00, 2100.00, 80, 15, 'BTL', NULL, NULL, 160, 'Fast', 25),
('OIL-UNV-002', 'Engine Oil 5W-30 (4L)', 'Fully synthetic engine oil 5W-30', 'Oil', 'Mobil', 3500.00, 2600.00, 60, 12, 'BTL', NULL, NULL, 120, 'Fast', 20),
('CLN-UNV-001', 'Brake Cleaner Spray (500ml)', 'Professional brake cleaner spray', 'Cleaning', 'CRC', 450.00, 320.00, 100, 20, 'CAN', NULL, NULL, 200, 'Fast', 30),
('CLN-UNV-002', 'Engine Degreaser (1L)', 'Heavy duty engine degreaser', 'Cleaning', 'Wurth', 850.00, 600.00, 50, 10, 'BTL', NULL, NULL, 100, 'Medium', 15),
('BAT-UNV-001', 'Car Battery 12V 55Ah', 'Maintenance-free car battery', 'Battery', 'Exide', 8500.00, 6500.00, 25, 5, 'PCS', NULL, NULL, 50, 'Medium', 8),

-- Tata Tiago Parts
('BRK-TAT-TGO-001', 'Tata Tiago Brake Pad (Front)', 'Front brake pads for Tata Tiago', 'Brake', 'Genuine Tata', 2100.00, 1550.00, 50, 10, 'SET', 'Tata', 'Tiago', 100, 'Fast', 15),
('OIL-TAT-TGO-001', 'Tata Tiago Engine Oil Filter', 'Oil filter for Tata Tiago engines', 'Filter', 'Genuine Tata', 380.00, 270.00, 100, 20, 'PCS', 'Tata', 'Tiago', 200, 'Fast', 30),
('AIR-TAT-TGO-001', 'Tata Tiago Air Filter', 'Air filter for Tata Tiago', 'Filter', 'Genuine Tata', 550.00, 390.00, 85, 15, 'PCS', 'Tata', 'Tiago', 170, 'Fast', 25),
('SPK-TAT-TGO-001', 'Tata Tiago Spark Plug Set', '4pc spark plug set for Tata Tiago', 'Ignition', 'NGK', 1200.00, 850.00, 40, 10, 'SET', 'Tata', 'Tiago', 80, 'Medium', 12),
('CLT-TAT-TGO-001', 'Tata Tiago Clutch Cable', 'Clutch cable for Tata Tiago', 'Clutch', 'Genuine Tata', 650.00, 480.00, 30, 8, 'PCS', 'Tata', 'Tiago', 60, 'Slow', 10);

-- Verification query
-- SELECT category, COUNT(*) as count FROM products GROUP BY category ORDER BY count DESC;
-- SELECT vehicle_make, COUNT(*) as count FROM products WHERE vehicle_make IS NOT NULL GROUP BY vehicle_make;
