-- ============================================
-- Drop leftovers from the removed "pago recurrente" feature.
-- The UI component was deleted previously; this finishes the removal
-- by dropping the now-unused index and columns.
-- ============================================

DROP INDEX IF EXISTS idx_unique_monthly_recurring;

ALTER TABLE expenses DROP COLUMN IF EXISTS is_recurring;
ALTER TABLE expenses DROP COLUMN IF EXISTS recurring_parent_id;
