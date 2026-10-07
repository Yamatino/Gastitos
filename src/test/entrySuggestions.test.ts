import { describe, it, expect } from 'vitest'
import type { Category, Expense } from '../services/supabase'
import {
  buildDescriptionIndex,
  categoryForDescription,
  lastUsedCategoryId,
  orderCategoriesByUsage,
  suggestDescriptions,
} from '../lib/entrySuggestions'

let seq = 0
function tx(overrides: Partial<Expense>): Expense {
  return {
    id: `t${seq++}`,
    user_id: 'u1',
    description: 'x',
    amount_cents: 1000,
    currency: 'ARS',
    exchange_rate: 1000,
    usd_amount_cents: 1,
    category_id: 'super',
    payment_method: 'debit',
    is_installment: false,
    installment_group_id: null,
    installment_number: null,
    total_installments: null,
    installment_amount_cents: null,
    date: '2026-10-01',
    status: 'paid',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '',
    transaction_type: 'expense',
    is_salary: false,
    ...overrides,
  }
}

const cat = (id: string, name: string): Category => ({ id, user_id: 'u1', name, icon: '📦', color: '#000000', is_default: false, created_at: '' })

describe('description suggestions', () => {
  const expenses = [
    tx({ description: 'Coto', category_id: 'super', date: '2026-09-01' }),
    tx({ description: 'coto', category_id: 'super', date: '2026-09-15' }),
    tx({ description: 'Coto', category_id: 'salida', date: '2026-10-02' }), // most recent: wins
    tx({ description: 'Carrefour Express', category_id: 'super', date: '2026-10-01' }),
    tx({ description: 'Escoto bar', category_id: 'salida', date: '2026-08-01' }),
    tx({ description: 'Notebook (3/12)', category_id: 'tech', is_installment: true }),
    tx({ description: 'Sueldo', transaction_type: 'income', category_id: null }),
  ]
  const index = buildDescriptionIndex(expenses, 'expense')

  it('suggests prefix matches before substring matches, without repeating the exact text', () => {
    expect(suggestDescriptions(index, 'co').map((s) => s.description)).toEqual(['Coto', 'Escoto bar'])
    expect(suggestDescriptions(index, 'coto').map((s) => s.description)).toEqual(['Escoto bar'])
  })

  it('needs at least two characters', () => {
    expect(suggestDescriptions(index, 'c')).toEqual([])
  })

  it('strips the installment suffix and keeps transaction types apart', () => {
    expect(suggestDescriptions(index, 'note').map((s) => s.description)).toEqual(['Notebook'])
    expect(suggestDescriptions(index, 'suel')).toEqual([])
  })

  it('remembers the category most recently used with a description', () => {
    expect(categoryForDescription(index, '  COTO ')).toBe('salida')
    expect(categoryForDescription(index, 'nunca visto')).toBeNull()
  })
})

describe('category ordering and last used', () => {
  const categories = [cat('a', 'Auto'), cat('super', 'Supermercado'), cat('salida', 'Salida')]
  const today = new Date(2026, 9, 10)

  it('orders by recent usage, counting an installment plan once', () => {
    const ordered = orderCategoriesByUsage(
      categories,
      [
        tx({ category_id: 'salida', date: '2026-10-01' }),
        tx({ category_id: 'super', date: '2026-10-02' }),
        tx({ category_id: 'super', date: '2026-10-03' }),
        tx({ category_id: 'super', date: '2026-10-04' }),
        tx({ category_id: 'a', date: '2026-01-01' }), // outside the 90-day window
        // 3 rows of one plan: counts as 1, so Salida has 2 (not 4) and stays behind Supermercado's 3
        ...[1, 2, 3].map((n) => tx({ category_id: 'salida', is_installment: true, installment_number: n, date: '2026-10-05' })),
      ],
      today
    )
    expect(ordered.map((c) => c.id)).toEqual(['super', 'salida', 'a'])
  })

  it('returns the category of the most recently created expense, if it still exists', () => {
    const expenses = [
      tx({ category_id: 'super', created_at: '2026-10-01T10:00:00Z' }),
      tx({ category_id: 'salida', created_at: '2026-10-03T10:00:00Z' }),
    ]
    expect(lastUsedCategoryId(expenses, categories)).toBe('salida')
    expect(lastUsedCategoryId(expenses, [cat('super', 'Supermercado')])).toBeNull()
  })
})
