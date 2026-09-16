-- LEC Mechanics database (SQLite version)
-- Open backend/lec_mechanics.sqlite with DB Browser for SQLite.
-- To rebuild from scratch: delete the .sqlite file and run
--   php backend/init_sqlite.php

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'manager', 'receptionist')),
    security_question TEXT NULL,
    security_answer_hash TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NULL,
    national_id TEXT NULL UNIQUE,
    customer_type TEXT NOT NULL DEFAULT 'Individual' CHECK (customer_type IN ('Individual', 'Company', 'Fleet Customer')),
    address TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);

CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    registration_number TEXT NOT NULL UNIQUE,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    vehicle_year INTEGER NULL,
    colour TEXT NULL,
    vin TEXT NULL UNIQUE,
    current_mileage INTEGER NOT NULL DEFAULT 0,
    engine_type TEXT NULL CHECK (engine_type IN ('Petrol', 'Diesel', 'Hybrid', 'Electric', 'Other')),
    transmission TEXT NULL CHECK (transmission IN ('Manual', 'Automatic', 'CVT', 'Other')),
    notes TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles (customer_id);

CREATE TABLE IF NOT EXISTS mechanics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NULL,
    staff_id TEXT NOT NULL UNIQUE,
    specialization TEXT NOT NULL,
    years_experience INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'On Leave')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mechanics_status ON mechanics (status);

CREATE TABLE IF NOT EXISTS job_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    vehicle_id INTEGER NOT NULL,
    mechanic_id INTEGER NULL,
    job_date TEXT NOT NULL,
    estimated_completion_date TEXT NULL,
    priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Normal', 'High', 'Urgent')),
    mileage INTEGER NULL,
    complaint TEXT NOT NULL,
    diagnosis TEXT NULL,
    work_required TEXT NULL,
    work_completed TEXT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Awaiting Parts', 'Completed', 'Cancelled')),
    estimated_cost REAL NOT NULL DEFAULT 0.00,
    notes TEXT NULL,
    created_by INTEGER NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (mechanic_id) REFERENCES mechanics(id) ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_cards (status);
CREATE INDEX IF NOT EXISTS idx_jobs_date ON job_cards (job_date);

CREATE TABLE IF NOT EXISTS spare_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_name TEXT NOT NULL,
    part_number TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    supplier TEXT NULL,
    quantity_in_stock INTEGER NOT NULL DEFAULT 0,
    minimum_stock_level INTEGER NOT NULL DEFAULT 0,
    buying_price REAL NOT NULL DEFAULT 0.00,
    selling_price REAL NOT NULL DEFAULT 0.00,
    storage_location TEXT NULL,
    description TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parts_stock ON spare_parts (quantity_in_stock, minimum_stock_level);

CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NULL,
    user_name TEXT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    resource TEXT NOT NULL,
    record_id INTEGER NULL,
    summary TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log (created_at);

CREATE TABLE IF NOT EXISTS login_attempts (
    email TEXT PRIMARY KEY,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    last_failed_at TEXT NULL,
    locked_until TEXT NULL
);

CREATE TABLE IF NOT EXISTS job_card_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_card_id INTEGER NOT NULL,
    spare_part_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (job_card_id, spare_part_id),
    FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (spare_part_id) REFERENCES spare_parts(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    vehicle_id INTEGER NULL,
    job_card_id INTEGER NULL,
    invoice_date TEXT NOT NULL,
    due_date TEXT NULL,
    service_charges REAL NOT NULL DEFAULT 0.00,
    parts_charges REAL NOT NULL DEFAULT 0.00,
    discount REAL NOT NULL DEFAULT 0.00,
    tax REAL NOT NULL DEFAULT 0.00,
    total_amount REAL GENERATED ALWAYS AS (service_charges + parts_charges - discount + tax) STORED,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Void')),
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (job_card_id) REFERENCES job_cards(id) ON UPDATE CASCADE ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    payment_date TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'EcoCash', 'Bank Transfer', 'Card', 'Other')),
    reference_number TEXT NULL,
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments (payment_date);

CREATE TABLE IF NOT EXISTS service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_type TEXT NOT NULL DEFAULT 'Service' CHECK (request_type IN ('Service', 'Towing', 'Roadside Assistance', 'Apprenticeship', 'General Enquiry')),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NULL,
    registration_number TEXT NULL,
    service_name TEXT NULL,
    preferred_date TEXT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Contacted', 'Scheduled', 'Completed', 'Closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON service_requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON service_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_requests_phone ON service_requests (phone);

CREATE VIEW IF NOT EXISTS dashboard_summary AS
SELECT
    (SELECT COUNT(*) FROM customers WHERE is_active = 1) AS total_customers,
    (SELECT COUNT(*) FROM vehicles WHERE is_active = 1) AS total_vehicles,
    (SELECT COUNT(*) FROM job_cards WHERE status IN ('Pending', 'In Progress', 'Awaiting Parts')) AS active_jobs,
    (SELECT COALESCE(SUM(amount), 0) FROM payments) AS total_revenue,
    (SELECT COUNT(*) FROM invoices) AS total_invoices,
    (SELECT COUNT(*) FROM invoices WHERE status = 'Paid') AS paid_invoices,
    (SELECT COALESCE(SUM(i.service_charges + i.parts_charges - i.discount + i.tax - COALESCE(p.paid_amount, 0)), 0)
        FROM invoices i
        LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid_amount FROM payments GROUP BY invoice_id) p
            ON p.invoice_id = i.id
        WHERE i.status <> 'Void') AS outstanding_amount;

CREATE VIEW IF NOT EXISTS low_stock_parts AS
SELECT * FROM spare_parts
WHERE is_active = 1 AND quantity_in_stock <= minimum_stock_level;

CREATE TABLE IF NOT EXISTS gallery_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    uploaded_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
