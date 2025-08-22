
CREATE DATABASE IF NOT EXISTS mams;
USE mams;

-- ===== USERS & ROLES =====
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','commander','logistics') NOT NULL,
  base_id INT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure only one admin exists (soft rule; enforced in code too)
-- You can optionally add a unique partial index via trigger logic; we enforce in code.


-- ===== BASES =====
CREATE TABLE IF NOT EXISTS bases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== ASSET CATALOG =====
CREATE TABLE IF NOT EXISTS assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  serial_number VARCHAR(100) UNIQUE NULL,  -- optional unique identity
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== INVENTORY PER BASE (available & assigned) =====
CREATE TABLE IF NOT EXISTS base_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  base_id INT NOT NULL,
  asset_id INT NOT NULL,
  available_qty INT NOT NULL DEFAULT 0,
  assigned_qty INT NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_base_asset (base_id, asset_id),
  FOREIGN KEY (base_id) REFERENCES bases(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

-- ===== PURCHASES =====
CREATE TABLE IF NOT EXISTS purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  base_id INT NOT NULL,
  asset_id INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  status ENUM('approved') DEFAULT 'approved', -- Admin creates already-approved
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (base_id) REFERENCES bases(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ===== TRANSFERS =====
CREATE TABLE IF NOT EXISTS transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_id INT NOT NULL,
  from_base INT NOT NULL,
  to_base INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  status ENUM('completed') DEFAULT 'completed', -- Admin completes directly
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id),
  FOREIGN KEY (from_base) REFERENCES bases(id),
  FOREIGN KEY (to_base) REFERENCES bases(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ===== PERSONNEL (for assigning assets) =====
CREATE TABLE IF NOT EXISTS personnel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  ranks VARCHAR(50),
  service_number VARCHAR(100) UNIQUE,
  base_id INT NOT NULL,
  assigned_unit VARCHAR(100),
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (base_id) REFERENCES bases(id)
);

-- ===== ASSIGNMENTS =====
-- assignee_type: 'user' (commander/logistics) OR 'personnel'
CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  base_id INT NOT NULL,
  asset_id INT NOT NULL,
  assignee_type ENUM('user','personnel') NOT NULL,
  assignee_user_id INT NULL,
  assignee_personnel_id INT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  assigned_by INT NOT NULL, -- user who performed the assignment
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (base_id) REFERENCES bases(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id),
  FOREIGN KEY (assignee_user_id) REFERENCES users(id),
  FOREIGN KEY (assignee_personnel_id) REFERENCES personnel(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id)
);

-- ===== AUDIT LOGS (IMMUTABLE) =====
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  role ENUM('admin','commander','logistics'),
  action VARCHAR(100),
  target VARCHAR(255),
  details JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Prevent UPDATE/DELETE on audit_logs (immutability)
DELIMITER //
CREATE TRIGGER trg_audit_logs_prevent_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are immutable (no UPDATE).';
END//
CREATE TRIGGER trg_audit_logs_prevent_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit logs are immutable (no DELETE).';
END//
DELIMITER ;



-- Commander-initiated purchase requests (require Admin approval)
CREATE TABLE IF NOT EXISTS purchase_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  base_id INT NOT NULL,
  asset_id INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  requested_by INT NOT NULL,
  approved_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (base_id) REFERENCES bases(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Commander transfer requests (approve by commander(s) of from/to base)
CREATE TABLE IF NOT EXISTS transfer_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_id INT NOT NULL,
  from_base INT NOT NULL,
  to_base INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  status ENUM('requested','approved','rejected','completed') DEFAULT 'requested',
  requested_by INT NOT NULL,
  approved_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id),
  FOREIGN KEY (from_base) REFERENCES bases(id),
  FOREIGN KEY (to_base) REFERENCES bases(id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

ALTER TABLE purchases MODIFY status ENUM('pending','approved') DEFAULT 'pending';
ALTER TABLE transfers MODIFY status ENUM('pending','approved','rejected') DEFAULT 'pending';


use mams;



-- Purchases (only approved or pending by Admin)
DROP TABLE IF EXISTS purchases;
CREATE TABLE purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  base_id INT NOT NULL,
  asset_id INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  created_by INT NOT NULL,   -- who initiated (admin usually)
  approved_by INT NULL,      -- if pending, admin approval needed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (base_id) REFERENCES bases(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Transfers (directly executed or after approval)
DROP TABLE IF EXISTS transfers;
CREATE TABLE transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asset_id INT NOT NULL,
  from_base INT NOT NULL,
  to_base INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  status ENUM('pending','approved','rejected','completed') DEFAULT 'pending',
  created_by INT NOT NULL,   -- who requested
  approved_by INT NULL,      -- who approved (commander/admin)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES assets(id),
  FOREIGN KEY (from_base) REFERENCES bases(id),
  FOREIGN KEY (to_base) REFERENCES bases(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);
