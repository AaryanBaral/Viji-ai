-- =====================================================
-- CUSTOMERS SEED DATA - SAMPLE
-- Total Records: 50 sample customers
-- Note: Replace with full 958 customers from your CSV
-- =====================================================

-- Clear existing data (optional)
-- DELETE FROM customers;

-- Insert sample customers
INSERT INTO customers (
    customer_code, name, city, district, address,
    phone, contact_person, latitude, longitude,
    customer_grade, retailer_type, balance_lcy,
    payment_terms, is_active, credit_limit, base_discount_percentage
) VALUES
-- LEO Grade Customers (Highest Tier - 40% discount)
('C001', 'Kathmandu Auto Parts', 'Kathmandu', 'Kathmandu', 'New Road, Kathmandu', '+9779841234567', 'Ram Bahadur', 27.7172, 85.3240, 'LEO', 'Wholesaler', 50000.00, '30 days', true, 500000.00, 40.00),
('C002', 'Lalitpur Motors', 'Lalitpur', 'Lalitpur', 'Pulchowk, Lalitpur', '+9779851234568', 'Shyam Kumar', 27.6683, 85.3206, 'LEO', 'Wholesaler', 35000.00, '30 days', true, 450000.00, 40.00),
('C003', 'Bhaktapur Spare Parts', 'Bhaktapur', 'Bhaktapur', 'Suryabinayak, Bhaktapur', '+9779861234569', 'Hari Prasad', 27.6710, 85.4298, 'LEO', 'Wholesaler', 45000.00, '45 days', true, 480000.00, 40.00),
('C004', 'Pokhara Auto Center', 'Pokhara', 'Kaski', 'Mahendrapool, Pokhara', '+9779871234570', 'Bikash Thapa', 28.2096, 83.9856, 'LEO', 'Wholesaler', 60000.00, '30 days', true, 550000.00, 40.00),
('C005', 'Butwal Vehicle Parts', 'Butwal', 'Rupandehi', 'Traffic Chowk, Butwal', '+9779881234571', 'Rajesh Shrestha', 27.7000, 83.4500, 'LEO', 'Wholesaler', 40000.00, '30 days', true, 420000.00, 40.00),

-- HRS Grade Customers (High-Value - 37% discount)
('C006', 'Biratnagar Parts Hub', 'Biratnagar', 'Morang', 'Main Road, Biratnagar', '+9779891234572', 'Krishna Rai', 26.4525, 87.2718, 'HRS', 'Retailer', 25000.00, '15 days', true, 300000.00, 37.00),
('C007', 'Hetauda Auto Shop', 'Hetauda', 'Makwanpur', 'BP Chowk, Hetauda', '+9779801234573', 'Suman Tamang', 27.4287, 85.0327, 'HRS', 'Retailer', 28000.00, '15 days', true, 320000.00, 37.00),
('C008', 'Dharan Motors', 'Dharan', 'Sunsari', 'Bhanu Chowk, Dharan', '+9779811234574', 'Prakash Limbu', 26.8148, 87.2833, 'HRS', 'Retailer', 30000.00, '15 days', true, 350000.00, 37.00),
('C009', 'Nepalgunj Auto Parts', 'Nepalgunj', 'Banke', 'Dhamboji, Nepalgunj', '+9779821234575', 'Ramesh Tharu', 28.0500, 81.6167, 'HRS', 'Retailer', 22000.00, '15 days', true, 280000.00, 37.00),
('C010', 'Birgunj Vehicle Center', 'Birgunj', 'Parsa', 'Ghantaghar, Birgunj', '+9779831234576', 'Mohan Yadav', 27.0000, 84.8667, 'HRS', 'Retailer', 26000.00, '15 days', true, 300000.00, 37.00),

