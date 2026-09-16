-- ============================================================
-- LEC MECHANICS — Supabase / PostgreSQL schema
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ---------- Users (admin accounts) ----------
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'manager', 'receptionist')),
    security_question TEXT NULL,
    security_answer_hash TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Customers ----------
CREATE TABLE IF NOT EXISTS customers (
    id BIGSERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NULL,
    national_id TEXT NULL UNIQUE,
    customer_type TEXT NOT NULL DEFAULT 'Individual' CHECK (customer_type IN ('Individual', 'Company', 'Fleet Customer')),
    address TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);

-- ---------- Vehicles ----------
CREATE TABLE IF NOT EXISTS vehicles (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    registration_number TEXT NOT NULL UNIQUE,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    vehicle_year SMALLINT NULL,
    colour TEXT NULL,
    vin TEXT NULL UNIQUE,
    current_mileage INTEGER NOT NULL DEFAULT 0,
    engine_type TEXT NULL CHECK (engine_type IN ('Petrol', 'Diesel', 'Hybrid', 'Electric', 'Other')),
    transmission TEXT NULL CHECK (transmission IN ('Manual', 'Automatic', 'CVT', 'Other')),
    notes TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles (customer_id);

-- ---------- Mechanics ----------
CREATE TABLE IF NOT EXISTS mechanics (
    id BIGSERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NULL,
    staff_id TEXT NOT NULL UNIQUE,
    specialization TEXT NOT NULL,
    years_experience INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'On Leave')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mechanics_status ON mechanics (status);

-- ---------- Job cards ----------
CREATE TABLE IF NOT EXISTS job_cards (
    id BIGSERIAL PRIMARY KEY,
    job_number TEXT NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL,
    vehicle_id BIGINT NOT NULL,
    mechanic_id BIGINT NULL,
    job_date DATE NOT NULL,
    estimated_completion_date DATE NULL,
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal', 'High', 'Urgent')),
    mileage INTEGER NULL,
    complaint TEXT NOT NULL,
    diagnosis TEXT NULL,
    work_required TEXT NULL,
    work_completed TEXT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Awaiting Parts', 'Completed', 'Cancelled')),
    estimated_cost NUMERIC NOT NULL DEFAULT 0,
    notes TEXT NULL,
    created_by BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (mechanic_id) REFERENCES mechanics(id) ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_cards (status);
CREATE INDEX IF NOT EXISTS idx_jobs_date ON job_cards (job_date);

-- ---------- Spare parts ----------
CREATE TABLE IF NOT EXISTS spare_parts (
    id BIGSERIAL PRIMARY KEY,
    part_name TEXT NOT NULL,
    part_number TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    supplier TEXT NULL,
    quantity_in_stock INTEGER NOT NULL DEFAULT 0,
    minimum_stock_level INTEGER NOT NULL DEFAULT 0,
    buying_price NUMERIC NOT NULL DEFAULT 0,
    selling_price NUMERIC NOT NULL DEFAULT 0,
    storage_location TEXT NULL,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parts_stock ON spare_parts (quantity_in_stock, minimum_stock_level);

-- ---------- Job card parts ----------
CREATE TABLE IF NOT EXISTS job_card_parts (
    id BIGSERIAL PRIMARY KEY,
    job_card_id BIGINT NOT NULL,
    spare_part_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (job_card_id, spare_part_id),
    FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (spare_part_id) REFERENCES spare_parts(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ---------- Invoices ----------
CREATE TABLE IF NOT EXISTS invoices (
    id BIGSERIAL PRIMARY KEY,
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL,
    vehicle_id BIGINT NULL,
    job_card_id BIGINT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NULL,
    service_charges NUMERIC NOT NULL DEFAULT 0,
    parts_charges NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC NOT NULL DEFAULT 0,
    tax NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC GENERATED ALWAYS AS (service_charges + parts_charges - discount + tax) STORED,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Void')),
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);

-- ---------- Payments ----------
CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    payment_date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'EcoCash', 'Bank Transfer', 'Card', 'Other')),
    reference_number TEXT NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date);

-- ---------- Service requests (public contact form) ----------
-- tracking_code: customers enter this on /pages/track.html to follow the
-- admin's approval status. Statuses include Approved / Declined.
CREATE TABLE IF NOT EXISTS service_requests (
    id BIGSERIAL PRIMARY KEY,
    request_type TEXT NOT NULL DEFAULT 'Service' CHECK (request_type IN ('Service', 'Towing', 'Roadside Assistance', 'Apprenticeship', 'General Enquiry')),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NULL,
    registration_number TEXT NULL,
    service_name TEXT NULL,
    preferred_date DATE NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Contacted', 'Approved', 'Scheduled', 'Declined', 'Completed', 'Closed')),
    tracking_code TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON service_requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON service_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_requests_phone ON service_requests (phone);
CREATE INDEX IF NOT EXISTS idx_requests_tracking ON service_requests (tracking_code);

-- ---------- Activity log ----------
CREATE TABLE IF NOT EXISTS activity_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NULL,
    user_name TEXT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    resource TEXT NOT NULL,
    record_id BIGINT NULL,
    summary TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log (created_at);

-- ---------- Login attempts (lockout) ----------
CREATE TABLE IF NOT EXISTS login_attempts (
    email TEXT PRIMARY KEY,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    last_failed_at TIMESTAMPTZ NULL,
    locked_until TIMESTAMPTZ NULL
);

-- ---------- Gallery ----------
-- data = base64 image bytes (Vercel has no writable disk, so bytes live in Postgres)
CREATE TABLE IF NOT EXISTS gallery_images (
    id BIGSERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    uploaded_by TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    data TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep-alive heartbeat written by the Vercel cron (also proves DB is reachable)
CREATE TABLE IF NOT EXISTS keepalive (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_ping TIMESTAMPTZ NOT NULL DEFAULT now(),
    pings INTEGER NOT NULL DEFAULT 0
);

-- ---------- Views ----------
CREATE OR REPLACE VIEW dashboard_summary AS
SELECT
    (SELECT COUNT(*) FROM customers WHERE is_active) AS total_customers,
    (SELECT COUNT(*) FROM vehicles WHERE is_active) AS total_vehicles,
    (SELECT COUNT(*) FROM job_cards WHERE status IN ('Pending', 'In Progress', 'Awaiting Parts')) AS active_jobs,
    (SELECT COALESCE(SUM(amount), 0) FROM payments) AS total_revenue,
    (SELECT COUNT(*) FROM invoices) AS total_invoices,
    (SELECT COUNT(*) FROM invoices WHERE status = 'Paid') AS paid_invoices,
    (SELECT COALESCE(SUM(i.service_charges + i.parts_charges - i.discount + i.tax - COALESCE(p.paid_amount, 0)), 0)
        FROM invoices i
        LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid_amount FROM payments GROUP BY invoice_id) p
            ON p.invoice_id = i.id
        WHERE i.status <> 'Void') AS outstanding_amount;

CREATE OR REPLACE VIEW low_stock_parts AS
SELECT * FROM spare_parts
WHERE is_active AND quantity_in_stock <= minimum_stock_level;
