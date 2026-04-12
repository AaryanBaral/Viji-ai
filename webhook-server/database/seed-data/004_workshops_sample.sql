-- =====================================================
-- WORKSHOPS SEED DATA - SAMPLE
-- Total Records: 40 sample workshops
-- Note: Replace with full 1,225 workshops from your CSV
-- =====================================================

-- Clear existing data (optional)
-- DELETE FROM workshops;

-- Insert sample workshops
INSERT INTO workshops (
    name, address, city, district, zone,
    latitude, longitude, owner_name, owner_whatsapp,
    mechanic_name, mechanic_phone, segment,
    monthly_servicing, supplier_1, supplier_2, supplier_3,
    year_incorporated, is_active
) VALUES
-- Kathmandu Valley Workshops
('Everest Auto Workshop', 'Chabahil-6, Kathmandu', 'Kathmandu', 'Kathmandu', 'Bagmati', 27.7216, 85.3602, 'Ram Prasad Sharma', '+9779841111111', 'Santosh Kumar', '+9779841111112', 'A', '50-100', 'LTVS', 'Kathmandu Auto Parts', 'ABC Motors', '2015', true),
('Himalayan Motors', 'New Baneshwor, Kathmandu', 'Kathmandu', 'Kathmandu', 'Bagmati', 27.6946, 85.3394, 'Shyam Bahadur Thapa', '+9779842222222', 'Rajesh Tamang', '+9779842222223', 'A', '50-100', 'LTVS', 'Lalitpur Motors', 'XYZ Parts', '2012', true),
('Valley Auto Care', 'Koteshwor-32, Kathmandu', 'Kathmandu', 'Kathmandu', 'Bagmati', 27.6766, 85.3477, 'Krishna Maharjan', '+9779843333333', 'Dipak Shrestha', '+9779843333334', 'B', '30-50', 'LTVS', 'Kathmandu Auto Parts', NULL, '2018', true),
('City Garage', 'Balaju-16, Kathmandu', 'Kathmandu', 'Kathmandu', 'Bagmati', 27.7361, 85.3013, 'Hari Prasad Gurung', '+9779844444444', 'Manoj Rai', '+9779844444445', 'B', '30-50', 'Kathmandu Auto Parts', 'ABC Motors', NULL, '2016', true),
('Metro Auto Service', 'Kalimati, Kathmandu', 'Kathmandu', 'Kathmandu', 'Bagmati', 27.6975, 85.2956, 'Bijay Kumar Karki', '+9779845555555', 'Sanjay Thapa', '+9779845555556', 'A', '50-100', 'LTVS', 'Kathmandu Auto Parts', 'Lalitpur Motors', '2014', true),

('Pulchowk Auto Works', 'Pulchowk, Lalitpur', 'Lalitpur', 'Lalitpur', 'Bagmati', 27.6683, 85.3206, 'Mohan Shakya', '+9779846666666', 'Pramod Tamang', '+9779846666667', 'A', '100+', 'LTVS', 'Lalitpur Motors', 'Bhaktapur Spare Parts', '2010', true),
('Jawalakhel Motors', 'Jawalakhel-25, Lalitpur', 'Lalitpur', 'Lalitpur', 'Bagmati', 27.6656, 85.3150, 'Narayan Shrestha', '+9779847777777', 'Bikash Maharjan', '+9779847777778', 'B', '30-50', 'Lalitpur Motors', 'LTVS', NULL, '2017', true),
('Satdobato Auto Center', 'Satdobato, Lalitpur', 'Lalitpur', 'Lalitpur', 'Bagmati', 27.6500, 85.3333, 'Ramesh Dangol', '+9779848888888', 'Suresh Karki', '+9779848888889', 'B', '30-50', 'LTVS', 'ABC Motors', NULL, '2019', true),