-- CAT Grade Customers (Category - 35% discount)
('C011', 'Itahari Auto Services', 'Itahari', 'Sunsari', 'Dharan Road, Itahari', '+9779841234577', 'Santosh Karki', 26.6667, 87.2833, 'CAT', 'Retailer', 18000.00, '7 days', true, 200000.00, 35.00),
('C012', 'Janakpur Motors', 'Janakpur', 'Dhanusha', 'Station Road, Janakpur', '+9779851234578', 'Dilip Kumar', 26.7288, 85.9244, 'CAT', 'Retailer', 15000.00, '7 days', true, 180000.00, 35.00),
('C013', 'Butwal Auto Parts', 'Butwal', 'Rupandehi', 'Kalikanagar, Butwal', '+9779861234579', 'Binod Sharma', 27.7000, 83.4500, 'CAT', 'Retailer', 20000.00, '7 days', true, 220000.00, 35.00),
('C014', 'Bharatpur Vehicle Shop', 'Bharatpur', 'Chitwan', 'Pulchowk, Bharatpur', '+9779871234580', 'Kamal Ghimire', 27.6833, 84.4333, 'CAT', 'Retailer', 16000.00, '7 days', true, 190000.00, 35.00),
('C015', 'Damak Motors', 'Damak', 'Jhapa', 'Main Chowk, Damak', '+9779881234581', 'Arjun Gurung', 26.6607, 87.7050, 'CAT', 'Retailer', 14000.00, '7 days', true, 170000.00, 35.00),

-- TORT Grade Customers (33.5% discount)
('C016', 'Siddharthanagar Auto', 'Siddharthanagar', 'Rupandehi', 'Manigram, Siddharthanagar', '+9779891234582', 'Mahesh Pandey', 27.5031, 83.4602, 'TORT', 'Retailer', 12000.00, 'Cash', true, 150000.00, 33.50),
('C017', 'Tulsipur Parts Center', 'Tulsipur', 'Dang', 'Main Road, Tulsipur', '+9779801234583', 'Dipak Chaudhary', 28.1333, 82.3000, 'TORT', 'Retailer', 10000.00, 'Cash', true, 140000.00, 33.50),
('C018', 'Dhangadhi Auto Shop', 'Dhangadhi', 'Kailali', 'Attariya Road, Dhangadhi', '+9779811234584', 'Suresh Bista', 28.6940, 80.5895, 'TORT', 'Retailer', 11000.00, 'Cash', true, 145000.00, 33.50),
('C019', 'Lahan Motors', 'Lahan', 'Siraha', 'BP Chowk, Lahan', '+9779821234585', 'Naresh Sah', 26.7205, 86.4777, 'TORT', 'Retailer', 9000.00, 'Cash', true, 130000.00, 33.50),
('C020', 'Gorkha Auto Parts', 'Gorkha', 'Gorkha', 'Bus Park, Gorkha', '+9779831234586', 'Raju Gurung', 28.0000, 84.6333, 'TORT', 'Retailer', 8500.00, 'Cash', true, 125000.00, 33.50),

