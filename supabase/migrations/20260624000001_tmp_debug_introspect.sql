-- Temporary debug helper to introspect live triggers — dropped in the next migration.
CREATE OR REPLACE FUNCTION tmp_debug_exec(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE 'SELECT jsonb_agg(t) FROM (' || query || ') t' INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION tmp_debug_exec(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tmp_debug_exec(text) TO service_role;
