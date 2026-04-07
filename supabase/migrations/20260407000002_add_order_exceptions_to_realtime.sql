-- ============================================================================
-- ADD ORDER EXCEPTIONS TO SUPABASE REALTIME PUBLICATION
-- ============================================================================
-- Ensures exception workflow updates are broadcast across all open devices.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'order_exceptions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.order_exceptions;
    END IF;
  END IF;
END $$;
