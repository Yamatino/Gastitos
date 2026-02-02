-- Migration: Add savings type to categories
-- Date: 2025-02-02

-- Update the CHECK constraint to allow 'savings' type
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_type_check;

ALTER TABLE categories ADD CONSTRAINT categories_type_check 
  CHECK (type IN ('income', 'expense', 'savings'));

-- Update existing categories that might have NULL type
UPDATE categories SET type = 'expense' WHERE type IS NULL;
