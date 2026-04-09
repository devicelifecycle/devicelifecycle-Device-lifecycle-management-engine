-- ============================================================================
-- ENABLE SUPABASE REALTIME FOR ALL KEY TABLES
-- ============================================================================
-- Without this, postgres_changes subscriptions silently receive no events.
-- Each table must be explicitly added to the supabase_realtime publication.
-- This is the root cause of cross-device sync not working for the Toronto team.

DO $$
DECLARE
  tables TEXT[] := ARRAY[
    'orders', 'order_items', 'order_timeline', 'order_exceptions',
    'imei_records', 'triage_results',
    'device_catalog',
    'customers', 'vendors', 'users',
    'shipments',
    'competitor_prices',
    'notifications'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Only add if not already in the publication
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Added % to supabase_realtime', t;
    ELSE
      RAISE NOTICE '% already in supabase_realtime, skipping', t;
    END IF;
  END LOOP;
END;
$$;
