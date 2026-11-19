-- ============================================================================
-- MCP PHASE 2 — OAuth 2.1 for the DLM MCP connector
-- 2026-11-18
--
-- Lets a person connect an AI assistant (Claude.ai, Claude Desktop, Cursor…)
-- to DLM by signing in, instead of pasting an organization-wide API key. The
-- grant is tied to that user, so the assistant gets exactly their access
-- (a rep: their customers; a regional manager: their region).
--
-- Storage rules: codes and tokens are stored ONLY as SHA-256 hashes; nothing
-- here is readable by any session role (service role only, used by the OAuth
-- endpoints after their own checks).
-- ============================================================================

-- Clients registered through Dynamic Client Registration (RFC 7591). Public
-- clients only (PKCE, no client secret), as the MCP authorization spec expects.
CREATE TABLE IF NOT EXISTS oauth_clients (
  id             TEXT PRIMARY KEY,                 -- client_id
  client_name    TEXT NOT NULL,
  redirect_uris  TEXT[] NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time authorization codes (≤60 s, PKCE S256).
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash       TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri    TEXT NOT NULL,
  code_challenge  TEXT NOT NULL,
  scopes          TEXT[] NOT NULL,
  resource        TEXT,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Access (1 h) and refresh (30 d, rotating) tokens. A grant = one family_id:
-- revoking the grant revokes every token in the family. A refresh token used
-- twice (theft signal) revokes the whole family.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  family_id     UUID NOT NULL,
  client_id     TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  scopes        TEXT[] NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  used_at       TIMESTAMPTZ,                       -- refresh tokens: rotation marker
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens (user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_family ON oauth_tokens (family_id);

-- Two-step confirmations for MCP write tools: single use, so a retried or
-- replayed confirm returns the first result instead of acting twice.
CREATE TABLE IF NOT EXISTS mcp_confirmations (
  token_hash  TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool        TEXT NOT NULL,
  result      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE oauth_clients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_confirmations ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (which bypasses RLS) can touch these.
