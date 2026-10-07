import { describe, it, expect } from 'vitest'
import type { Expense } from '../services/supabase'
import { buildConfirmedExpense, dueDateFor, getPendingRecurring, type RecurringTransaction } from '../lib/recurring'

function template(overrides: Partial<RecurringTransaction>): RecurringTransaction {
  return {
    id: 'r1', user_id: 'u1', description: 'Netflix', amount_cents: 850000, currency: 'ARS',
    transaction_type: 'expense', category_id: 'ocio', payment_method: 'credit', is_salary: false,
    day_of_month: 15, start_period: '2026-01', skipped_periods: [], active: true, created_at: '',
    ...overrides,
  }
}

const confirmedRow = (recurringId: string, period: string) =>
  ({ id: `${recurringId}-${period}`, recurring_id: recurringId, recurring_period: period }) as Expense

const today = new Date(2026, 9, 10) // Oct 10, 2026

describe('dueDateFor', () => {
  it('clamps the day to short months', () => {
    expect(dueDateFor('2026-11', 31)).toBe('2026-11-30')
    expect(dueDateFor('2026-02', 30)).toBe('2026-02-28')
    expect(dueDateFor('2026-10', 5)).toBe('2026-10-05')
  })
})

describe('getPendingRecurring', () => {
  it('lists unconfirmed months from two months back through this month, oldest first', () => {
    const pending = getPendingRecurring([template({})], [confirmedRow('r1', '2026-09')], today)
    expect(pending.map((p) => [p.period, p.dueDate, p.isOverdue])).toEqual([
      ['2026-08', '2026-08-15', true],
      ['2026-10', '2026-10-15', false],
    ])
  })

  it('skips paused templates, skipped months and months before the start', () => {
    const pending = getPendingRecurring(
      [
        template({ id: 'paused', active: false }),
        template({ id: 'skipper', skipped_periods: ['2026-08', '2026-09'] }),
        template({ id: 'new', start_period: '2026-10', day_of_month: 3 }),
      ],
      [],
      today
    )
    expect(pending.map((p) => `${p.recurring.id}:${p.period}`)).toEqual(['new:2026-10', 'skipper:2026-10'])
    expect(pending[0].isOverdue).toBe(true) // Oct 3 already passed
  })
})

describe('buildConfirmedExpense', () => {
  it('records an early confirmation today and a late one on its due date', () => {
    const early = buildConfirmedExpense({ recurring: template({}), period: '2026-10', dueDate: '2026-10-15', isOverdue: false }, 850000, 1400, 'u1', today)
    expect(early.date).toBe('2026-10-10')

    const late = buildConfirmedExpense({ recurring: template({}), period: '2026-09', dueDate: '2026-09-15', isOverdue: true }, 850000, 1400, 'u1', today)
    expect(late.date).toBe('2026-09-15')
    expect(late).toMatchObject({ recurring_id: 'r1', recurring_period: '2026-09', category_id: 'ocio', payment_method: 'credit' })
  })

  it('converts USD templates at the given rate and keeps the original amount', () => {
    const row = buildConfirmedExpense(
      { recurring: template({ currency: 'USD', amount_cents: 1099 }), period: '2026-10', dueDate: '2026-10-15', isOverdue: false },
      1099,
      1400,
      'u1',
      today
    )
    expect(row).toMatchObject({
      amount_cents: 1538600,
      usd_amount_cents: 1099,
      original_currency: 'USD',
      original_amount_cents: 1099,
      exchange_rate: 1400,
    })
  })

  it('stores income as negative, without a category', () => {
    const row = buildConfirmedExpense(
      { recurring: template({ transaction_type: 'income', is_salary: true, category_id: 'x' }), period: '2026-10', dueDate: '2026-10-01', isOverdue: true },
      250000000,
      1400,
      'u1',
      today
    )
    expect(row).toMatchObject({ amount_cents: -250000000, transaction_type: 'income', is_salary: true, category_id: null })
    expect(row.usd_amount_cents).toBeLessThan(0)
  })
})
