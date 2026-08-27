-- ============================================================================
-- QUOTE COMMUNICATION MODE — per-customer Option A/B (BB Trade In Quote
-- process spec, section 1, "Customer communication")
-- 2026-08-27
--
-- Option A ("var_only"): the released quote email goes to the VAR only, who
-- reviews and forwards/pushes it to the end customer themselves.
-- Option B ("var_and_customer", the default — matches today's existing
-- behavior of always emailing the customer directly): the quote goes to the
-- VAR and the end customer simultaneously, under the VAR's own branding.
--
-- Chosen per customer at onboarding; BB Admin can switch it afterward. NOT
-- to be confused with the separate VAR-billing Option A/B tracked in
-- docs/DLM_2.0.md — that one is about how a VAR bills its own customers.
-- ============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS quote_comm_mode TEXT NOT NULL DEFAULT 'var_and_customer'
  CHECK (quote_comm_mode IN ('var_only', 'var_and_customer'));
