-- Migration: Migrate existing categories and transactions
-- Created: 2025-02-03
-- Purpose: Convert existing Ahorro/Salario/Otros categories to new system

-- ============================================
-- BACKUP: Create backup tables before migration
-- ============================================

-- Backup expenses table
CREATE TABLE IF NOT EXISTS expenses_backup_20250203 AS 
SELECT * FROM expenses;

-- Backup categories table  
CREATE TABLE IF NOT EXISTS categories_backup_20250203 AS
SELECT * FROM categories;

-- Create migration log table
CREATE TABLE IF NOT EXISTS migration_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    migration_name TEXT NOT NULL,
    executed_at TIMESTAMP DEFAULT NOW(),
    details JSONB
);

-- ============================================
-- STEP 1: Identify special categories
-- ============================================

DO $$
DECLARE
    v_ahorro_cat RECORD;
    v_salario_cat RECORD;
    v_otros_cat RECORD;
    v_expense RECORD;
    v_count INTEGER := 0;
BEGIN
    -- Find Ahorro categories
    FOR v_ahorro_cat IN 
        SELECT * FROM categories 
        WHERE LOWER(name) = 'ahorro' OR type = 'savings'
    LOOP
        RAISE NOTICE 'Found Ahorro category: % (ID: %)', v_ahorro_cat.name, v_ahorro_cat.id;
        
        -- Update all transactions with this category to transaction_type='savings'
        UPDATE expenses
        SET transaction_type = 'savings',
            category_id = NULL  -- Remove category reference
        WHERE category_id = v_ahorro_cat.id;
        
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE 'Updated % transactions to savings type', v_count;
        
        -- Log the migration
        INSERT INTO migration_log (migration_name, details)
        VALUES ('convert_ahorro_category', 
                jsonb_build_object('category_id', v_ahorro_cat.id, 
                                   'category_name', v_ahorro_cat.name,
                                   'transactions_updated', v_count));
    END LOOP;
    
    -- Find Salario categories
    FOR v_salario_cat IN
        SELECT * FROM categories
        WHERE LOWER(name) = 'salario' OR LOWER(name) = 'sueldo'
    LOOP
        RAISE NOTICE 'Found Salario category: % (ID: %)', v_salario_cat.name, v_salario_cat.id;
        
        -- Update all transactions with this category
        UPDATE expenses
        SET transaction_type = 'income',
            is_salary = true,
            category_id = NULL
        WHERE category_id = v_salario_cat.id;
        
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE 'Updated % transactions to salary income', v_count;
        
        INSERT INTO migration_log (migration_name, details)
        VALUES ('convert_salario_category',
                jsonb_build_object('category_id', v_salario_cat.id,
                                   'category_name', v_salario_cat.name,
                                   'transactions_updated', v_count));
    END LOOP;
    
    -- Find Otros income categories
    FOR v_otros_cat IN
        SELECT * FROM categories
        WHERE LOWER(name) = 'otros' AND type = 'income'
    LOOP
        RAISE NOTICE 'Found Otros income category: % (ID: %)', v_otros_cat.name, v_otros_cat.id;
        
        -- Update all transactions with this category
        UPDATE expenses
        SET transaction_type = 'income',
            is_salary = false,
            category_id = NULL
        WHERE category_id = v_otros_cat.id;
        
        GET DIAGNOSTICS v_count = ROW_COUNT;
        RAISE NOTICE 'Updated % transactions to other income', v_count;
        
        INSERT INTO migration_log (migration_name, details)
        VALUES ('convert_otros_category',
                jsonb_build_object('category_id', v_otros_cat.id,
                                   'category_name', v_otros_cat.name,
                                   'transactions_updated', v_count));
    END LOOP;
    
    -- Handle any remaining income-type transactions
    FOR v_expense IN
        SELECT e.* FROM expenses e
        JOIN categories c ON e.category_id = c.id
        WHERE c.type = 'income' AND e.transaction_type = 'expense'
    LOOP
        UPDATE expenses
        SET transaction_type = 'income',
            is_salary = false,
            category_id = NULL
        WHERE id = v_expense.id;
        
        v_count := v_count + 1;
    END LOOP;
    
    IF v_count > 0 THEN
        RAISE NOTICE 'Updated % additional income transactions', v_count;
        
        INSERT INTO migration_log (migration_name, details)
        VALUES ('convert_remaining_income',
                jsonb_build_object('transactions_updated', v_count));
    END IF;
END $$;

