-- =====================================================
-- VEHICLE PARTS CHATBOT - ACTUAL DATABASE SCHEMA
-- Generated: October 19, 2025
-- Database: spare_parts_db (Supabase/PostgreSQL)
-- Total Tables: 13
-- =====================================================

-- =================
-- CORE BUSINESS TABLES
-- =================

-- 1. DISCOUNT_GRADES (8 columns)
-- Customer discount tiers: LEO(40%), HRS(37%), CAT(35%), TORT(33.5%), PUBLIC(25%)
CREATE TABLE discount_grades (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    grade_code text NOT NULL,
    grade_name text NOT NULL,
    discount_percentage numeric NOT NULL,
    description text,
    sort_order integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);

-- 2. CUSTOMERS (29 columns)
-- Comprehensive customer master data
CREATE TABLE customers (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_code text NOT NULL,
    name text NOT NULL,
    city text,
    district text,
    address text,
    phone text,
    contact_person text,
    latitude numeric,
    longitude numeric,
    customer_grade text DEFAULT 'PUBLIC'::text,
    retailer_type text,
    balance_lcy numeric DEFAULT 0,
    payment_terms text,
    is_active boolean DEFAULT true,
    credit_limit numeric DEFAULT 0,
    base_discount_percentage numeric,
    custom_discount_percentage numeric,
    use_custom_discount boolean DEFAULT false,
    pdc_amount numeric,
    assigned_workshop_id uuid,
    territory text,
    sales_person_code text,
    total_orders integer DEFAULT 0,
    lifetime_value numeric DEFAULT 0,
    last_order_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    whatsapp_number text
);

-- 3. PRODUCTS (19 columns)
-- Vehicle parts inventory
CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_code text NOT NULL,
    name text NOT NULL,
    description text,
    category text,
    brand text,
    unit_price numeric NOT NULL,
    cost_price numeric,
    stock_quantity integer DEFAULT 0,
    reorder_point integer DEFAULT 0,
    unit_of_measure text DEFAULT 'PCS'::text,
    vehicle_make text,
    vehicle_model text,
    sales_target integer,
    movement text,
    safety_stock_quantity integer DEFAULT 0,
    image_url text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- 4. WORKSHOPS (20 columns)
-- Partner workshop/dealer locations
CREATE TABLE workshops (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    address text,
    city text,
    district text,
    zone text,
    latitude numeric,
    longitude numeric,
    owner_name text,
    owner_whatsapp text,
    mechanic_name text,
    mechanic_phone text,
    segment text,
    monthly_servicing text,
    supplier_1 text,
    supplier_2 text,
    supplier_3 text,
    year_incorporated text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- 5. ORDERS (15 columns)
-- Customer orders
CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number text NOT NULL,
    customer_id uuid NOT NULL,
    order_date timestamp without time zone DEFAULT now(),
    status text DEFAULT 'pending'::text,
    subtotal numeric NOT NULL,
    discount_percentage numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0,
    total_amount numeric NOT NULL,
    payment_status text DEFAULT 'unpaid'::text,
    payment_terms text,
    notes text,
    created_by text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- 6. ORDER_ITEMS (9 columns)
-- Order line items
CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric NOT NULL,
    discount_percentage numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    line_total numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

-- =================
-- CHATBOT TABLES
-- =================

-- 7. CHATBOT_SESSIONS (10 columns)
-- Active user conversation sessions
CREATE TABLE chatbot_sessions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number text NOT NULL,
    customer_id uuid,
    session_start timestamp without time zone DEFAULT now(),
    session_end timestamp without time zone,
    last_activity timestamp without time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    conversation_state text DEFAULT 'greeting'::text,
    language text DEFAULT 'en'::text,
    context jsonb
);

-- 8. CONVERSATION_LOGS (11 columns)
-- Message history for analytics
CREATE TABLE conversation_logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id uuid NOT NULL,
    customer_id uuid,
    phone_number text NOT NULL,
    message_type text NOT NULL,
    message_text text,
    message_data jsonb,
    intent text,
    confidence numeric,
    language text DEFAULT 'en'::text,
    timestamp timestamp without time zone DEFAULT now()
);

-- 9. CHATBOT_ANALYTICS (13 columns)
-- Daily usage metrics
CREATE TABLE chatbot_analytics (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    date date NOT NULL DEFAULT CURRENT_DATE,
    total_conversations integer DEFAULT 0,
    unique_users integer DEFAULT 0,
    new_customers integer DEFAULT 0,
    orders_placed integer DEFAULT 0,
    total_order_value numeric DEFAULT 0,
    product_searches integer DEFAULT 0,
    average_response_time numeric,
    customer_satisfaction_score numeric,
    top_products jsonb,
    common_queries jsonb,
    created_at timestamp without time zone DEFAULT now()
);

-- 10. AUTO_RESPONSES (9 columns)
-- Predefined bilingual responses
CREATE TABLE auto_responses (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_keyword text NOT NULL,
    response_en text NOT NULL,
    response_ne text NOT NULL,
    category text,
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- =================
-- SALES & ADMIN TABLES
-- =================

-- 11. LEAD_OPPORTUNITIES (16 columns)
-- Potential customers from chatbot
CREATE TABLE lead_opportunities (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number text NOT NULL,
    name text,
    business_name text,
    location text,
    interest_level text,
    lead_source text DEFAULT 'chatbot'::text,
    conversation_summary text,
    products_interested jsonb,
    estimated_order_value numeric,
    follow_up_date date,
    status text DEFAULT 'new'::text,
    assigned_to text,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- 12. ACTIVITY_LOG (7 columns)
-- Audit trail for all changes
CREATE TABLE activity_log (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action text NOT NULL,
    changes jsonb,
    performed_by text,
    created_at timestamp without time zone DEFAULT now()
);

-- 13. ADMIN_ALERTS (11 columns)
-- System notifications
CREATE TABLE admin_alerts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_type text NOT NULL,
    severity text DEFAULT 'info'::text,
    title text NOT NULL,
    message text NOT NULL,
    related_entity_type text,
    related_entity_id uuid,
    is_read boolean DEFAULT false,
    is_resolved boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    read_at timestamp without time zone,
    resolved_at timestamp without time zone
);

-- =====================================================
-- SCHEMA STATISTICS
-- =====================================================
-- Total Tables: 13
-- Total Columns: 176
-- Indexes: Primary keys only (need to add performance indexes)
-- Foreign Keys: None (need to add constraints)
-- Row Level Security: Disabled (need to enable)
-- =====================================================