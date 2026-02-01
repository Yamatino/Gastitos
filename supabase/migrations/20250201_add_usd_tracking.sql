-- Add columns for USD payment tracking
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS original_currency TEXT CHECK (original_currency IN ('ARS', 'USD')),
ADD COLUMN IF NOT EXISTS original_amount_cents INTEGER;

-- Add comment explaining the columns
COMMENT ON COLUMN expenses.original_currency IS 'Original currency when payment was made (ARS or USD)';
COMMENT ON COLUMN expenses.original_amount_cents IS 'Original amount in cents in the original currency';
