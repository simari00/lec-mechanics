-- LEC Mechanics database
-- Tested for MySQL 8.0+

CREATE DATABASE IF NOT EXISTS lec_mechanics
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE lec_mechanics;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'receptionist') NOT NULL DEFAULT 'admin',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(190) NULL,
    national_id VARCHAR(80) NULL,
    customer_type ENUM('Individual', 'Company', 'Fleet Customer') NOT NULL DEFAULT 'Individual',
    address TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_customers_name (last_name, first_name),
    INDEX idx_customers_phone (phone),
    UNIQUE KEY uq_customers_national_id (national_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicles (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id BIGINT UNSIGNED NOT NULL,
    registration_number VARCHAR(30) NOT NULL UNIQUE,
    make VARCHAR(80) NOT NULL,
    model VARCHAR(80) NOT NULL,
    vehicle_year SMALLINT UNSIGNED NULL,
    colour VARCHAR(40) NULL,
    vin VARCHAR(80) NULL UNIQUE,
    current_mileage INT UNSIGNED NOT NULL DEFAULT 0,
    engine_type ENUM('Petrol', 'Diesel', 'Hybrid', 'Electric', 'Other') NULL,
    transmission ENUM('Manual', 'Automatic', 'CVT', 'Other') NULL,
    notes TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_vehicles_customer (customer_id),
    CONSTRAINT fk_vehicles_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mechanics (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(190) NULL,
    staff_id VARCHAR(50) NOT NULL UNIQUE,
    specialization VARCHAR(100) NOT NULL,
    years_experience TINYINT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('Active', 'Inactive', 'On Leave') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mechanics_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_cards (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_number VARCHAR(40) NOT NULL UNIQUE,
    customer_id BIGINT UNSIGNED NOT NULL,
    vehicle_id BIGINT UNSIGNED NOT NULL,
    mechanic_id BIGINT UNSIGNED NULL,
    job_date DATE NOT NULL,
    estimated_completion_date DATE NULL,
    priority ENUM('Normal', 'High', 'Urgent') NOT NULL DEFAULT 'Normal',
    mileage INT UNSIGNED NULL,
    complaint TEXT NOT NULL,
    diagnosis TEXT NULL,
    work_required TEXT NULL,
    work_completed TEXT NULL,
    status ENUM('Pending', 'In Progress', 'Awaiting Parts', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
    estimated_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_jobs_status (status),
    INDEX idx_jobs_date (job_date),
    CONSTRAINT fk_jobs_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_jobs_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_jobs_mechanic FOREIGN KEY (mechanic_id) REFERENCES mechanics(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_jobs_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS spare_parts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    part_name VARCHAR(150) NOT NULL,
    part_number VARCHAR(80) NOT NULL UNIQUE,
    category VARCHAR(80) NOT NULL,
    supplier VARCHAR(150) NULL,
    quantity_in_stock INT UNSIGNED NOT NULL DEFAULT 0,
    minimum_stock_level INT UNSIGNED NOT NULL DEFAULT 0,
    buying_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    storage_location VARCHAR(80) NULL,
    description TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_parts_stock (quantity_in_stock, minimum_stock_level)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_card_parts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_card_id BIGINT UNSIGNED NOT NULL,
    spare_part_id BIGINT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_job_part (job_card_id, spare_part_id),
    CONSTRAINT fk_job_parts_job FOREIGN KEY (job_card_id) REFERENCES job_cards(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_job_parts_part FOREIGN KEY (spare_part_id) REFERENCES spare_parts(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(40) NOT NULL UNIQUE,
    customer_id BIGINT UNSIGNED NOT NULL,
    vehicle_id BIGINT UNSIGNED NULL,
    job_card_id BIGINT UNSIGNED NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NULL,
    service_charges DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    parts_charges DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    discount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    tax DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(12, 2) AS (service_charges + parts_charges - discount + tax) STORED,
    status ENUM('Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Void') NOT NULL DEFAULT 'Draft',
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_invoices_date (invoice_date),
    INDEX idx_invoices_status (status),
    CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_invoices_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_invoices_job FOREIGN KEY (job_card_id) REFERENCES job_cards(id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id BIGINT UNSIGNED NOT NULL,
    payment_date DATE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    payment_method ENUM('Cash', 'EcoCash', 'Bank Transfer', 'Card', 'Other') NOT NULL,
    reference_number VARCHAR(100) NULL,
    notes VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_payments_date (payment_date),
    CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS service_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_type ENUM('Service', 'Towing', 'Roadside Assistance', 'Apprenticeship', 'General Enquiry') NOT NULL DEFAULT 'Service',
    full_name VARCHAR(120) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(190) NULL,
    registration_number VARCHAR(30) NULL,
    service_name VARCHAR(150) NULL,
    preferred_date DATE NULL,
    message TEXT NOT NULL,
    status ENUM('New', 'Contacted', 'Scheduled', 'Completed', 'Closed') NOT NULL DEFAULT 'New',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_requests_status (status),
    INDEX idx_requests_created (created_at),
    INDEX idx_requests_phone (phone)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW dashboard_summary AS
SELECT
    (SELECT COUNT(*) FROM customers WHERE is_active = TRUE) AS total_customers,
    (SELECT COUNT(*) FROM vehicles WHERE is_active = TRUE) AS total_vehicles,
    (SELECT COUNT(*) FROM job_cards WHERE status IN ('Pending', 'In Progress', 'Awaiting Parts')) AS active_jobs,
    (SELECT COALESCE(SUM(amount), 0) FROM payments) AS total_revenue,
    (SELECT COUNT(*) FROM invoices) AS total_invoices,
    (SELECT COUNT(*) FROM invoices WHERE status = 'Paid') AS paid_invoices,
    (SELECT COALESCE(SUM(i.total_amount - COALESCE(p.paid_amount, 0)), 0)
        FROM invoices i
        LEFT JOIN (SELECT invoice_id, SUM(amount) AS paid_amount FROM payments GROUP BY invoice_id) p
            ON p.invoice_id = i.id
        WHERE i.status <> 'Void') AS outstanding_amount;

CREATE OR REPLACE VIEW low_stock_parts AS
SELECT * FROM spare_parts
WHERE is_active = TRUE AND quantity_in_stock <= minimum_stock_level;