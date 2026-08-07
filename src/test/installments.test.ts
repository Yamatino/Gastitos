import { describe, it, expect } from 'vitest'
import type { Expense } from '../services/supabase'
import { getActiveInstallmentGroups, groupInstallments } from '../lib/installments'

function makeInstallment(overrides: Partial<Expense>): Expense {
  return {
    id: overrides.id || 'exp-1',
    user_id: 'user-1',
    description: 'Notebook (1/3)',
    amount_cents: 10000,
    currency: 'ARS',
    exchange_rate: 1000,
    usd_amount_cents: 10,
    category_id: 'cat-1',
    payment_method: 'credit',
    is_installment: true,
    installment_group_id: 'group-1',
    installment_number: 1,
    total_installments: 3,
    installment_amount_cents: 10000,
    date: '2026-08-01',
    status: 'pending',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    transaction_type: 'expense',
    is_salary: false,
    ...overrides,
  }
}

describe('installments', () => {
  const referenceDate = new Date(2026, 7, 15) // Aug 15, 2026

  it('counts a row as paid when status is paid', () => {
    const groups = groupInstallments(
      [makeInstallment({ id: '1', installment_number: 1, status: 'paid', date: '2026-06-01' })],
      referenceDate
    )
    expect(groups[0].paidCount).toBe(1)
  })

  it('counts a row as paid when its date has passed, even if still pending', () => {
    const groups = groupInstallments(
      [makeInstallment({ id: '1', installment_number: 1, status: 'pending', date: '2026-06-01' })],
      referenceDate
    )
    expect(groups[0].paidCount).toBe(1)
  })

  it('does not count a future-dated pending row as paid', () => {
    const groups = groupInstallments(
      [makeInstallment({ id: '1', installment_number: 1, status: 'pending', date: '2026-09-01' })],
      referenceDate
    )
    expect(groups[0].paidCount).toBe(0)
  })

  it('currentNumber is the first pending installment number', () => {
    const groups = groupInstallments(
      [
        makeInstallment({ id: '1', installment_number: 1, status: 'paid', date: '2026-06-01' }),
        makeInstallment({ id: '2', installment_number: 2, status: 'pending', date: '2026-07-01' }),
        makeInstallment({ id: '3', installment_number: 3, status: 'pending', date: '2026-08-01' }),
      ],
      referenceDate
    )
    expect(groups[0].currentNumber).toBe(2)
  })

  it('falls back to paidCount + 1 when there is no pending row', () => {
    const groups = groupInstallments(
      [
        makeInstallment({ id: '1', installment_number: 1, status: 'paid', date: '2026-06-01' }),
        makeInstallment({ id: '2', installment_number: 2, status: 'paid', date: '2026-07-01' }),
      ],
      referenceDate
    )
    expect(groups[0].currentNumber).toBe(3)
  })

  it('strips the trailing "(n/m)" suffix from the description', () => {
    const groups = groupInstallments(
      [makeInstallment({ id: '1', description: 'Notebook (1/3)' })],
      referenceDate
    )
    expect(groups[0].description).toBe('Notebook')
  })

  it('getActiveInstallmentGroups excludes fully-paid groups', () => {
    const paidOff = groupInstallments(
      [
        makeInstallment({ id: '1', installment_group_id: 'g1', installment_number: 1, status: 'paid', date: '2026-06-01', total_installments: 1 }),
      ],
      referenceDate
    )
    expect(paidOff[0].remainingCount).toBe(0)

    const active = getActiveInstallmentGroups(
      [
        makeInstallment({ id: '1', installment_group_id: 'g1', installment_number: 1, status: 'paid', date: '2026-06-01', total_installments: 1 }),
        makeInstallment({ id: '2', installment_group_id: 'g2', installment_number: 1, status: 'pending', date: '2026-09-01', total_installments: 2 }),
      ],
      referenceDate
    )
    expect(active).toHaveLength(1)
    expect(active[0].groupId).toBe('g2')
  })

  it('getActiveInstallmentGroups still includes a group whose pending rows are all overdue', () => {
    // All 3 installments are dated in the past, but the last one was never marked 'paid' in
    // the DB. The date heuristic alone would push paidCount to 3/3 and hide this group even
    // though it still owes money (regression: Resumen's "Cuotas en Progreso" undercounted vs.
    // Dashboard's simpler status==='pending' count).
    const expenses = [
      makeInstallment({ id: '1', installment_group_id: 'g1', installment_number: 1, status: 'paid', date: '2026-06-01' }),
      makeInstallment({ id: '2', installment_group_id: 'g1', installment_number: 2, status: 'paid', date: '2026-07-01' }),
      makeInstallment({ id: '3', installment_group_id: 'g1', installment_number: 3, status: 'pending', date: '2026-07-15' }),
    ]

    const active = getActiveInstallmentGroups(expenses, referenceDate)
    expect(active).toHaveLength(1)
    expect(active[0].groupId).toBe('g1')
    expect(active[0].remainingCount).toBe(1)
    expect(active[0].remainingAmountCents).toBe(10000)
    expect(active[0].currentNumber).toBe(3)
  })

  it('remainingAmountCents sums only pending rows', () => {
    const groups = groupInstallments(
      [
        makeInstallment({ id: '1', installment_number: 1, status: 'paid', date: '2026-06-01', amount_cents: 5000 }),
        makeInstallment({ id: '2', installment_number: 2, status: 'pending', date: '2026-09-01', amount_cents: 7000 }),
      ],
      referenceDate
    )
    expect(groups[0].remainingAmountCents).toBe(7000)
    expect(groups[0].totalAmountCents).toBe(12000)
  })
})
