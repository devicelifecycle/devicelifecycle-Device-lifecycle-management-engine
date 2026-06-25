-- ============================================================================
-- NOTIFICATION ATTEMPT LOGGING
-- ============================================================================
-- Failed transactional email/SMS sends (quote emails, status notifications)
-- were previously logged only via console.error/console.warn — once Vercel's
-- log retention window passes, there is no way to answer "did my quote email
-- even attempt to send." This table is the persisted record EmailService now
-- writes to on every send attempt, success or failure.
-- ============================================================================

CREATE TABLE notification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient VARCHAR(255) NOT NULL,
  subject TEXT,
  provider VARCHAR(50),
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_attempts_recipient ON notification_attempts(recipient, created_at DESC);
CREATE INDEX idx_notification_attempts_status ON notification_attempts(status) WHERE status = 'failed';

ALTER TABLE notification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view notification attempts" ON notification_attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );
