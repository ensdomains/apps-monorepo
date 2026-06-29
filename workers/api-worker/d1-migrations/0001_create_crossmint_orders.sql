-- Dedicated D1 (SQLite) store for Crossmint credit-card registration orders.
CREATE TABLE crossmint_orders (
  id TEXT PRIMARY KEY NOT NULL,
  crossmint_order_id TEXT UNIQUE,
  user_id TEXT,
  owner_address TEXT NOT NULL,
  name TEXT NOT NULL,
  duration INTEGER NOT NULL,
  secret TEXT NOT NULL,
  commitment TEXT,
  resolver_address TEXT,
  payment_token TEXT,
  voucher_token_id TEXT,
  amount_paid TEXT,
  commit_tx_hash TEXT,
  register_tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  committed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX crossmint_orders_user_id_index ON crossmint_orders (user_id);
CREATE INDEX crossmint_orders_owner_address_index ON crossmint_orders (owner_address);
CREATE INDEX crossmint_orders_status_index ON crossmint_orders (status);
