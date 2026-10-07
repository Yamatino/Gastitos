import type { Expense } from '../services/supabase'

export type TransactionFilters = {
  /** Empty = every type */
  types: Expense['transaction_type'][]
  /** Empty = every category */
  categoryIds: string[]
  payment: Expense['payment_method'] | null
  /** Inclusive bounds on the row's amount, in cents (sign ignored) */
  minCents: number | null
  maxCents: number | null
}

export const EMPTY_FILTERS: TransactionFilters = {
  types: [],
  categoryIds: [],
  payment: null,
  minCents: null,
  maxCents: null,
}

/** How many filter groups are in use (for the badge on the Filtros button). */
export function countActiveFilters(filters: TransactionFilters): number {
  return (
    (filters.types.length > 0 ? 1 : 0) +
    (filters.categoryIds.length > 0 ? 1 : 0) +
    (filters.payment ? 1 : 0) +
    (filters.minCents !== null || filters.maxCents !== null ? 1 : 0)
  )
}

export function matchesFilters(expense: Expense, filters: TransactionFilters): boolean {
  if (filters.types.length > 0 && !filters.types.includes(expense.transaction_type)) return false
  // Income and savings have no category, so a category filter leaves only expenses
  if (filters.categoryIds.length > 0 && (!expense.category_id || !filters.categoryIds.includes(expense.category_id))) return false
  if (filters.payment && expense.payment_method !== filters.payment) return false
  const amount = Math.abs(expense.amount_cents)
  if (filters.minCents !== null && amount < filters.minCents) return false
  if (filters.maxCents !== null && amount > filters.maxCents) return false
  return true
}
