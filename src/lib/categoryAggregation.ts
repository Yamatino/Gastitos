import { startOfMonth } from 'date-fns'
import type { Category, Expense } from '../services/supabase'
import { isInMonth, parseExpenseDate } from './dateBuckets'

export type CategorySpend = {
  categoryId: string
  name: string
  icon: string
  color: string
  totalCents: number
}

/** Sums amount_cents for expenses matching `predicate`, grouped by category, sorted desc. */
export function aggregateByCategory(
  expenses: Expense[],
  categories: Category[],
  predicate: (e: Expense) => boolean
): CategorySpend[] {
  const totals = new Map<string, number>()
  expenses.filter(predicate).forEach((e) => {
    if (!e.category_id) return
    totals.set(e.category_id, (totals.get(e.category_id) || 0) + e.amount_cents)
  })

  return Array.from(totals.entries())
    .map(([categoryId, totalCents]) => {
      const cat = categories.find((c) => c.id === categoryId)
      return {
        categoryId,
        name: cat?.name || 'Sin categoría',
        icon: cat?.icon || '📦',
        color: cat?.color || '#8884d8',
        totalCents,
      }
    })
    .sort((a, b) => b.totalCents - a.totalCents)
}

/** Current-month, expense-only spend per category (categoryId -> cents). */
export function getCurrentMonthExpenseByCategory(
  expenses: Expense[],
  categories: Category[],
  referenceDate: Date = new Date()
): Map<string, number> {
  const monthStart = startOfMonth(referenceDate)
  const breakdown = aggregateByCategory(
    expenses,
    categories,
    (e) => e.transaction_type === 'expense' && isInMonth(parseExpenseDate(e.date), monthStart)
  )
  return new Map(breakdown.map((c) => [c.categoryId, c.totalCents]))
}
