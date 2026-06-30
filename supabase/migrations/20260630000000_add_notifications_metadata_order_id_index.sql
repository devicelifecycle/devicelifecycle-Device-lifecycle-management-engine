-- Expression index on notifications.metadata->>'order_id' — the SLA warning
-- dedup check (sla.service.ts handleWarning/handleEscalation) runs a JSONB path
-- query .eq('metadata->>order_id', order.id) once per open order per cron tick,
-- which was doing a full table scan. At 5,000+ open orders and growing
-- notifications table, this becomes the dominant cron bottleneck.
CREATE INDEX IF NOT EXISTS idx_notifications_metadata_order_id
  ON notifications ((metadata->>'order_id'))
  WHERE metadata->>'order_id' IS NOT NULL;