('Bhaktapur Auto Workshop', 'Suryabinayak-4, Bhaktapur', 'Bhaktapur', 'Bhaktapur', 'Bagmati', 27.6710, 85.4298, 'Prakash Rajbhandari', '+9779849999999', 'Nabin Prajapati', '+9779849999990', 'A', '50-100', 'Bhaktapur Spare Parts', 'LTVS', 'Kathmandu Auto Parts', '2013', true),
('Thimi Auto Service', 'Thimi-8, Bhaktapur', 'Bhaktapur', 'Bhaktapur', 'Bagmati', 27.6813, 85.3897, 'Ganesh Joshi', '+9779840000001', 'Deepak Shrestha', '+9779840000002', 'B', '30-50', 'LTVS', 'Bhaktapur Spare Parts', NULL, '2016', true),

-- Pokhara Workshops
('Pokhara Auto Hub', 'Mahendrapool-17, Pokhara', 'Pokhara', 'Kaski', 'Gandaki', 28.2096, 83.9856, 'Bikash Thapa Magar', '+9779840000003', 'Ramesh Gurung', '+9779840000004', 'A', '100+', 'Pokhara Auto Center', 'LTVS', 'Western Auto Hub', '2011', true),
('Lakeside Motors', 'Lakeside-6, Pokhara', 'Pokhara', 'Kaski', 'Gandaki', 28.2096, 83.9620, 'Deepak Gurung', '+9779840000005', 'Krishna Pun', '+9779840000006', 'B', '50-100', 'Pokhara Auto Center', 'LTVS', NULL, '2015', true),
('Zero KM Auto Service', 'Zero KM, Pokhara', 'Pokhara', 'Kaski', 'Gandaki', 28.2167, 83.9833, 'Ramesh Adhikari', '+9779840000007', 'Santosh Magar', '+9779840000008', 'A', '50-100', 'LTVS', 'Pokhara Auto Center', 'ABC Motors', '2014', true),
('Prithvi Chowk Garage', 'Prithvi Chowk, Pokhara', 'Pokhara', 'Kaski', 'Gandaki', 28.2096, 83.9856, 'Ganesh Poudel', '+9779840000009', 'Naresh Gurung', '+9779840000010', 'B', '30-50', 'Pokhara Auto Center', 'LTVS', NULL, '2017', true),

-- Chitwan Workshops
('Bharatpur Auto Works', 'Pulchowk-4, Bharatpur', 'Bharatpur', 'Chitwan', 'Bagmati', 27.6833, 84.4333, 'Kamal Ghimire', '+9779840000011', 'Rajesh Bhandari', '+9779840000012', 'A', '50-100', 'LTVS', 'Central Parts Store', 'ABC Motors', '2013', true),
('Narayanghat Motors', 'Narayanghat-10, Bharatpur', 'Bharatpur', 'Chitwan', 'Bagmati', 27.7000, 84.4333, 'Krishna Bhandari', '+9779840000013', 'Sunil Tharu', '+9779840000014', 'B', '30-50', 'Central Parts Store', 'LTVS', NULL, '2016', true),

-- Butwal/Rupandehi Workshops
('Butwal Auto Center', 'Traffic Chowk, Butwal', 'Butwal', 'Rupandehi', 'Lumbini', 27.7000, 83.4500, 'Rajesh Shrestha', '+9779840000015', 'Prakash Paudel', '+9779840000016', 'A', '100+', 'Butwal Vehicle Parts', 'LTVS', 'Western Auto Hub', '2010', true),
('Golpark Auto Service', 'Golpark-12, Butwal', 'Butwal', 'Rupandehi', 'Lumbini', 27.7000, 83.4600, 'Jeevan Paudel', '+9779840000017', 'Binod Sharma', '+9779840000018', 'B', '50-100', 'LTVS', 'Butwal Vehicle Parts', NULL, '2015', true),
('Siddharthanagar Motors', 'Manigram, Siddharthanagar', 'Siddharthanagar', 'Rupandehi', 'Lumbini', 27.5031, 83.4602, 'Mahesh Pandey', '+9779840000019', 'Raju Thapa', '+9779840000020', 'B', '30-50', 'LTVS', 'Butwal Vehicle Parts', NULL, '2018', true),

