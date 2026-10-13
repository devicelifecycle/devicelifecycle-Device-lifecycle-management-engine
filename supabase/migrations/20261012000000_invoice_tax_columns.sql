-- ============================================================================
-- ADD TAX COLUMNS to BB→VAR invoices (2026-10-12)
-- Reuse the Canadian tax engine for subscription invoices.
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate   NUMERIC(6,5) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_label  TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