-- PUBLIC Grade Customers (Standard - 25% discount)
('C021', 'Quick Fix Garage', 'Kathmandu', 'Kathmandu', 'Chabahil, Kathmandu', '+9779841234587', 'Sanjay Shahi', 27.7216, 85.3602, 'PUBLIC', 'Workshop', 5000.00, 'Cash', true, 50000.00, 25.00),
('C022', 'City Auto Repair', 'Lalitpur', 'Lalitpur', 'Jawalakhel, Lalitpur', '+9779851234588', 'Amit Rana', 27.6656, 85.3150, 'PUBLIC', 'Workshop', 4500.00, 'Cash', true, 45000.00, 25.00),
('C023', 'Speed Auto Service', 'Kathmandu', 'Kathmandu', 'Koteshwor, Kathmandu', '+9779861234589', 'Ravi Thapa', 27.6766, 85.3477, 'PUBLIC', 'Workshop', 6000.00, 'Cash', true, 55000.00, 25.00),
('C024', 'Expert Car Care', 'Bhaktapur', 'Bhaktapur', 'Thimi, Bhaktapur', '+9779871234590', 'Sunil Karki', 27.6813, 85.3897, 'PUBLIC', 'Workshop', 3500.00, 'Cash', true, 40000.00, 25.00),
('C025', 'Pro Auto Workshop', 'Pokhara', 'Kaski', 'Prithvi Chowk, Pokhara', '+9779881234591', 'Ganesh Magar', 28.2096, 83.9856, 'PUBLIC', 'Workshop', 4000.00, 'Cash', true, 42000.00, 25.00),
('C026', 'Rainbow Automobiles', 'Kathmandu', 'Kathmandu', 'Balaju, Kathmandu', '+9779891234592', 'Kiran Dahal', 27.7361, 85.3013, 'PUBLIC', 'Workshop', 5500.00, 'Cash', true, 48000.00, 25.00),
('C027', 'Everest Auto Care', 'Kathmandu', 'Kathmandu', 'Baneshwor, Kathmandu', '+9779801234593', 'Nabin Basnet', 27.6946, 85.3394, 'PUBLIC', 'Workshop', 3800.00, 'Cash', true, 38000.00, 25.00),
('C028', 'Mountain Motors', 'Pokhara', 'Kaski', 'Lakeside, Pokhara', '+9779811234594', 'Deepak Gurung', 28.2096, 83.9620, 'PUBLIC', 'Workshop', 4200.00, 'Cash', true, 43000.00, 25.00),
('C029', 'Valley Auto Service', 'Lalitpur', 'Lalitpur', 'Satdobato, Lalitpur', '+9779821234595', 'Anil Tamang', 27.6500, 85.3333, 'PUBLIC', 'Workshop', 5200.00, 'Cash', true, 47000.00, 25.00),
('C030', 'Highway Auto Repair', 'Bhaktapur', 'Bhaktapur', 'Suryabinayak, Bhaktapur', '+9779831234596', 'Bijay Shrestha', 27.6710, 85.4350, 'PUBLIC', 'Workshop', 3600.00, 'Cash', true, 39000.00, 25.00),

-- Additional Mixed Grade Customers
('C031', 'Nepal Auto Traders', 'Kathmandu', 'Kathmandu', 'Kalimati, Kathmandu', '+9779841234597', 'Rajendra Bajracharya', 27.6975, 85.2956, 'HRS', 'Wholesaler', 32000.00, '15 days', true, 340000.00, 37.00),
('C032', 'Eastern Motors', 'Biratnagar', 'Morang', 'Traffic Chowk, Biratnagar', '+9779851234598', 'Prem Rai', 26.4525, 87.2800, 'CAT', 'Retailer', 19000.00, '7 days', true, 210000.00, 35.00),
('C033', 'Western Auto Hub', 'Nepalgunj', 'Banke', 'Tribhuvan Chowk, Nepalgunj', '+9779861234599', 'Gopal Tharu', 28.0500, 81.6200, 'CAT', 'Retailer', 17000.00, '7 days', true, 200000.00, 35.00),
('C034', 'Central Parts Store', 'Bharatpur', 'Chitwan', 'Narayanghat, Bharatpur', '+9779871234600', 'Krishna Bhandari', 27.7000, 84.4333, 'TORT', 'Retailer', 11500.00, 'Cash', true, 148000.00, 33.50),
('C035', 'Quick Parts Kathmandu', 'Kathmandu', 'Kathmandu', 'Teku, Kathmandu', '+9779881234601', 'Sagar Rai', 27.6939, 85.3072, 'PUBLIC', 'Workshop', 4600.00, 'Cash', true, 46000.00, 25.00),
('C036', 'Premier Auto Solutions', 'Lalitpur', 'Lalitpur', 'Kupondole, Lalitpur', '+9779891234602', 'Manoj Adhikari', 27.6833, 85.3158, 'LEO', 'Wholesaler', 55000.00, '45 days', true, 520000.00, 40.00),
('C037', 'Quality Motors', 'Pokhara', 'Kaski', 'Zero KM, Pokhara', '+9779801234603', 'Ramesh Adhikari', 28.2167, 83.9833, 'HRS', 'Retailer', 27000.00, '15 days', true, 310000.00, 37.00),
('C038', 'Superior Auto Parts', 'Butwal', 'Rupandehi', 'Golpark, Butwal', '+9779811234604', 'Jeevan Paudel', 27.7000, 83.4600, 'CAT', 'Retailer', 18500.00, '7 days', true, 205000.00, 35.00),
('C039', 'Fast Track Garage', 'Kathmandu', 'Kathmandu', 'Kalanki, Kathmandu', '+9779821234605', 'Deepak Bista', 27.6938, 85.2828, 'PUBLIC', 'Workshop', 5300.00, 'Cash', true, 49000.00, 25.00),
('C040', 'Reliable Auto Service', 'Bhaktapur', 'Bhaktapur', 'Lokanthali, Bhaktapur', '+9779831234606', 'Suresh Maharjan', 27.6833, 85.4167, 'PUBLIC', 'Workshop', 3900.00, 'Cash', true, 41000.00, 25.00),

