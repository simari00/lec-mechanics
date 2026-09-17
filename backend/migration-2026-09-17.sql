-- ============================================================
-- LEC MECHANICS — Migration 2026-09-17
-- 1. Master admin approval flow (master role, approval status)
-- 2. Gallery folders (project portfolio)
-- 3. Apprenticeship application fields on service requests
-- 4. New request statuses: Car Fixed / Not Done
-- Safe to run more than once.
-- ============================================================

-- ---------- 1. Users: master role + approval workflow ----------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'manager', 'receptionist', 'master'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT
    NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by BIGINT NULL
    REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;

-- The very first account (lowest id) becomes the master and is approved.
UPDATE users SET role = 'master', approval_status = 'approved'
WHERE id = (SELECT MIN(id) FROM users);
UPDATE users SET approval_status = 'approved'
WHERE approval_status = 'pending' AND created_at <= now() - interval '1 second'
  AND id = (SELECT MIN(id) FROM users);

-- Existing accounts created before this migration stay approved (no lock-out).
UPDATE users SET approval_status = 'approved' WHERE approved_at IS NULL;

-- ---------- 2. Gallery folders ----------
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS folder TEXT
    NOT NULL DEFAULT 'General';

CREATE INDEX IF NOT EXISTS idx_gallery_folder ON gallery_images (folder);

-- ---------- 3. Service requests: apprenticeship details ----------
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS first_name TEXT NULL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS last_name TEXT NULL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS age SMALLINT NULL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS o_level_results TEXT NULL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS a_level_results TEXT NULL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS technical_subjects TEXT NULL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS drivers_licence TEXT NULL;

-- Apprenticeship requests carry the applicant's name too (message is still required
-- by older rows, so keep full_name in sync for new rows via the API).

-- ---------- 4. New statuses: Car Fixed / Not Done ----------
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
    CHECK (status IN ('New', 'Contacted', 'Approved', 'Scheduled', 'Declined',
                      'Completed', 'Closed', 'Car Fixed', 'Not Done'));
