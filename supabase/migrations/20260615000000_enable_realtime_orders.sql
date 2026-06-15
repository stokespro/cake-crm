-- Enable Supabase Realtime for orders and order_items tables.
-- Required for the packaging page order alert feature (real-time badge + bell sound).
-- These tables receive INSERT (new orders) and UPDATE (edited order items) events
-- that the packaging manager needs to react to immediately.

alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
