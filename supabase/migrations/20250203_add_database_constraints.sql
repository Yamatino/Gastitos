-- Migration: Add database constraints and safety measures
-- Created: 2025-02-03
-- Purpose: Make the database more robust and prevent data inconsistencies

-- ============================================
-- STEP 1: Add transaction_type to expenses table
-- ============================================

-- Add transaction_type column to track expense/income/savings
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS transaction_type TEXT DEFAULT 'expense' 
CHECK (transaction_type IN ('expense', 'income', 'savings'));

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_expenses_transaction_type 
ON expenses(transaction_type);

-- ============================================
-- STEP 2: Add is_salary flag for income entries
-- ============================================

ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS is_salary BOOLEAN DEFAULT false;

-- Add index for salary filtering
CREATE INDEX IF NOT EXISTS idx_expenses_is_salary 
ON expenses(is_salary) 
WHERE transaction_type = 'income';

-- ============================================
-- STEP 3: Prevent duplicate recurring expenses
-- ============================================

-- Add unique constraint to prevent duplicate recurring expenses per month
-- This prevents race conditions where multiple tabs create the same recurring expense
-- Note: We use a partial index instead of a constraint for conditional uniqueness
DROP INDEX IF EXISTS idx_unique_monthly_recurring;
CREATE UNIQUE INDEX idx_unique_monthly_recurring 
ON expenses (user_id, description, category_id, date) 
WHERE is_recurring = true;

-- ============================================
-- STEP 4: Add foreign key constraint with RESTRICT
-- ============================================

-- First, remove orphaned transactions (transactions with non-existent categories)
-- These will be logged for manual review
DO $$
DECLARE
    orphaned_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphaned_count
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE c.id IS NULL AND e.category_id IS NOT NULL;
    
    IF orphaned_count > 0 THEN
        RAISE NOTICE 'Found % orphaned transactions. These should be reviewed manually.', orphaned_count;
    END IF;
END $$;

-- Add foreign key constraint to prevent deleting categories with transactions
-- Note: This will fail if there are orphaned transactions
-- If it fails, you'll need to either:
--   1. Delete orphaned transactions, or
--   2. Create a default "Uncategorized" category and assign orphaned transactions to it

-- First, let's create a fallback category for orphaned transactions
INSERT INTO categories (user_id, name, icon, color, is_default, type)
SELECT DISTINCT e.user_id, 'Sin categoría', '❓', '#6B7280', false, 'expense'
FROM expenses e
LEFT JOIN categories c ON e.category_id = c.id
WHERE c.id IS NULL AND e.category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update orphaned transactions to use the fallback category
UPDATE expenses e
SET category_id = (
    SELECT id FROM categories 
    WHERE user_id = e.user_id AND name = 'Sin categoría'
    LIMIT 1
)
WHERE e.category_id IS NOT NULL 
AND NOT EXISTS (
    SELECT 1 FROM categories c WHERE c.id = e.category_id
);

-- Now add the foreign key constraint
ALTER TABLE expenses
ADD CONSTRAINT fk_expenses_category
FOREIGN KEY (category_id) 
REFERENCES categories(id)
ON DELETE RESTRICT;

-- ============================================
-- STEP 5: Fix existing data before adding constraints
-- ============================================

-- Fix transactions with wrong amount signs based on their type
-- For expense/savings: amount_cents should be positive
-- For income: amount_cents should be negative

-- Fix expense transactions with negative amounts (convert to positive)
UPDATE expenses
SET amount_cents = ABS(amount_cents),
    usd_amount_cents = ABS(usd_amount_cents)
WHERE transaction_type = 'expense' 
  AND amount_cents < 0;

-- Fix savings transactions with negative amounts (convert to positive)
UPDATE expenses
SET amount_cents = ABS(amount_cents),
    usd_amount_cents = ABS(usd_amount_cents)
WHERE transaction_type = 'savings' 
  AND amount_cents < 0;

-- Fix income transactions with positive amounts (convert to negative)
UPDATE expenses
SET amount_cents = -ABS(amount_cents),
    usd_amount_cents = -ABS(usd_amount_cents)
WHERE transaction_type = 'income' 
  AND amount_cents > 0;

-- Log the fixes
DO $$
DECLARE
    v_fixed_expense INTEGER;
    v_fixed_savings INTEGER;
    v_fixed_income INTEGER;
BEGIN
    -- These would have been updated above, let's just log that we're proceeding
    RAISE NOTICE 'Fixed data inconsistencies before applying constraints';
END $$;

-- ============================================
-- STEP 6: Add data validation constraints
-- ============================================

-- Ensure amount_cents is always positive for expenses/savings, negative for income
ALTER TABLE expenses
ADD CONSTRAINT check_amount_cents_sign
CHECK (
    (transaction_type = 'expense' AND amount_cents >= 0) OR
    (transaction_type = 'savings' AND amount_cents >= 0) OR
    (transaction_type = 'income' AND amount_cents <= 0)
);

-- Ensure installments are within valid range
ALTER TABLE expenses
ADD CONSTRAINT check_installments_range
CHECK (
    is_installment = false OR 
    (is_installment = true AND total_installments BETWEEN 1 AND 24)
);

-- ============================================
-- STEP 7: Add timestamps for audit trail
-- ============================================

