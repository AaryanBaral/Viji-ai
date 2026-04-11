-- =====================================================
-- DISCOUNT GRADES SEED DATA
-- Total Records: 5
-- Customer discount tiers for vehicle parts business
-- =====================================================

-- Clear existing data (optional - uncomment if you want to reset)
-- DELETE FROM discount_grades;

-- Insert discount grades
INSERT INTO discount_grades (
    grade_code, 
    grade_name, 
    discount_percentage, 
    description, 
    sort_order, 
    is_active
) VALUES
('LEO', 'LEO Grade', 40.00, 'Highest tier customers - 40% discount', 1, true),
('HRS', 'HRS Grade', 37.00, 'High-value customers - 37% discount', 2, true),
('CAT', 'CAT Grade', 35.00, 'Category customers - 35% discount', 3, true),
('TORT', 'TORT Grade', 33.50, 'Tort customers - 33.5% discount', 4, true),
('PUBLIC', 'Public/Retail', 25.00, 'Standard retail customers - 25% discount', 5, true);

-- Verification query
-- SELECT * FROM discount_grades ORDER BY sort_order;
