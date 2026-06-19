-- organizations had RLS enabled with SELECT/INSERT/UPDATE policies, but no
-- FOR DELETE policy was ever created. With RLS enabled and zero matching
-- DELETE policies, Postgres silently excludes every row from the delete for
-- every role — including admin. The DELETE statement doesn't error; it just
-- deletes 0 rows, which surfaced as "Organization not found, or you do not
-- have permission to delete it" for an actual admin user. Add the missing
-- policy so the API's existing admin-only check is actually backed by RLS
-- that allows it to succeed.

CREATE POLICY organizations_delete_admin ON organizations FOR DELETE
  USING (is_admin());
