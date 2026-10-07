import { describe, it, expect } from 'vitest'
import type { Expense } from '../services/supabase'
import { EMPTY_FILTERS, countActiveFilters, matchesFilters } from '../lib/transactionFilters'

function tx(overrides: Partial<Expense>): Expense {
  return {
    id: 't', user_id: 'u1', description: 'x', amount_cents: 10000, currency: 'ARS', exchange_rate: 1000,
    usd_amount_cents: 10, category_id: 'super', payment_method: 'debit', is_installment: false,
    installment_group_id: null, installment_number: null, total_installments: null, installment_amount_cents: null,
    date: '2026-10-01', status: 'paid', created_at: '', updated_at: '', transaction_type: 'expense', is_salary: false,
    ...overrides,
  }
}

describe('transaction filters', () => {
  it('lets everything through with no filters', () => {
    expect(matchesFilters(tx({}), EMPTY_FILTERS)).toBe(true)
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0)
  })

  it('filters by type, category and payment method', () => {
    const f = { ...EMPTY_FILTERS, types: ['expense' as const], categoryIds: ['super'], payment: 'credit' as const }
    expect(matchesFilters(tx({ payment_method: 'credit' }), f)).toBe(true)
    expect(matchesFilters(tx({ payment_method: 'debit' }), f)).toBe(false)
    expect(matchesFilters(tx({ payment_method: 'credit', category_id: 'salida' }), f)).toBe(false)
    expect(matchesFilters(tx({ payment_method: 'credit', transaction_type: 'savings' }), f)).toBe(false)
    expect(countActiveFilters(f)).toBe(3)
  })

  it('excludes uncategorized income when a category is selected', () => {
    const f = { ...EMPTY_FILTERS, categoryIds: ['super'] }
    expect(matchesFilters(tx({ transaction_type: 'income', category_id: null, amount_cents: -5000 }), f)).toBe(false)
  })

  it('compares amounts ignoring the sign, bounds inclusive', () => {
    const f = { ...EMPTY_FILTERS, minCents: 10000, maxCents: 20000 }
    expect(matchesFilters(tx({ amount_cents: 10000 }), f)).toBe(true)
    expect(matchesFilters(tx({ amount_cents: -20000, transaction_type: 'income' }), f)).toBe(true)
    expect(matchesFilters(tx({ amount_cents: 9999 }), f)).toBe(false)
    expect(matchesFilters(tx({ amount_cents: 20001 }), f)).toBe(false)
    expect(countActiveFilters(f)).toBe(1)
  })
})