-- Biratnagar/Morang Workshops
('Biratnagar Auto Hub', 'Main Road-15, Biratnagar', 'Biratnagar', 'Morang', 'Koshi', 26.4525, 87.2718, 'Krishna Rai', '+9779840000021', 'Prem Limbu', '+9779840000022', 'A', '100+', 'Biratnagar Parts Hub', 'LTVS', 'Eastern Motors', '2012', true),
('Traffic Chowk Garage', 'Traffic Chowk, Biratnagar', 'Biratnagar', 'Morang', 'Koshi', 26.4525, 87.2800, 'Prem Rai', '+9779840000023', 'Santosh Limbu', '+9779840000024', 'B', '50-100', 'LTVS', 'Biratnagar Parts Hub', 'Golden Motors', '2016', true),
('Tinpaini Auto Service', 'Tinpaini-8, Biratnagar', 'Biratnagar', 'Morang', 'Koshi', 26.4600, 87.2718, 'Ashok Limbu', '+9779840000025', 'Ramesh Rai', '+9779840000026', 'B', '30-50', 'Biratnagar Parts Hub', 'LTVS', NULL, '2017', true),

-- Dharan/Sunsari Workshops
('Dharan Auto Works', 'Bhanu Chowk-12, Dharan', 'Dharan', 'Sunsari', 'Koshi', 26.8148, 87.2833, 'Prakash Limbu', '+9779840000027', 'Bijay Rai', '+9779840000028', 'A', '50-100', 'LTVS', 'Dharan Motors', 'Eastern Motors', '2014', true),
('Itahari Motors', 'Dharan Road, Itahari', 'Itahari', 'Sunsari', 'Koshi', 26.6667, 87.2833, 'Santosh Karki', '+9779840000029', 'Krishna Rai', '+9779840000030', 'B', '30-50', 'LTVS', 'Dharan Motors', NULL, '2016', true),

-- Nepalgunj/Banke Workshops
('Nepalgunj Auto Center', 'Dhamboji-11, Nepalgunj', 'Nepalgunj', 'Banke', 'Lumbini', 28.0500, 81.6167, 'Ramesh Tharu', '+9779840000031', 'Gopal Chaudhary', '+9779840000032', 'A', '50-100', 'Nepalgunj Auto Parts', 'LTVS', 'Western Auto Hub', '2013', true),
('Tribhuvan Chowk Garage', 'Tribhuvan Chowk, Nepalgunj', 'Nepalgunj', 'Banke', 'Lumbini', 28.0500, 81.6200, 'Gopal Tharu', '+9779840000033', 'Ram Tharu', '+9779840000034', 'B', '30-50', 'LTVS', 'Nepalgunj Auto Parts', NULL, '2017', true),

-- Birgunj/Parsa Workshops
('Birgunj Auto Hub', 'Ghantaghar-14, Birgunj', 'Birgunj', 'Parsa', 'Madhesh', 27.0000, 84.8667, 'Mohan Yadav', '+9779840000035', 'Santosh Sah', '+9779840000036', 'A', '50-100', 'LTVS', 'Birgunj Vehicle Center', 'Central Parts Store', '2012', true),
('Parsa Auto Service', 'Main Road-8, Birgunj', 'Birgunj', 'Parsa', 'Madhesh', 27.0000, 84.8700, 'Rajesh Yadav', '+9779840000037', 'Krishna Sah', '+9779840000038', 'B', '30-50', 'Birgunj Vehicle Center', 'LTVS', NULL, '2016', true),

-- Hetauda/Makwanpur Workshops
('Hetauda Motors', 'BP Chowk-9, Hetauda', 'Hetauda', 'Makwanpur', 'Bagmati', 27.4287, 85.0327, 'Suman Tamang', '+9779840000039', 'Prakash Gurung', '+9779840000040', 'B', '30-50', 'LTVS', 'Hetauda Auto Shop', 'Central Parts Store', '2015', true),

