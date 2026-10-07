import type { Expense } from '../services/supabase'
import { toDateKey } from './dateBuckets'

export type InstallmentGroup = {
  groupId: string
  description: string
  categoryId: string | null
  totalInstallments: number
  paidCount: number
  remainingCount: number
  currentNumber: number
  totalAmountCents: number
  remainingAmountCents: number
}

/**
 * True while an installment is still owed. Card installments are charged
 * automatically and nothing in the app ever flips status to 'paid', so the
 * billing date is the source of truth: once it has passed, the row is paid.
 * An explicit 'paid' status still wins.
 */
export function isInstallmentPending(expense: Expense, referenceDate: Date = new Date()): boolean {
  return expense.is_installment && expense.status === 'pending' && expense.date >= toDateKey(referenceDate)
}

/** Groups all installment rows (paid + pending) by installment_group_id. */
export function groupInstallments(expenses: Expense[], referenceDate: Date = new Date()): InstallmentGroup[] {
  const grouped = new Map<string, Expense[]>()
  expenses
    .filter((e) => e.is_installment && e.installment_group_id)
    .forEach((e) => {
      const groupId = e.installment_group_id as string
      if (!grouped.has(groupId)) grouped.set(groupId, [])
      grouped.get(groupId)!.push(e)
    })

  return Array.from(grouped.entries()).map(([groupId, items]) => {
    const sorted = [...items].sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0))
    const first = sorted[0]
    const totalInstallments = first.total_installments || sorted.length

    const pendingRows = sorted.filter((e) => isInstallmentPending(e, referenceDate))
    const paidCount = sorted.length - pendingRows.length
    const currentNumber = pendingRows[0]?.installment_number || paidCount + 1

    const totalAmountCents = sorted.reduce((sum, e) => sum + e.amount_cents, 0)
    const remainingAmountCents = pendingRows.reduce((sum, e) => sum + e.amount_cents, 0)

    return {
      groupId,
      description: first.description.replace(/\s*\(\d+\/\d+\)$/, ''),
      categoryId: first.category_id,
      totalInstallments,
      paidCount,
      remainingCount: pendingRows.length,
      currentNumber,
      totalAmountCents,
      remainingAmountCents,
    }
  })
}

/** Convenience: only groups that still have pending installments. */
export function getActiveInstallmentGroups(expenses: Expense[], referenceDate?: Date): InstallmentGroup[] {
  return groupInstallments(expenses, referenceDate).filter((g) => g.remainingCount > 0)
}
