-- Cash-on-hand bug: duplicate rows per snapshot_date caused the Overview to read a
-- stale value. Dedupe (keep newest per date) and enforce one snapshot per date so
-- the latest-snapshot read is always deterministic and re-saving updates in place.

-- 1. Remove older duplicates, keeping the most recently created row per date
DELETE FROM public.finance_cash_snapshots a
USING public.finance_cash_snapshots b
WHERE a.snapshot_date = b.snapshot_date
  AND a.created_at < b.created_at;

-- 2. Enforce uniqueness going forward
ALTER TABLE public.finance_cash_snapshots
  ADD CONSTRAINT uq_finance_cash_snapshots_date UNIQUE (snapshot_date);
