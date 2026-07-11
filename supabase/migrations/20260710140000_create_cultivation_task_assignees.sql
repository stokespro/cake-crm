-- Multi-assignee support for cultivation tasks.
--
-- cultivation_tasks.assigned_to (single uuid) is kept for legacy/back-compat
-- (Bud Slack agent still reads it) but the source of truth for "who is
-- assigned" moves to this junction table, which supports unlimited
-- assignees per task.
--
-- Security posture mirrors cultivation_tasks: RLS enabled, no policies for
-- anon/authenticated (deny-by-default backstop). All access goes through
-- gated server actions using the service-role client. New tables get
-- anon/authenticated grants from the public-schema default ACL, so we
-- explicitly revoke those below — do not reopen that gap.

CREATE TABLE cultivation_task_assignees (
  task_id     UUID NOT NULL REFERENCES cultivation_tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES users(id),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX idx_cultivation_task_assignees_user_id
  ON cultivation_task_assignees (user_id);

ALTER TABLE cultivation_task_assignees ENABLE ROW LEVEL SECURITY;

-- New tables inherit anon/authenticated grants from the public schema's
-- default ACL — revoke them to match the locked-down posture of
-- cultivation_tasks (only postgres/service_role should have direct access;
-- the app talks to the DB exclusively via the service-role client in
-- actions/cultivation.ts).
REVOKE ALL ON cultivation_task_assignees FROM anon, authenticated;

-- Backfill from the existing single-assignee column. Preserves ALL existing
-- assignments regardless of the assignee's current role.
INSERT INTO cultivation_task_assignees (task_id, user_id, assigned_at)
SELECT id, assigned_to, COALESCE(created_at, now())
FROM cultivation_tasks
WHERE assigned_to IS NOT NULL
ON CONFLICT DO NOTHING;
