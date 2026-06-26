-- Reschedule daily cron jobs to fire at exactly 7:00 AM America/Chicago, DST-aware.
--
-- Background
-- ----------
-- pg_cron runs in UTC (cron.timezone = GMT; global GUC is NOT changed here).
-- America/Chicago observes two UTC offsets:
--   CDT (summer, UTC-5): 7 AM Chicago = 12:00 UTC
--   CST (winter, UTC-6): 7 AM Chicago = 13:00 UTC
--
-- DST-aware gating strategy
-- -------------------------
-- Each job is scheduled at BOTH candidate UTC hours (12 and 13).
-- The command body gates execution with a WHERE clause that checks the
-- Chicago local hour at the moment the job runs:
--
--   SELECT fn() WHERE EXTRACT(HOUR FROM now() AT TIME ZONE 'America/Chicago') = 7;
--
-- How the gate works (important for reviewers):
--   PostgreSQL evaluates a target-list expression ONLY for rows that survive
--   the WHERE filter. When EXTRACT(HOUR ...) != 7, the WHERE is false, no row
--   is returned, and the function is NEVER called — not even partially.
--   This is deterministic and has zero risk of the off-hour firing executing
--   any side effects.
--
-- The reconcile job (job 2) runs at 12:05 / 13:05 UTC. At 12:05 UTC during CDT
-- the Chicago time is 7:05 AM — still hour 7 — so the gate correctly passes.
-- At 13:05 UTC during CST the Chicago time is 7:05 AM CST — also hour 7.
--
-- Both job IDs are preserved (cron.alter_job does NOT recreate them).
--
-- jobid 1: sync-bank-snapshot-daily   → runs at 12:00 and 13:00 UTC
-- jobid 2: reconcile-daily            → runs at 12:05 and 13:05 UTC

SELECT cron.alter_job(
  job_id  := 1,
  schedule := '0 12,13 * * *',
  command  := $$SELECT public.sync_bank_snapshot_to_finance() WHERE EXTRACT(HOUR FROM now() AT TIME ZONE 'America/Chicago') = 7$$
);

SELECT cron.alter_job(
  job_id  := 2,
  schedule := '5 12,13 * * *',
  command  := $$SELECT public.run_daily_reconciliation() WHERE EXTRACT(HOUR FROM now() AT TIME ZONE 'America/Chicago') = 7$$
);
