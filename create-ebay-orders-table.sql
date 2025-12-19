-- Create eBay orders table
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

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ebay_order_id ON ebay_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_ebay_ship_by_date ON ebay_orders(ship_by_date);
CREATE INDEX IF NOT EXISTS idx_ebay_order_status ON ebay_orders(order_status);
