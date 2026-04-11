# 🌱 Seed Data for Vehicle Parts Chatbot Database

## 📋 Overview

This directory contains SQL scripts to populate your Supabase database with realistic test data. Use this data to test your chatbot, API endpoints, and application features during development.

## 📁 File Structure

```
seed-data/
├── 000_run_all_seeds.sql          # Master file with instructions
├── 001_discount_grades.sql        # 5 discount tiers
├── 002_customers_sample.sql       # 50 test customers
├── 003_products_sample.sql        # 30 vehicle parts
├── 004_workshops_sample.sql       # 40 workshop locations
├── 005_sample_orders.sql          # 20 sample orders
├── 006_auto_responses.sql         # 20 bilingual responses
└── README.md                      # This file
```

## 🎯 What's Included

### 1. **Discount Grades** (001_discount_grades.sql)
- **5 records**
- Customer discount tiers:
  - LEO: 40% discount (top tier)
  - HRS: 37% discount
  - CAT: 35% discount
  - TORT: 33.5% discount
  - PUBLIC: 25% discount (standard)

### 2. **Customers** (002_customers_sample.sql)
- **50 sample customers**
- Distribution:
  - 5 LEO customers (wholesalers)
  - 10 HRS customers (retailers)
  - 10 CAT customers (retailers)
  - 5 TORT customers (small retailers)
  - 20 PUBLIC customers (workshops)
- Locations across major Nepali cities
- Realistic phone numbers, addresses, credit limits

### 3. **Products** (003_products_sample.sql)
- **30 vehicle parts**
- Categories: Brake, Filter, Oil, Clutch, Suspension, Battery, Wiper
- Vehicles covered:
  - Toyota Corolla
  - Honda City
  - Maruti Swift
  - Hyundai i20
  - Tata Tiago
  - Universal parts
- Includes pricing, stock levels, reorder points

### 4. **Workshops** (004_workshops_sample.sql)
- **40 partner workshops**
- Locations:
  - Kathmandu Valley (15 workshops)
  - Pokhara (4 workshops)
  - Other major cities (21 workshops)
- Includes owner info, mechanics, segments, suppliers

### 5. **Sample Orders** (005_sample_orders.sql)
- **20 orders**
- Status distribution:
  - 13 completed
  - 4 pending
  - 2 processing
  - 1 cancelled
- Demonstrates different customer grades
- Total order value: ~260,000 NPR

### 6. **Auto Responses** (006_auto_responses.sql)
- **20 bilingual responses**
- Categories:
  - Greetings
  - Product queries
  - Order process
  - Customer account
  - Workshop finder
  - Help & support
- English and Nepali translations

## 🚀 Quick Start

### Option 1: Copy-Paste Method (Recommended for beginners)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com
   - Select your project: `spare_parts_db`
   - Click "SQL Editor" in sidebar

2. **Run Each File in Order:**

   **Step 1:** Discount Grades
   ```
   - Open file: 001_discount_grades.sql
   - Copy entire contents
   - Paste in Supabase SQL Editor
   - Click "RUN" button
   - Verify: Should see "Success. Rows affected: 5"
   ```

   **Step 2:** Customers
   ```
   - Open file: 002_customers_sample.sql
   - Copy entire contents
   - Paste in SQL Editor
   - Click "RUN"
   - Verify: Should see "Success. Rows affected: 50"
   ```

   **Step 3:** Products
   ```
   - Open file: 003_products_sample.sql
   - Copy & paste
   - Click "RUN"
   - Verify: 30 rows
   ```

   **Step 4:** Workshops
   ```
   - Open file: 004_workshops_sample.sql
   - Copy & paste
   - Click "RUN"
   - Verify: 40 rows
   ```

   **Step 5:** Auto Responses
   ```
   - Open file: 006_auto_responses.sql
   - Copy & paste
   - Click "RUN"
   - Verify: 20 rows
   ```

   **Step 6:** Sample Orders (LAST!)
   ```
   - Open file: 005_sample_orders.sql
   - Copy & paste
   - Click "RUN"
   - Verify: 20+ rows
   ```

### Option 2: Command Line (Advanced)

If you have Supabase CLI installed:

```bash
# From your project root
cd database/seed-data

# Run each file
supabase db execute -f 001_discount_grades.sql
supabase db execute -f 002_customers_sample.sql
supabase db execute -f 003_products_sample.sql
supabase db execute -f 004_workshops_sample.sql
supabase db execute -f 006_auto_responses.sql
supabase db execute -f 005_sample_orders.sql
```

## ✅ Verification

After running all seed files, verify the data:

### Check Record Counts
```sql
SELECT 
    'discount_grades' as table_name, COUNT(*) as records FROM discount_grades
UNION ALL
SELECT 'customers', COUNT(*) FROM customers
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'workshops', COUNT(*) FROM workshops
UNION ALL
SELECT 'auto_responses', COUNT(*) FROM auto_responses
UNION ALL
SELECT 'orders', COUNT(*) FROM orders;
```

