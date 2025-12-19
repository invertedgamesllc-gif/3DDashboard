-- Migration: Add authentication tables

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

-- Add created_by column to inquiries if it doesn't exist
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a workaround
CREATE TABLE IF NOT EXISTS _migration_check (id INTEGER);
DROP TABLE IF EXISTS _migration_check;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);

-- eBay orders table
CREATE TABLE IF NOT EXISTS ebay_orders (
    id TEXT PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL,
    buyer_username TEXT,
    buyer_email TEXT,
    item_title TEXT,
    item_sku TEXT,
    quantity INTEGER,
    total_price REAL,
    currency TEXT DEFAULT 'USD',
    ship_to_name TEXT,
    ship_to_address1 TEXT,
    ship_to_address2 TEXT,
    ship_to_city TEXT,
    ship_to_state TEXT,
    ship_to_zip TEXT,
    ship_to_country TEXT,
    shipping_service TEXT,
    ship_by_date TEXT,
    delivery_date TEXT,
    tracking_number TEXT,
    order_status TEXT DEFAULT 'pending',
    payment_status TEXT,
    created_time TEXT,
    paid_time TEXT,
    shipped_time TEXT,
    notes TEXT,
    synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for eBay orders
CREATE INDEX IF NOT EXISTS idx_ebay_order_id ON ebay_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_ebay_ship_by_date ON ebay_orders(ship_by_date);
CREATE INDEX IF NOT EXISTS idx_ebay_order_status ON ebay_orders(order_status);
