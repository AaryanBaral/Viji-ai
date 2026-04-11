# Database Schema Documentation

## Overview
PostgreSQL database hosted on Supabase with 5 core tables.

## Tables

### 1. discount_grades
Defines customer discount tiers.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| grade_code | TEXT | LEO, HRS, CAT, TORT, PUBLIC |
| grade_name | TEXT | Full name of grade |
| discount_percentage | DECIMAL(5,2) | Discount % (25-40) |
| is_active | BOOLEAN | Active status |

**Data:**
- LEO (Leopard): 40% - Premium partners
- HRS (Horse): 37% - Excellent partners
- CAT (Cat): 35% - Good partners
- TORT (Tortoise): 33.5% - Standard partners
- PUBLIC: 25% - New customers

### 2. customers
Customer master data with grading.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| customer_code | TEXT | Unique identifier (from CSV) |
| name | TEXT | Customer name |
| phone | TEXT | Phone number (for WhatsApp recognition) |
| customer_grade | TEXT | FK to discount_grades.grade_code |
| balance_lcy | DECIMAL(10,2) | Current balance |
| retailer_type | TEXT | HCV, MUV, PC, etc. |
| latitude | DECIMAL(9,6) | GPS latitude |
| longitude | DECIMAL(9,6) | GPS longitude |

**Indexes:**
- customer_code (unique)
- phone (for quick lookup)
- customer_grade (for filtering)

### 3. products
Vehicle parts catalog.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| product_code | TEXT | Unique SKU |
| name | TEXT | Product name |
| category | TEXT | Engine, Brake, Electrical, etc. |
| brand | TEXT | Manufacturer |
| unit_price | DECIMAL(10,2) | Base price |
| stock_quantity | INTEGER | Current stock |
| vehicle_make | TEXT | Toyota, Honda, Tata, etc. |
| vehicle_model | TEXT | Corolla, City, Ace, etc. |
| movement | TEXT | Fast/Medium/Slow |

### 4. workshops
Network of repair shops.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Workshop name |
| latitude | DECIMAL(9,6) | GPS latitude |
| longitude | DECIMAL(9,6) | GPS longitude |
| owner_whatsapp | TEXT | Owner's WhatsApp |
| segment | TEXT | MUV, PC, HCV, etc. |

### 5. orders & order_items
Order processing and history.

**orders table:**
- order_number (unique)
- customer_id (FK)
- status (pending, confirmed, delivered)
- total_amount
- discount_amount

**order_items table:**
- order_id (FK)
- product_id (FK)
- quantity
- unit_price (at time of order)
- line_total

## Relationships
```
customers
  ├─→ discount_grades (customer_grade)
  └─→ orders (customer_id)
        └─→ order_items (order_id)
              └─→ products (product_id)
```

## Custom Functions

### calculate_discounted_price(product_id, customer_grade)
Returns price after applying customer's discount.

### find_nearby_workshops(latitude, longitude, radius_km)
Returns workshops within specified radius using Haversine formula.

## Row Level Security (RLS)

- Customers can only see their own orders
- Products are publicly readable
- Orders and order_items require authentication
```

---

## Step 1.10: Commit Everything and Push (15 minutes)

### GitHub Desktop:

1. **Review changes** in Changes tab
2. **Commit message:**
```
   Complete Phase 1: GitHub foundation setup
   
   - Created repository structure
   - Configured GitHub Actions for CI/CD
   - Set up branch protection rules
   - Created project board for tracking
   - Added documentation templates
   - Configured security scanning