**Expected Results:**
```
discount_grades:  5
customers:       50
products:        30
workshops:       40
auto_responses:  20
orders:          20
```

### Test Customer Recognition
```sql
-- Find customer by phone
SELECT customer_code, name, customer_grade, phone
FROM customers 
WHERE phone = '+9779841234567';
```

### Test Product Search
```sql
-- Find Toyota Corolla parts
SELECT product_code, name, category, unit_price
FROM products 
WHERE vehicle_make = 'Toyota' 
  AND vehicle_model = 'Corolla';
```

### Test Discount Calculation
```sql
-- Calculate discounted prices for LEO customers
SELECT 
    p.name,
    p.unit_price as original_price,
    dg.discount_percentage,
    ROUND((p.unit_price * (1 - dg.discount_percentage/100))::numeric, 2) as discounted_price
FROM products p
CROSS JOIN discount_grades dg
WHERE dg.grade_code = 'LEO'
LIMIT 10;
```

### Test Workshop Finder
```sql
-- Find workshops in Kathmandu
SELECT name, address, segment, monthly_servicing
FROM workshops 
WHERE city = 'Kathmandu'
ORDER BY name;
```

## 🔄 Resetting Data

To clear all seed data and start fresh:

```sql
-- ⚠️ WARNING: This deletes ALL data!
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM auto_responses;
DELETE FROM workshops;
DELETE FROM products;
DELETE FROM customers;
DELETE FROM discount_grades;

-- Now re-run seed files
```

## 📝 Important Notes

### ⚠️ This is TEST Data!

- **NOT for production use**
- Sample data for development only
- Phone numbers are fictional
- Order data is completely made up

### 🔄 Replace with Real Data

Before going to production, replace with:

1. **Full Customer Data**
   - Source: `customers_cleaned_for_supabase.csv`
   - Records: 958 customers
   - Use CSV-to-SQL converter script

2. **Full Product Data**
   - Source: `LTVS_Items_For_SupabaseSheet1 2.csv`
   - Records: 231 products
   - Contains all actual inventory

3. **Full Workshop Data**
   - Source: `workshops_cleaned_for_supabase.csv`
   - Records: 1,225 workshops
   - All partner locations

### 📱 Phone Number Format

All customer phone numbers use format: `+977XXXXXXXXXX`
- Example: `+9779841234567`
- Required for WhatsApp integration
- Update with real test numbers for testing

## 🧪 Testing Scenarios

Use this seed data to test:

### 1. Customer Recognition
```
Customer: "Hi, my code is C001"
Expected: Recognize "Kathmandu Auto Parts", LEO grade, 40% discount
```

### 2. Product Search
```
Customer: "I need brake pads for Toyota Corolla"
Expected: Show BRK-TOY-COR-001 with discounted price
```

### 3. Order Placement
```
Customer: "I want to order 5 units of BRK-TOY-COR-001"
Expected: Calculate total with customer's discount
```

### 4. Workshop Finder
```
Customer: "Find workshops near Kathmandu"
Expected: Return list of Kathmandu workshops with details
```

### 5. Multi-lingual Responses
```
Customer: "नमस्कार" (Nepali greeting)
Expected: Respond in Nepali from auto_responses
```

## 🎯 Next Steps

After seeding data:

1. ✅ **Test Database Queries**
   - Run verification queries above
   - Ensure data is correct

2. ✅ **Test API Endpoints**
   - Customer recognition endpoint
   - Product search endpoint
   - Order creation endpoint
   - Workshop finder endpoint

3. ✅ **Configure Botpress**
   - Set up customer flow
   - Test with sample phone numbers
   - Verify discount calculations

4. ✅ **Performance Testing**
   - Test query speeds with indexes
   - Monitor response times
   - Optimize slow queries

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Tutorial](https://www.postgresql.org/docs/)
- Main Project README: `../../README.md`
- Database Schema: `../schema-actual.sql`

## 🆘 Troubleshooting

### Issue: "Foreign key violation"
**Solution:** Make sure you run files in correct order. Orders MUST be last!

### Issue: "Duplicate key error"
**Solution:** Clear existing data first:
```sql
DELETE FROM customers WHERE customer_code LIKE 'C0%';
```

### Issue: "Column does not exist"
**Solution:** Verify your database schema matches `schema-actual.sql`

### Issue: "Permission denied"
**Solution:** Check Row Level Security policies are configured correctly

## 📞 Support

Stuck? Check:
1. `000_run_all_seeds.sql` - Has detailed instructions
2. GitHub Issues - Post your question
3. Project documentation in `/docs`

---

**Created:** October 20, 2025  
**Version:** 1.0  
**Last Updated:** October 20, 2025
