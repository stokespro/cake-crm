-- Set REPLICA IDENTITY FULL on order_items so that Supabase Realtime UPDATE
-- payloads include the OLD row values (previous sku_id and quantity).
-- This is required by the packaging page order-alert diff feature to compute
-- "what changed" (quantity changed, item added, item removed) without a
-- separate round-trip to fetch the previous state.
--
-- REPLICA IDENTITY FULL means every UPDATE/DELETE event carries both old and
-- new column values. The performance tradeoff is negligible on a small table
-- like order_items.

ALTER TABLE order_items REPLICA IDENTITY FULL;