-- Janakpur/Dhanusha Workshops
('Janakpur Auto Works', 'Station Road-7, Janakpur', 'Janakpur', 'Dhanusha', 'Madhesh', 26.7288, 85.9244, 'Dilip Kumar', '+9779840000041', 'Ramesh Sah', '+9779840000042', 'B', '30-50', 'LTVS', 'Janakpur Motors', NULL, '2016', true),

-- Damak/Jhapa Workshops
('Damak Motors', 'Main Chowk-6, Damak', 'Damak', 'Jhapa', 'Koshi', 26.6607, 87.7050, 'Arjun Gurung', '+9779840000043', 'Bijay Limbu', '+9779840000044', 'B', '30-50', 'LTVS', 'Damak Motors', 'Eastern Motors', '2017', true),

-- Lahan/Siraha Workshops
('Lahan Auto Center', 'BP Chowk-5, Lahan', 'Lahan', 'Siraha', 'Madhesh', 26.7205, 86.4777, 'Naresh Sah', '+9779840000045', 'Santosh Yadav', '+9779840000046', 'C', '10-30', 'LTVS', 'Lahan Motors', NULL, '2018', true),

-- Tulsipur/Dang Workshops
('Tulsipur Auto Service', 'Main Road-4, Tulsipur', 'Tulsipur', 'Dang', 'Lumbini', 28.1333, 82.3000, 'Dipak Chaudhary', '+9779840000047', 'Ram Tharu', '+9779840000048', 'C', '10-30', 'LTVS', 'Tulsipur Parts Center', NULL, '2019', true),

-- Dhangadhi/Kailali Workshops
('Dhangadhi Motors', 'Attariya Road-10, Dhangadhi', 'Dhangadhi', 'Kailali', 'Sudurpashchim', 28.6940, 80.5895, 'Suresh Bista', '+9779840000049', 'Prakash Chaudhary', '+9779840000050', 'B', '30-50', 'LTVS', 'Dhangadhi Auto Shop', 'Western Auto Hub', '2015', true),

-- Gorkha Workshops
('Gorkha Auto Works', 'Bus Park-3, Gorkha', 'Gorkha', 'Gorkha', 'Gandaki', 28.0000, 84.6333, 'Raju Gurung', '+9779840000051', 'Santosh Gurung', '+9779840000052', 'C', '10-30', 'LTVS', 'Gorkha Auto Parts', NULL, '2018', true),

-- Additional Kathmandu Workshops
('Kalanki Auto Service', 'Kalanki-14, Kathmandu', 'Kathmandu', 'Kathmandu', 'Bagmati', 27.6938, 85.2828, 'Deepak Bista', '+9779840000053', 'Nabin Shrestha', '+9779840000054', 'B', '30-50', 'LTVS', 'Kathmandu Auto Parts', NULL, '2017', true),
('Anamnagar Motors', 'Anamnagar-8, Kathmandu', 'Kathmandu', 'Kathmandu', 'Bagmati', 27.7125, 85.3264, 'Anish Khatri', '+9779840000055', 'Sanjay Karki', '+9779840000056', 'B', '30-50', 'Kathmandu Auto Parts', 'LTVS', NULL, '2016', true),
('Gongabu Auto Works', 'Gongabu-16, Kathmandu', 'Kathmandu', 'Kathmandu', 'Bagmati', 27.7433, 85.3206, 'Saroj Dangal', '+9779840000057', 'Ramesh Tamang', '+9779840000058', 'B', '30-50', 'LTVS', 'Kathmandu Auto Parts', NULL, '2018', true);

-- Verification queries
-- SELECT segment, COUNT(*) as count FROM workshops GROUP BY segment;
-- SELECT city, COUNT(*) as count FROM workshops GROUP BY city ORDER BY count DESC;
-- SELECT zone, COUNT(*) as count FROM workshops WHERE zone IS NOT NULL GROUP BY zone;
