import { describe, it, expect } from 'vitest'
import type { Category, Expense } from '../services/supabase'
import { aggregateByCategory, getCurrentMonthExpenseByCategory } from '../lib/categoryAggregation'

const categories: Category[] = [
  { id: 'cat-food', user_id: 'u1', name: 'Comida', icon: '🍔', color: '#ff0000', is_default: true, created_at: '' },
  { id: 'cat-transport', user_id: 'u1', name: 'Transporte', icon: '🚌', color: '#00ff00', is_default: true, created_at: '' },
]

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: overrides.id || 'exp-1',
    user_id: 'user-1',
    description: 'Test',
    amount_cents: 1000,
    currency: 'ARS',
    exchange_rate: 1000,
    usd_amount_cents: 1,
    category_id: 'cat-food',
    payment_method: 'debit',
    is_installment: false,
    installment_group_id: null,
    installment_number: null,
    total_installments: null,
    installment_amount_cents: null,
    date: '2026-08-05',
    status: 'paid',
    created_at: '2026-08-05T00:00:00Z',
    updated_at: '2026-08-05T00:00:00Z',
    transaction_type: 'expense',
    is_salary: false,
    ...overrides,
  }
}

describe('categoryAggregation', () => {
  describe('aggregateByCategory', () => {
    it('sums amounts per category and sorts descending', () => {
      const expenses = [
        makeExpense({ id: '1', category_id: 'cat-food', amount_cents: 1000 }),
        makeExpense({ id: '2', category_id: 'cat-food', amount_cents: 2000 }),
        makeExpense({ id: '3', category_id: 'cat-transport', amount_cents: 500 }),
      ]
      const result = aggregateByCategory(expenses, categories, () => true)
      expect(result[0]).toMatchObject({ categoryId: 'cat-food', totalCents: 3000 })
      expect(result[1]).toMatchObject({ categoryId: 'cat-transport', totalCents: 500 })
    })

    it('respects the predicate', () => {
      const expenses = [
        makeExpense({ id: '1', transaction_type: 'expense', amount_cents: 1000 }),
        makeExpense({ id: '2', transaction_type: 'savings', amount_cents: 5000 }),
      ]
      const result = aggregateByCategory(expenses, categories, (e) => e.transaction_type === 'expense')
      expect(result).toHaveLength(1)
      expect(result[0].totalCents).toBe(1000)
    })

    it('ignores rows with no category', () => {
      const expenses = [makeExpense({ id: '1', category_id: null })]
      const result = aggregateByCategory(expenses, categories, () => true)
      expect(result).toHaveLength(0)
    })
  })

  describe('getCurrentMonthExpenseByCategory', () => {
    const referenceDate = new Date(2026, 7, 15) // Aug 2026

    it('only counts expense-type rows in the reference month', () => {
      const expenses = [
        makeExpense({ id: '1', category_id: 'cat-food', amount_cents: 1000, date: '2026-08-01', transaction_type: 'expense' }),
        makeExpense({ id: '2', category_id: 'cat-food', amount_cents: 9000, date: '2026-08-02', transaction_type: 'savings' }),
        makeExpense({ id: '3', category_id: 'cat-food', amount_cents: 5000, date: '2026-07-01', transaction_type: 'expense' }),
      ]
      const map = getCurrentMonthExpenseByCategory(expenses, categories, referenceDate)
      expect(map.get('cat-food')).toBe(1000)
    })
  })
})
