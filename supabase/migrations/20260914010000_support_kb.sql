-- ============================================================================
-- SUPPORT DEPTH — ticket SLA due time + Knowledge Base articles
-- 2026-08-02
-- Additive: one column on tickets + a new kb_articles table.
-- ============================================================================

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS kb_articles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'General',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_kb_tenant ON kb_articles(tenant_id);

ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kb_service ON kb_articles;
CREATE POLICY kb_service ON kb_articles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');