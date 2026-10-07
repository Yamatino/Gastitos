import { describe, it, expect } from 'vitest'
import type { Expense } from '../services/supabase'
import { getActiveInstallmentGroups, groupInstallments, isInstallmentPending } from '../lib/installments'

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
        makeInstallment({ id: '2', installment_number: 2, status: 'pending', date: '2026-08-20' }),
        makeInstallment({ id: '3', installment_number: 3, status: 'pending', date: '2026-09-20' }),
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

  it('treats a still-pending row as paid once its billing date has passed', () => {
    // Nothing in the app ever marks installments 'paid' (cards charge them automatically),
    // so relying on status alone kept finished plans "active" and in the debt total forever.
    const expenses = [
      makeInstallment({ id: '1', installment_group_id: 'g1', installment_number: 1, status: 'pending', date: '2026-06-01' }),
      makeInstallment({ id: '2', installment_group_id: 'g1', installment_number: 2, status: 'pending', date: '2026-07-01' }),
      makeInstallment({ id: '3', installment_group_id: 'g1', installment_number: 3, status: 'pending', date: '2026-07-15' }),
    ]

    const groups = groupInstallments(expenses, referenceDate)
    expect(groups[0].paidCount).toBe(3)
    expect(groups[0].remainingCount).toBe(0)
    expect(groups[0].remainingAmountCents).toBe(0)
    expect(getActiveInstallmentGroups(expenses, referenceDate)).toHaveLength(0)
  })

  it('isInstallmentPending keeps a row billed today as pending', () => {
    expect(isInstallmentPending(makeInstallment({ date: '2026-08-15' }), referenceDate)).toBe(true)
    expect(isInstallmentPending(makeInstallment({ date: '2026-08-14' }), referenceDate)).toBe(false)
    expect(isInstallmentPending(makeInstallment({ date: '2026-09-01', status: 'paid' }), referenceDate)).toBe(false)
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
