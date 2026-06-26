-- Temporary introspection function — verifying a suspected RLS gap on
-- `shipments` before trusting an indirect (anon-key query returning 0 rows)
-- signal. Dropped by the immediately-following migration once used.
CREATE OR REPLACE FUNCTION _tmp_introspect_shipments_rls()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rls_enabled BOOLEAN;
  v_policies JSON;
  v_grants JSON;
BEGIN
  SELECT relrowsecurity INTO v_rls_enabled FROM pg_class WHERE relname = 'shipments';

  SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT('name', policyname, 'cmd', cmd, 'roles', roles, 'qual', qual)), '[]'::JSON)
  INTO v_policies
  FROM pg_policies WHERE tablename = 'shipments';

  SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT('grantee', grantee, 'privilege', privilege_type)), '[]'::JSON)
  INTO v_grants
  FROM information_schema.role_table_grants
  WHERE table_name = 'shipments' AND grantee IN ('authenticated', 'anon', 'public');

  RETURN JSON_BUILD_OBJECT('rls_enabled', v_rls_enabled, 'policies', v_policies, 'grants', v_grants);
END;
$$;

GRANT EXECUTE ON FUNCTION _tmp_introspect_shipments_rls() TO service_role;
