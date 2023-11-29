CREATE TABLE sessions (
  session_id INTEGER PRIMARY KEY,
  session_uuid CHAR(20) UNIQUE,
  session_first_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  session_last_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY,
  session_uuid CHAR(20),
  order_first_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  order_last_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  order_status VARCHAR(64),
  order_network VARCHAR(64),
  order_transaction_mode VARCHAR(64),
  order_commit_hash VARCHAR(128),
  order_service_address VARCHAR(256),
  order_service_address_collection VARCHAR(256),
  order_referral_address VARCHAR(256),
  order_checkpoint_steps INTEGER,
  order_checkpoint_index INTEGER,
  order_dust_val INTEGER,
  order_file_count INTEGER,
  order_file_size INTEGER,
  order_vbytes_count INTEGER,
  order_vbytes_cost INTEGER,
  order_service_cost INTEGER,
  order_customer_addresses TEXT,
  order_customer_transactions TEXT,
  order_service_transactions TEXT,
  order_refund_transactions TEXT,
  FOREIGN KEY (session_uuid) REFERENCES sessions (session_uuid) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_session_uuid ON sessions (session_uuid);
CREATE INDEX idx_orders_session_uuid ON orders (session_uuid);
CREATE INDEX idx_orders_order_id ON orders (order_id);
CREATE INDEX idx_orders_order_status ON orders (order_status);

CREATE TRIGGER update_order_last_date
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
  UPDATE orders SET order_last_date = CURRENT_TIMESTAMP WHERE order_id = NEW.order_id;
END;

CREATE TRIGGER update_session_last_date
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
  UPDATE sessions SET session_last_date = CURRENT_TIMESTAMP WHERE session_uuid = NEW.session_uuid;
END;