-- Final 10 customers
('C041', 'Metro Auto Center', 'Kathmandu', 'Kathmandu', 'Battisputali, Kathmandu', '+9779841234607', 'Nirajan Shakya', 27.6961, 85.3386, 'TORT', 'Retailer', 10500.00, 'Cash', true, 142000.00, 33.50),
('C042', 'National Motors', 'Lalitpur', 'Lalitpur', 'Lagankhel, Lalitpur', '+9779851234608', 'Bikram Tamang', 27.6667, 85.3275, 'CAT', 'Retailer', 16500.00, '7 days', true, 195000.00, 35.00),
('C043', 'City Parts Trading', 'Kathmandu', 'Kathmandu', 'Anamnagar, Kathmandu', '+9779861234609', 'Anish Khatri', 27.7125, 85.3264, 'HRS', 'Retailer', 29000.00, '15 days', true, 325000.00, 37.00),
('C044', 'Valley Motors', 'Bhaktapur', 'Bhaktapur', 'Changunarayan, Bhaktapur', '+9779871234610', 'Prakash Dangol', 27.7167, 85.4333, 'PUBLIC', 'Workshop', 4100.00, 'Cash', true, 44000.00, 25.00),
('C045', 'Express Auto Shop', 'Pokhara', 'Kaski', 'Bagar, Pokhara', '+9779881234611', 'Rabindra Pun', 28.2096, 83.9700, 'TORT', 'Retailer', 9500.00, 'Cash', true, 135000.00, 33.50),
('C046', 'Prime Auto Parts', 'Kathmandu', 'Kathmandu', 'Gongabu, Kathmandu', '+9779891234612', 'Saroj Dangal', 27.7433, 85.3206, 'CAT', 'Retailer', 17500.00, '7 days', true, 198000.00, 35.00),
('C047', 'Elite Auto Service', 'Lalitpur', 'Lalitpur', 'Ekantakuna, Lalitpur', '+9779801234613', 'Nitesh Joshi', 27.6667, 85.3333, 'PUBLIC', 'Workshop', 4400.00, 'Cash', true, 45000.00, 25.00),
('C048', 'Golden Motors', 'Biratnagar', 'Morang', 'Tinpaini, Biratnagar', '+9779811234614', 'Ashok Limbu', 26.4600, 87.2718, 'HRS', 'Retailer', 26500.00, '15 days', true, 305000.00, 37.00),
('C049', 'Smart Auto Solutions', 'Kathmandu', 'Kathmandu', 'Thapathali, Kathmandu', '+9779821234615', 'Milan Karki', 27.6914, 85.3231, 'PUBLIC', 'Workshop', 5100.00, 'Cash', true, 50000.00, 25.00),
('C050', 'Ace Auto Parts', 'Pokhara', 'Kaski', 'Chipledhunga, Pokhara', '+9779831234616', 'Santosh Gurung', 28.2167, 83.9856, 'LEO', 'Wholesaler', 48000.00, '30 days', true, 470000.00, 40.00);

-- Verification queries
-- SELECT customer_grade, COUNT(*) as count FROM customers GROUP BY customer_grade;
-- SELECT city, COUNT(*) as count FROM customers GROUP BY city ORDER BY count DESC LIMIT 10;
-- SELECT retailer_type, COUNT(*) as count FROM customers GROUP BY retailer_type;
