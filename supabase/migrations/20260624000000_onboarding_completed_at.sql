-- ============================================================================
-- ONBOARDING TOUR — first-login welcome + role-aware guided tour
-- ============================================================================
-- NULL means the user hasn't completed (or skipped) onboarding yet — the
-- guided tour shows once on their next login. Set on completion or skip,
-- both treated the same in Phase 1 (no "replay" entry point yet).

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
