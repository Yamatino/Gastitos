import type { Expense } from '../services/supabase'
import { parseExpenseDate } from './dateBuckets'

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

/** Groups all installment rows (paid + pending) by installment_group_id. */
export function groupInstallments(expenses: Expense[], referenceDate: Date = new Date()): InstallmentGroup[] {
  const today = new Date(referenceDate)
  today.setHours(0, 0, 0, 0)

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

    // A row counts as paid if explicitly marked paid, or its date has already passed.
    const paidCount = sorted.filter((e) => {
      if (e.status === 'paid') return true
      return parseExpenseDate(e.date) < today
    }).length

    const firstPending = sorted.find((e) => e.status === 'pending')
    const currentNumber = firstPending?.installment_number || paidCount + 1

    const totalAmountCents = sorted.reduce((sum, e) => sum + e.amount_cents, 0)
    const pendingRows = sorted.filter((e) => e.status === 'pending')
    const remainingAmountCents = pendingRows.reduce((sum, e) => sum + e.amount_cents, 0)

    return {
      groupId,
      description: first.description.replace(/\s*\(\d+\/\d+\)$/, ''),
      categoryId: first.category_id,
      totalInstallments,
      paidCount,
      // Based on actual DB status (not the date heuristic above), so a group with
      // overdue-but-still-'pending' rows never silently disappears from the active list.
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
