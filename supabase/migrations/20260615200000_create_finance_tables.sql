-- Finance feature: vendors, bill templates, bills, and cash snapshots
--
-- RLS DECISION: No RLS on these tables.
-- Rationale: Existing finance-adjacent tables (commissions, orders, commission_rates)
-- have no RLS enabled — the project relies on anon-key requests gated by app-level
-- role checks (lib/auth-context.tsx canViewSection). The communications table is the
-- only table with RLS, and those policies are fully permissive (USING (true)) due to
-- the PIN-auth not producing a Supabase auth.uid(). Adding permissive-only RLS would
-- provide no actual security benefit and would add overhead. Matching the existing
-- pattern: access to finance data is enforced at the UI/action layer (admin/management
-- only via canViewSection('finance')).

-- ============================================================
-- 1. VENDORS
-- ============================================================

CREATE TABLE public.finance_vendors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  category     TEXT,
  contact_info TEXT,
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_vendors IS 'Vendors and payees for recurring bills and one-off expenses';

-- ============================================================
-- 2. BILL TEMPLATES (recurring bill definitions)
-- ============================================================

CREATE TABLE public.finance_bill_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         UUID REFERENCES public.finance_vendors(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  amount            DECIMAL(10,2),                   -- NULL when is_amount_fixed = false
  is_amount_fixed   BOOLEAN NOT NULL DEFAULT true,   -- false = amount varies, must be set on each bill
  due_day_of_month  INTEGER,                         -- 1-31; NULL = no fixed day
  recurrence        TEXT NOT NULL DEFAULT 'monthly', -- monthly, quarterly, annual, etc.
  category          TEXT,                            -- e.g. 'utilities', 'payroll', 'rent'
  is_active         BOOLEAN NOT NULL DEFAULT true,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_bill_templates IS 'Recurring bill definitions; instantiated into finance_bills each period';

-- ============================================================
-- 3. BILLS (individual bill instances per period)
-- ============================================================

CREATE TABLE public.finance_bills (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID REFERENCES public.finance_bill_templates(id) ON DELETE SET NULL,
  vendor_id      UUID REFERENCES public.finance_vendors(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  period_month   DATE NOT NULL,                -- always the first of the month (e.g. 2026-06-01)
  amount         DECIMAL(10,2) NOT NULL,       -- full amount owed
  due_date       DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'unpaid'
                   CHECK (status IN ('unpaid', 'paid', 'partial', 'scheduled', 'void')),
  amount_paid    DECIMAL(10,2) NOT NULL DEFAULT 0,
  paid_date      DATE,                         -- date payment actually cleared
  payment_method TEXT,
  payment_ref    TEXT,                         -- check number, ACH ref, etc.
  notes          TEXT,
  created_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_bills IS 'Individual bill instances per period. period_month is always the 1st of the month.';

-- Indexes for the most common read patterns
CREATE INDEX idx_finance_bills_period_month  ON public.finance_bills (period_month);
CREATE INDEX idx_finance_bills_due_date      ON public.finance_bills (due_date);
CREATE INDEX idx_finance_bills_status        ON public.finance_bills (status);
CREATE INDEX idx_finance_bills_template_id   ON public.finance_bills (template_id);

-- ============================================================
-- 4. CASH SNAPSHOTS
-- ============================================================

CREATE TABLE public.finance_cash_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  cash_on_hand  DECIMAL(12,2) NOT NULL,
  notes         TEXT,
  recorded_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.finance_cash_snapshots IS 'Point-in-time cash balance recordings; used as the anchor for cash-flow projections';

-- Most recent snapshot fetches come first
CREATE INDEX idx_finance_cash_snapshots_date ON public.finance_cash_snapshots (snapshot_date DESC);