-- Add updated_at column if not exists
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 8: Create function for atomic installment creation
-- ============================================

CREATE OR REPLACE FUNCTION create_installments(
    p_user_id UUID,
    p_description TEXT,
    p_amount_cents INTEGER,
    p_currency TEXT,
    p_exchange_rate NUMERIC,
    p_usd_amount_cents INTEGER,
    p_category_id UUID,
    p_installment_count INTEGER,
    p_base_date DATE,
    p_billing_day INTEGER
)
RETURNS UUID[] AS $$
DECLARE
    v_installment_group_id UUID := gen_random_uuid();
    v_installment_amount INTEGER;
    v_remainder INTEGER;
    v_current_amount INTEGER;
    v_installment_date DATE;
    v_installment_ids UUID[];
    v_i INTEGER;
BEGIN
    -- Calculate base installment amount
    v_installment_amount := FLOOR(p_amount_cents / p_installment_count);
    v_remainder := p_amount_cents % p_installment_count;
    
    -- Create all installments in a single transaction
    FOR v_i IN 0..p_installment_count-1 LOOP
        -- First installment gets the remainder
        IF v_i = 0 THEN
            v_current_amount := v_installment_amount + v_remainder;
        ELSE
            v_current_amount := v_installment_amount;
        END IF;
        
        -- Calculate installment date
        v_installment_date := MAKE_DATE(
            EXTRACT(YEAR FROM p_base_date)::INTEGER,
            EXTRACT(MONTH FROM p_base_date)::INTEGER + v_i,
            LEAST(p_billing_day, 28)
        );
        
        -- Handle year rollover
        WHILE EXTRACT(MONTH FROM v_installment_date) > 12 LOOP
            v_installment_date := v_installment_date + INTERVAL '1 year';
            v_installment_date := MAKE_DATE(
                EXTRACT(YEAR FROM v_installment_date)::INTEGER,
                EXTRACT(MONTH FROM v_installment_date)::INTEGER - 12,
                LEAST(p_billing_day, 28)
            );
        END LOOP;
        
        -- Insert installment
        INSERT INTO expenses (
            user_id,
            description,
            amount_cents,
            currency,
            exchange_rate,
            usd_amount_cents,
            category_id,
            payment_method,
            is_installment,
            installment_group_id,
            installment_number,
            total_installments,
            installment_amount_cents,
            date,
            status,
            transaction_type
        ) VALUES (
            p_user_id,
            p_description || ' (' || (v_i + 1) || '/' || p_installment_count || ')',
            v_current_amount,
            p_currency,
            p_exchange_rate,
            FLOOR(v_current_amount / p_exchange_rate),
            p_category_id,
            'credit',
            true,
            v_installment_group_id,
            v_i + 1,
            p_installment_count,
            v_current_amount,
            v_installment_date,
            'pending',
            'expense'
        )
        RETURNING id INTO v_installment_ids[v_i + 1];
    END LOOP;
    
    RETURN v_installment_ids;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 9: Create rollback function
-- ============================================

CREATE OR REPLACE FUNCTION rollback_migration_20250203()
RETURNS VOID AS $$
BEGIN
    -- Remove constraints
    ALTER TABLE expenses DROP CONSTRAINT IF EXISTS check_amount_cents_sign;
    ALTER TABLE expenses DROP CONSTRAINT IF EXISTS check_installments_range;
    ALTER TABLE expenses DROP CONSTRAINT IF EXISTS fk_expenses_category;
    DROP INDEX IF EXISTS idx_unique_monthly_recurring;
    
    -- Remove columns
    ALTER TABLE expenses DROP COLUMN IF EXISTS transaction_type;
    ALTER TABLE expenses DROP COLUMN IF EXISTS is_salary;
    ALTER TABLE expenses DROP COLUMN IF EXISTS updated_at;
    
    -- Remove trigger
    DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
    DROP FUNCTION IF EXISTS update_updated_at_column();
    
    -- Remove function
    DROP FUNCTION IF EXISTS create_installments(UUID, TEXT, INTEGER, TEXT, NUMERIC, INTEGER, UUID, INTEGER, DATE, INTEGER);
    
    -- Remove indexes
    DROP INDEX IF EXISTS idx_expenses_transaction_type;
    DROP INDEX IF EXISTS idx_expenses_is_salary;
    
    RAISE NOTICE 'Migration 20250203 rolled back successfully';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
DECLARE
    v_expense_count INTEGER;
    v_income_count INTEGER;
    v_savings_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_expense_count FROM expenses WHERE transaction_type = 'expense';
    SELECT COUNT(*) INTO v_income_count FROM expenses WHERE transaction_type = 'income';
    SELECT COUNT(*) INTO v_savings_count FROM expenses WHERE transaction_type = 'savings';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration 20250203 applied successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'New columns: transaction_type, is_salary, updated_at';
    RAISE NOTICE 'New constraints: foreign key, unique recurring, data validation';
    RAISE NOTICE 'New function: create_installments() for atomic installment creation';
    RAISE NOTICE 'Transaction counts after migration:';
    RAISE NOTICE '  - Expenses: %', v_expense_count;
    RAISE NOTICE '  - Income: %', v_income_count;
    RAISE NOTICE '  - Savings: %', v_savings_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'To rollback, run: SELECT rollback_migration_20250203();';
END $$;
