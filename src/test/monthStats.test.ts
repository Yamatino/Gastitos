import { describe, it, expect } from 'vitest'
import type { Category, Expense } from '../services/supabase'
import { categorySpendWithChange, percentChange, summarizeMonth } from '../lib/monthStats'

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
    category_id: 'c1',
    payment_method: 'debit',
    is_installment: false,
    installment_group_id: null,
    installment_number: null,
    total_installments: null,
    installment_amount_cents: null,
    date: '2026-10-01',
    status: 'paid',
    created_at: '',
    updated_at: '',
    transaction_type: 'expense',
    is_salary: false,
    ...overrides,
  }
}

const ars = (e: Expense) => Math.abs(e.amount_cents)
const october = new Date(2026, 9, 1)
const today = new Date(2026, 9, 10, 15, 0) // Oct 10

describe('summarizeMonth', () => {
  it('totals the month by type', () => {
    const s = summarizeMonth(
      [
        tx({ amount_cents: 5000, date: '2026-10-02' }),
        tx({ amount_cents: -100000, transaction_type: 'income', date: '2026-10-01' }),
        tx({ amount_cents: 20000, transaction_type: 'savings', date: '2026-10-05' }),
        tx({ amount_cents: 7000, date: '2026-09-30' }), // other month
      ],
      october,
      ars,
      today
    )
    expect(s.spent).toBe(5000)
    expect(s.income).toBe(100000)
    expect(s.savings).toBe(20000)
    expect(s.isCurrentMonth).toBe(true)
  })

  it('compares the month in progress with the previous month up to the same day', () => {
    const s = summarizeMonth(
      [
        tx({ amount_cents: 3000, date: '2026-09-05' }),
        tx({ amount_cents: 2000, date: '2026-09-10' }),
        tx({ amount_cents: 9000, date: '2026-09-25' }), // after day 10: excluded
      ],
      october,
      ars,
      today
    )
    expect(s.previousSpent).toBe(5000)
  })

  it('compares a finished month with the whole previous month', () => {
    const s = summarizeMonth(
      [tx({ amount_cents: 3000, date: '2026-08-05' }), tx({ amount_cents: 9000, date: '2026-08-25' })],
      new Date(2026, 8, 1),
      ars,
      today
    )
    expect(s.previousSpent).toBe(12000)
    expect(s.projected).toBeNull()
  })

  it('projects everyday spending from the pace so far, adding known installments as-is', () => {
    const s = summarizeMonth(
      [
        tx({ amount_cents: 10000, date: '2026-10-03' }), // everyday: 10000 over 10 days
        tx({ amount_cents: 50000, date: '2026-10-15', is_installment: true }), // known, later this month
      ],
      october,
      ars,
      today
    )
    // 10000 / 10 days * 31 days + 50000
    expect(s.projected).toBe(31000 + 50000)
    // Daily average and the comparison figure only count what's happened so far
    expect(s.dailyAverage).toBe(1000)
    expect(s.spent).toBe(60000)
    expect(s.spentToDate).toBe(10000)
  })

  it('has no daily average or projection for future months', () => {
    const s = summarizeMonth([tx({ date: '2026-11-10', is_installment: true })], new Date(2026, 10, 1), ars, today)
    expect(s.isFutureMonth).toBe(true)
    expect(s.dailyAverage).toBeNull()
    expect(s.projected).toBeNull()
  })
})

describe('percentChange', () => {
  it('returns null without a previous value', () => {
    expect(percentChange(100, 0)).toBeNull()
    expect(percentChange(150, 100)).toBe(50)
  })
})

describe('categorySpendWithChange', () => {
  const categories: Category[] = [
    { id: 'c1', user_id: 'u1', name: 'Super', icon: '🛒', color: '#000000', is_default: false, created_at: '' },
    { id: 'c2', user_id: 'u1', name: 'Salida', icon: '🍻', color: '#111111', is_default: false, created_at: '' },
  ]

  it('returns each category total with its change vs the comparable previous period', () => {
    const result = categorySpendWithChange(
      [
        tx({ category_id: 'c1', amount_cents: 15000, date: '2026-10-04' }),
        tx({ category_id: 'c1', amount_cents: 10000, date: '2026-09-04' }),
        tx({ category_id: 'c2', amount_cents: 5000, date: '2026-10-06' }),
        tx({ category_id: 'c2', amount_cents: 8000, date: '2026-09-20' }), // after Sep 10: not comparable
      ],
      categories,
      october,
      ars,
      today
    )
    expect(result).toEqual([
      expect.objectContaining({ categoryId: 'c1', total: 15000, changePercent: 50 }),
      expect.objectContaining({ categoryId: 'c2', total: 5000, changePercent: null }),
    ])
  })
})
