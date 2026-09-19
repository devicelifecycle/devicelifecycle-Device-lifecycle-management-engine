-- ============================================================================
-- repair_costs: stop serving pricing internals to the anonymous role
-- ============================================================================
-- A sweep of all 57 public tables with the anon key (2026-09-19) found exactly
-- one that returned rows: repair_costs, via the policy "Anyone can read repair
-- costs" (USING true). That table is Byte-Back's internal repair-cost model —
-- the same pricing internals the public device-value endpoint deliberately
-- withholds ("never the full pricing breakdown"). Anyone with the public anon
-- key (it ships in the browser bundle) could list it.
--
-- Every legitimate reader is either a signed-in user going through
-- PricingService with their own server client, or the public value-lookup
-- route using the service role (which bypasses RLS). So: authenticated only.
-- Admin/COE write access is unchanged.

DROP POLICY IF EXISTS "Anyone can read repair costs" ON repair_costs;
DROP POLICY IF EXISTS "Authenticated users can read repair costs" ON repair_costs;
CREATE POLICY "Authenticated users can read repair costs" ON repair_costs
  FOR SELECT USING (auth.uid() IS NOT NULL);
