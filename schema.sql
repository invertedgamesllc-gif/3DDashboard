-- D1 Database Schema for 3D Print Business

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
    display_name TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

-- Sessions table for login tokens
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Activity log for tracking user actions
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Inquiries table
CREATE TABLE IF NOT EXISTS inquiries (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    project_description TEXT,
    material_weight REAL,
    print_time REAL,
    material_type TEXT,
    material_color TEXT,
    total_quote REAL,
    status TEXT DEFAULT 'pending',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    inquiry_id TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    material_type TEXT,
    material_color TEXT,
    material_weight REAL,
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending',
    total_amount REAL,
    printer_assigned TEXT,
    estimated_completion DATETIME,
    notes TEXT,
    FOREIGN KEY (inquiry_id) REFERENCES inquiries(id)
);

-- Files table (references to R2 storage)
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    inquiry_id TEXT,
    original_name TEXT NOT NULL,
    file_key TEXT NOT NULL, -- R2 storage key
    file_size INTEGER,
    file_type TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (inquiry_id) REFERENCES inquiries(id)
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_type TEXT NOT NULL,
    color TEXT,
    quantity_kg REAL DEFAULT 0,
    price_per_kg REAL,
    supplier TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Printers table
CREATE TABLE IF NOT EXISTS printers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    model TEXT,
    status TEXT DEFAULT 'idle',
    current_job_id TEXT,
    last_maintenance DATETIME,
    total_print_hours REAL DEFAULT 0
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_customer ON inquiries(customer_email);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_by ON inquiries(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_files_inquiry ON files(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER update_inquiries_timestamp
AFTER UPDATE ON inquiries
BEGIN
    UPDATE inquiries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;