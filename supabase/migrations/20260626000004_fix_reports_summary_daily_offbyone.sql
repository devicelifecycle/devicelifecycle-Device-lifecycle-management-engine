-- generate_series(v_since::date, NOW()::date, '1 day') is inclusive on both
-- ends, producing p_days + 1 calendar days (e.g. days=7 gave 8 entries) —
-- the original JS built exactly `days` entries (today back through days-1).
-- Verified via side-by-side comparison against the JS it's replacing before
-- this was caught.
CREATE OR REPLACE FUNCTION get_reports_summary(p_days INT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
  v_prev_since TIMESTAMPTZ := NOW() - (p_days * 2 || ' days')::INTERVAL;
  v_daily_start DATE := (NOW()::date - (p_days - 1));
  v_by_status JSON;
  v_daily JSON;
  v_total INT;
  v_active INT;
  v_trade_in INT;
  v_cpo INT;
  v_total_value NUMERIC;
  v_valued_order_count INT;
  v_period_orders INT;
  v_prev_period_orders INT;
  v_period_revenue NUMERIC;
  v_prev_period_revenue NUMERIC;
  v_completed INT;
  v_cancelled INT;
BEGIN
  SELECT COALESCE(JSON_OBJECT_AGG(status, cnt), '{}'::JSON)
  INTO v_by_status
  FROM (SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status) s;

  SELECT
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE status IN ('submitted','quoted','received'))::INT,
    COUNT(*) FILTER (WHERE type = 'trade_in')::INT,
    COUNT(*) FILTER (WHERE type <> 'trade_in')::INT,
    COALESCE(SUM(total_amount), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE COALESCE(total_amount, 0) > 0)::INT,
    COUNT(*) FILTER (WHERE created_at >= v_since)::INT,
    COUNT(*) FILTER (WHERE created_at >= v_prev_since AND created_at < v_since)::INT,
    COALESCE(SUM(total_amount) FILTER (WHERE created_at >= v_since), 0)::NUMERIC,
    COALESCE(SUM(total_amount) FILTER (WHERE created_at >= v_prev_since AND created_at < v_since), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE status IN ('closed','delivered'))::INT,
    COUNT(*) FILTER (WHERE status = 'cancelled')::INT
  INTO
    v_total, v_active, v_trade_in, v_cpo, v_total_value, v_valued_order_count,
    v_period_orders, v_prev_period_orders, v_period_revenue, v_prev_period_revenue,
    v_completed, v_cancelled
  FROM orders;

  SELECT COALESCE(JSON_AGG(JSON_BUILD_OBJECT('date', d.date, 'count', d.cnt, 'revenue', d.rev) ORDER BY d.date), '[]'::JSON)
  INTO v_daily
  FROM (
    SELECT
      TO_CHAR(gs.day, 'YYYY-MM-DD') AS date,
      COUNT(o.id)::INT AS cnt,
      COALESCE(SUM(o.total_amount), 0)::NUMERIC AS rev
    FROM generate_series(v_daily_start, NOW()::date, '1 day'::interval) AS gs(day)
    LEFT JOIN orders o ON o.created_at::date = gs.day
    GROUP BY gs.day
  ) d;

  RETURN JSON_BUILD_OBJECT(
    'total', v_total,
    'active', v_active,
    'by_status', v_by_status,
    'trade_in', v_trade_in,
    'cpo', v_cpo,
    'total_value', v_total_value,
    'valued_order_count', v_valued_order_count,
    'period_orders', v_period_orders,
    'prev_period_orders', v_prev_period_orders,
    'period_revenue', v_period_revenue,
    'prev_period_revenue', v_prev_period_revenue,
    'completed', v_completed,
    'cancelled', v_cancelled,
    'daily', v_daily
  );
END;
$$;
