-- Packaging Board v2: claims table
-- Workers claim SKU tasks; claims prevent double-work and track completions.

CREATE TABLE packaging_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key TEXT NOT NULL,
  sku TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('FILL','CASE')),
  priority TEXT NOT NULL CHECK (priority IN ('URGENT','TOMORROW','UPCOMING','BACKFILL')),
  claimed_quantity INTEGER NOT NULL CHECK (claimed_quantity > 0),
  claimed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  claimed_by_name TEXT NOT NULL,
  session_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_user_name TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '8 hours'),
  completed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','RELEASED'))
);

-- Enforce only one active claim per task key at a time
CREATE UNIQUE INDEX idx_packaging_claims_active_task_key ON packaging_claims (task_key) WHERE status = 'ACTIVE';

-- Fast lookups for active claims by SKU
CREATE INDEX idx_packaging_claims_active_sku ON packaging_claims (sku) WHERE status = 'ACTIVE';

-- Fast lookups for active claims by worker
CREATE INDEX idx_packaging_claims_user_active ON packaging_claims (claimed_by_user_id) WHERE status = 'ACTIVE';
