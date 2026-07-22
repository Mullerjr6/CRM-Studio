CREATE TABLE IF NOT EXISTS conversion_runs (
  id BIGSERIAL PRIMARY KEY,
  source_key CHAR(64) NOT NULL UNIQUE,
  generated_at TIMESTAMPTZ NOT NULL,
  window_days INTEGER NOT NULL CHECK (window_days BETWEEN 1 AND 3650),
  data_origin VARCHAR(40) NOT NULL,
  total_sent INTEGER NOT NULL DEFAULT 0 CHECK (total_sent >= 0),
  total_conversions INTEGER NOT NULL DEFAULT 0 CHECK (total_conversions >= 0),
  total_revenue NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_revenue >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seller_results (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES conversion_runs(id) ON DELETE CASCADE,
  seller_key VARCHAR(30) NOT NULL,
  seller_name VARCHAR(80) NOT NULL,
  clients_sent INTEGER NOT NULL DEFAULT 0 CHECK (clients_sent >= 0),
  conversions INTEGER NOT NULL DEFAULT 0 CHECK (conversions >= 0),
  revenue NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  conversion_rate NUMERIC(7, 3) NOT NULL DEFAULT 0 CHECK (conversion_rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, seller_key)
);

CREATE INDEX IF NOT EXISTS idx_conversion_runs_generated_at
  ON conversion_runs (generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_seller_results_seller_key
  ON seller_results (seller_key);
