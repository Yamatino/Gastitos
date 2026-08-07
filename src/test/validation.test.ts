import { describe, it, expect } from 'vitest'
import {
  CategorySchema,
  ExpenseSchema,
  CreateCategoryInputSchema,
  CreateExpenseInputSchema,
  validateCategoryInput,
  validateExpenseInput,
  sanitizeDescription,
  sanitizeCategoryName,
} from '../lib/validation'

describe('Validation Schemas', () => {
  describe('CategorySchema', () => {
    const validCategory = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      user_id: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Test Category',
      icon: '🛒',
      color: '#F59E0B',
      is_default: false,
      created_at: '2024-01-15T10:30:00Z',
    }

    it('validates a correct category object', () => {
      const result = CategorySchema.safeParse(validCategory)
      expect(result.success).toBe(true)
    })

    it('fails when name is empty', () => {
      const result = CategorySchema.safeParse({
        ...validCategory,
        name: '',
      })
      expect(result.success).toBe(false)
    })

    it('fails when name exceeds 50 characters', () => {
      const result = CategorySchema.safeParse({
        ...validCategory,
        name: 'A'.repeat(51),
      })
      expect(result.success).toBe(false)
    })

    it('fails when color is not a valid hex color', () => {
      const result = CategorySchema.safeParse({
        ...validCategory,
        color: 'not-a-color',
      })
      expect(result.success).toBe(false)
    })

    it('fails when icon exceeds 10 characters', () => {
      const result = CategorySchema.safeParse({
        ...validCategory,
        icon: '🛒'.repeat(11),
      })
      expect(result.success).toBe(false)
    })
  })

  describe('ExpenseSchema', () => {
    const validExpense = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      user_id: '550e8400-e29b-41d4-a716-446655440001',
      description: 'Test Expense',
      amount_cents: 10000,
      currency: 'ARS',
      exchange_rate: 1000,
      usd_amount_cents: 10,
      category_id: '550e8400-e29b-41d4-a716-446655440002',
      payment_method: 'debit',
      is_installment: false,
      date: '2024-01-15',
      status: 'paid',
      transaction_type: 'expense',
      created_at: '2024-01-15T10:30:00Z',
      updated_at: '2024-01-15T10:30:00Z',
    }

    it('validates a correct expense object', () => {
      const result = ExpenseSchema.safeParse(validExpense)
      expect(result.success).toBe(true)
    })

    it('accepts null category_id', () => {
      const result = ExpenseSchema.safeParse({
        ...validExpense,
        category_id: null,
      })
      expect(result.success).toBe(true)
    })

    it('accepts USD currency', () => {
      const result = ExpenseSchema.safeParse({
        ...validExpense,
        currency: 'USD',
        usd_amount_cents: 10000,
      })
      expect(result.success).toBe(true)
    })

    it('fails when description is empty', () => {
      const result = ExpenseSchema.safeParse({
        ...validExpense,
        description: '',
      })
      expect(result.success).toBe(false)
    })

    it('fails when amount_cents is not an integer', () => {
      const result = ExpenseSchema.safeParse({
        ...validExpense,
        amount_cents: 100.5,
      })
      expect(result.success).toBe(false)
    })

    it('fails when exchange_rate is not positive', () => {
      const result = ExpenseSchema.safeParse({
        ...validExpense,
        exchange_rate: -100,
      })
      expect(result.success).toBe(false)
    })

    it('fails with invalid date format', () => {
      const result = ExpenseSchema.safeParse({
        ...validExpense,
        date: '15-01-2024',
      })
      expect(result.success).toBe(false)
    })

    it('fails with invalid transaction_type', () => {
      const result = ExpenseSchema.safeParse({
        ...validExpense,
        transaction_type: 'invalid',
      })
      expect(result.success).toBe(false)
    })

    it('validates installment fields when provided', () => {
      const expenseWithInstallments = {
        ...validExpense,
        is_installment: true,
        installment_group_id: '550e8400-e29b-41d4-a716-446655440003',
        installment_number: 1,
        total_installments: 12,
        installment_amount_cents: 833,
      }
      const result = ExpenseSchema.safeParse(expenseWithInstallments)
      expect(result.success).toBe(true)
    })
  })

  describe('CreateCategoryInputSchema', () => {
    it('validates minimum required fields', () => {
      const result = CreateCategoryInputSchema.safeParse({
        name: 'Test Category',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.icon).toBe('📦')
        expect(result.data.color).toBe('#7C3AED')
        expect(result.data.is_default).toBe(false)
      }
    })

    it('trims whitespace from name', () => {
      const result = CreateCategoryInputSchema.safeParse({
        name: '  Test Category  ',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.name).toBe('Test Category')
      }
    })

    it('fails when name is empty', () => {
      const result = CreateCategoryInputSchema.safeParse({
        name: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('El nombre es requerido')
      }
    })

    it('fails when name exceeds 50 characters', () => {
      const result = CreateCategoryInputSchema.safeParse({
        name: 'A'.repeat(51),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('El nombre no puede tener más de 50 caracteres')
      }
    })

    it('accepts all valid fields', () => {
      const result = CreateCategoryInputSchema.safeParse({
        name: 'Supermercado',
        icon: '🛒',
        color: '#F59E0B',
        is_default: false,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('CreateExpenseInputSchema', () => {
    it('validates minimum required fields', () => {
      const result = CreateExpenseInputSchema.safeParse({
        description: 'Test Expense',
        amount: 100,
        date: '2024-01-15',
        category_id: null,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.currency).toBe('ARS')
        expect(result.data.payment_method).toBe('debit')
        expect(result.data.transaction_type).toBe('expense')
        expect(result.data.installments).toBe(1)
      }
    })

    it('removes HTML tags from description', () => {
      const result = CreateExpenseInputSchema.safeParse({
        description: '<script>alert("xss")</script>Test',
        amount: 100,
        date: '2024-01-15',
        category_id: null,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.description).toBe('scriptalert("xss")/scriptTest')
      }
    })

    it('fails when amount is not positive', () => {
      const result = CreateExpenseInputSchema.safeParse({
        description: 'Test',
        amount: 0,
        date: '2024-01-15',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('El monto debe ser mayor a 0')
      }
    })

    it('fails when amount exceeds maximum', () => {
      const result = CreateExpenseInputSchema.safeParse({
        description: 'Test',
        amount: 1000000001,
        date: '2024-01-15',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('El monto no puede ser mayor a 10,000,000 ARS')
      }
    })

    it('fails when description is empty', () => {
      const result = CreateExpenseInputSchema.safeParse({
        description: '',
        amount: 100,
        date: '2024-01-15',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('La descripción es requerida')
      }
    })

    it('fails when description exceeds 200 characters', () => {
      const result = CreateExpenseInputSchema.safeParse({
        description: 'A'.repeat(201),
        amount: 100,
        date: '2024-01-15',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('La descripción no puede tener más de 200 caracteres')
      }
    })

    it('validates installments range', () => {
      const result = CreateExpenseInputSchema.safeParse({
        description: 'Test',
        amount: 100,
        date: '2024-01-15',
        installments: 25,
      })
      expect(result.success).toBe(false)
    })

    it('accepts income transaction type', () => {
      const result = CreateExpenseInputSchema.safeParse({
        description: 'Salary',
        amount: 100000,
        date: '2024-01-15',
        transaction_type: 'income',
        category_id: null,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.transaction_type).toBe('income')
      }
    })

    it('accepts savings transaction type', () => {
      const result = CreateExpenseInputSchema.safeParse({
        description: 'Monthly Savings',
        amount: 50000,
        date: '2024-01-15',
        transaction_type: 'savings',
        category_id: null,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.transaction_type).toBe('savings')
      }
    })
  })

  describe('validateCategoryInput', () => {
    it('returns success for valid input', () => {
      const result = validateCategoryInput({ name: 'Test' })
      expect(result.success).toBe(true)
    })

    it('returns error for invalid input', () => {
      const result = validateCategoryInput({ name: '' })
      expect(result.success).toBe(false)
    })
  })

  describe('validateExpenseInput', () => {
    it('returns success for valid input', () => {
      const result = validateExpenseInput({
        description: 'Test',
        amount: 100,
        date: '2024-01-15',
        category_id: null,
      })
      expect(result.success).toBe(true)
    })

    it('returns error for invalid input', () => {
      const result = validateExpenseInput({
        description: '',
        amount: -100,
        date: '2024-01-15',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('sanitizeDescription', () => {
    it('removes HTML tags', () => {
      expect(sanitizeDescription('<b>Test</b>')).toBe('bTest/b')
    })

    it('trims whitespace', () => {
      expect(sanitizeDescription('  Test  ')).toBe('Test')
    })

    it('truncates to 200 characters', () => {
      const longDescription = 'A'.repeat(250)
      expect(sanitizeDescription(longDescription)).toBe('A'.repeat(200))
    })

    it('returns empty string for empty input', () => {
      expect(sanitizeDescription('')).toBe('')
    })
  })

  describe('sanitizeCategoryName', () => {
    it('removes HTML tags', () => {
      expect(sanitizeCategoryName('<b>Test</b>')).toBe('bTest/b')
    })

    it('trims whitespace', () => {
      expect(sanitizeCategoryName('  Test  ')).toBe('Test')
    })

    it('truncates to 50 characters', () => {
      const longName = 'A'.repeat(60)
      expect(sanitizeCategoryName(longName)).toBe('A'.repeat(50))
    })

    it('returns empty string for empty input', () => {
      expect(sanitizeCategoryName('')).toBe('')
    })
  })
})
