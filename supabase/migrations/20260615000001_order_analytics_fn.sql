-- Monthly and all-time order analytics for the admin dashboard.
-- SECURITY DEFINER lets the function aggregate across all rows without RLS;
-- access control is enforced at the API layer (internal roles only).
CREATE OR REPLACE FUNCTION get_order_analytics()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  monthly_data JSON;
  alltime_data JSON;
BEGIN
  -- One row per calendar month (America/Toronto), excluding cancelled orders.
  SELECT COALESCE(JSON_AGG(m ORDER BY m.month), '[]'::JSON)
  INTO monthly_data
  FROM (
    SELECT
      TO_CHAR(
        DATE_TRUNC('month', created_at AT TIME ZONE 'America/Toronto'),
        'YYYY-MM'
      )                                       AS month,
      COUNT(*)::INT                           AS order_count,
      COALESCE(SUM(total_amount), 0)::NUMERIC AS total_value
    FROM orders
    WHERE status <> 'cancelled'
    GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'America/Toronto')
    ORDER BY 1
  ) m;

  -- All-time totals (same exclusion).
  SELECT JSON_BUILD_OBJECT(
    'total_orders', COUNT(*)::INT,
    'total_value',  COALESCE(SUM(total_amount), 0)::NUMERIC
  )
  INTO alltime_data
  FROM orders
  WHERE status <> 'cancelled';

  RETURN JSON_BUILD_OBJECT(
    'monthly',   monthly_data,
    'all_time',  alltime_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_order_analytics() TO authenticated;
