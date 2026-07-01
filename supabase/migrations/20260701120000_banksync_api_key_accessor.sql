-- Vault accessor for the BankSync API key.
-- SECURITY DEFINER + empty search_path so the postgres owner can read vault.decrypted_secrets
-- without exposing the vault schema to any application role.
-- PostgREST does not expose the vault schema, so server actions must retrieve the key
-- through this RPC using the service-role client.
-- Security model mirrors the existing bank-bridge functions in 20260617100000.

CREATE OR REPLACE FUNCTION public.get_banksync_api_key()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'banksync_api_key'
  LIMIT 1;
$$;

-- Lock down: revoke from PUBLIC (inherits to anon + authenticated), then belt-and-suspenders
-- explicit revokes, then grant only to service_role.
REVOKE ALL ON FUNCTION public.get_banksync_api_key() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_banksync_api_key() FROM anon;
REVOKE ALL ON FUNCTION public.get_banksync_api_key() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_banksync_api_key() TO service_role;

COMMENT ON FUNCTION public.get_banksync_api_key() IS
  'Returns the BankSync API key from Supabase Vault (secret name: banksync_api_key). '
  'SECURITY DEFINER so the postgres owner can read vault.decrypted_secrets. '
  'SET search_path = '''' forces all references to be fully schema-qualified. '
  'Callable by service_role only — used by syncBankFromSource() server action and morning cron.';