-- ============================================
-- STEP 2: Mark remaining expense transactions
-- ============================================

UPDATE expenses
SET transaction_type = 'expense'
WHERE transaction_type = 'expense' OR transaction_type IS NULL;

INSERT INTO migration_log (migration_name, details)
VALUES ('mark_expense_transactions',
        jsonb_build_object('note', 'Marked all remaining transactions as expense type'));

-- ============================================
-- STEP 3: Remove special categories
-- ============================================

-- Delete Ahorro, Salario, and Otros categories
DELETE FROM categories
WHERE LOWER(name) IN ('ahorro', 'salario', 'sueldo', 'otros')
   OR type IN ('savings', 'income');

INSERT INTO migration_log (migration_name, details)
VALUES ('delete_special_categories',
        jsonb_build_object('note', 'Deleted Ahorro, Salario, and Otros categories'));

-- ============================================
-- STEP 4: Update remaining categories to expense-only
-- ============================================

-- Remove the type column constraint and set all to expense
UPDATE categories
SET type = 'expense'
WHERE type IS NULL OR type != 'expense';

-- Make all categories deletable (remove is_default protection)
UPDATE categories
SET is_default = false;

INSERT INTO migration_log (migration_name, details)
VALUES ('update_category_defaults',
        jsonb_build_object('note', 'All categories are now deletable'));

-- ============================================
-- STEP 5: Create default expense categories for new users
-- ============================================

-- These will be created by the app for new users, but let's ensure they exist
-- for any users who don't have them
DO $$
DECLARE
    v_user RECORD;
    v_category_exists BOOLEAN;
BEGIN
    FOR v_user IN SELECT DISTINCT user_id FROM expenses
    LOOP
        -- Check if user has any categories
        SELECT EXISTS(
            SELECT 1 FROM categories WHERE user_id = v_user.user_id
        ) INTO v_category_exists;
        
        IF NOT v_category_exists THEN
            -- Create default expense categories for this user
            INSERT INTO categories (user_id, name, icon, color, is_default, type)
            VALUES 
                (v_user.user_id, 'Supermercado', '🛒', '#F59E0B', false, 'expense'),
                (v_user.user_id, 'Salida', '🍻', '#EC4899', false, 'expense'),
                (v_user.user_id, 'Transporte', '🚗', '#3B82F6', false, 'expense'),
                (v_user.user_id, 'Servicios', '💡', '#6B7280', false, 'expense');
            
            RAISE NOTICE 'Created default categories for user %', v_user.user_id;
        END IF;
    END LOOP;
END $$;

-- ============================================
-- STEP 6: Create rollback function
-- ============================================

CREATE OR REPLACE FUNCTION rollback_migration_categories_20250203()
RETURNS VOID AS $$
BEGIN
    -- Restore from backups
    TRUNCATE expenses;
    INSERT INTO expenses SELECT * FROM expenses_backup_20250203;
    
    TRUNCATE categories;
    INSERT INTO categories SELECT * FROM categories_backup_20250203;
    
    -- Remove migration log entries
    DELETE FROM migration_log 
    WHERE migration_name LIKE '%20250203%' 
       OR migration_name IN (
           'convert_ahorro_category',
           'convert_salario_category', 
           'convert_otros_category',
           'convert_remaining_income',
           'mark_expense_transactions',
           'delete_special_categories',
           'update_category_defaults'
       );
    
    RAISE NOTICE 'Category migration rolled back successfully';
    RAISE NOTICE 'Data restored from backups';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

DO $$
DECLARE
    v_savings_count INTEGER;
    v_salary_count INTEGER;
    v_other_income_count INTEGER;
    v_expense_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_savings_count FROM expenses WHERE transaction_type = 'savings';
    SELECT COUNT(*) INTO v_salary_count FROM expenses WHERE transaction_type = 'income' AND is_salary = true;
    SELECT COUNT(*) INTO v_other_income_count FROM expenses WHERE transaction_type = 'income' AND is_salary = false;
    SELECT COUNT(*) INTO v_expense_count FROM expenses WHERE transaction_type = 'expense';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Category Migration Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Savings transactions: %', v_savings_count;
    RAISE NOTICE 'Salary transactions: %', v_salary_count;
    RAISE NOTICE 'Other income transactions: %', v_other_income_count;
    RAISE NOTICE 'Expense transactions: %', v_expense_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'To rollback, run: SELECT rollback_migration_categories_20250203();';
    RAISE NOTICE 'Backups created: expenses_backup_20250203, categories_backup_20250203';
END $$;
