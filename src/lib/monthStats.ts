import { getDaysInMonth, isAfter, startOfMonth, subMonths } from 'date-fns'
import type { Category, Expense } from '../services/supabase'
import { aggregateByCategory } from './categoryAggregation'
import { isInMonth, parseExpenseDate, toDateKey } from './dateBuckets'

/** What to sum for each transaction: ARS cents, or USD cents at its own rate. */
export type Valuer = (e: Expense) => number

// Projections before this many days are mostly noise
const MIN_DAYS_FOR_PROJECTION = 3

export type MonthSummary = {
  isCurrentMonth: boolean
  isFutureMonth: boolean
  /** All of the month's expenses, including installments billed later this month */
  spent: number
  /** Expenses up to today (the whole month once it's over); compare this with previousSpent */
  spentToDate: number
  income: number
  savings: number
  /**
   * Previous month's spending to compare against. For the month in progress
   * it only counts up to the same day, so a half-finished month isn't
   * compared to a whole one.
   */
  previousSpent: number
  /** Spending to date divided by days elapsed; null for future months */
  dailyAverage: number | null
  /** Expected month-end spending; only for the current month, after a few days */
  projected: number | null
}

const sum = (list: Expense[], value: Valuer) => list.reduce((acc, e) => acc + value(e), 0)

function expensesIn(expenses: Expense[], monthStart: Date, type: Expense['transaction_type']) {
  return expenses.filter((e) => e.transaction_type === type && isInMonth(parseExpenseDate(e.date), monthStart))
}

/** Previous month's expenses, cut at today's day-of-month when `monthStart` is the current month. */
function comparablePrevious(expenses: Expense[], monthStart: Date, today: Date): Expense[] {
  const previous = expensesIn(expenses, subMonths(monthStart, 1), 'expense')
  if (!isInMonth(today, monthStart)) return previous
  return previous.filter((e) => parseExpenseDate(e.date).getDate() <= today.getDate())
}

export function summarizeMonth(
  expenses: Expense[],
  monthStart: Date,
  value: Valuer,
  today: Date = new Date()
): MonthSummary {
  const monthExpenses = expensesIn(expenses, monthStart, 'expense')
  const isCurrentMonth = isInMonth(today, monthStart)
  const isFutureMonth = isAfter(monthStart, startOfMonth(today))
  const daysInMonth = getDaysInMonth(monthStart)
  const todayKey = toDateKey(today)

  let dailyAverage: number | null = null
  let projected: number | null = null

  if (isCurrentMonth) {
    const daysElapsed = today.getDate()
    const toDate = monthExpenses.filter((e) => e.date <= todayKey)
    dailyAverage = sum(toDate, value) / daysElapsed

    if (daysElapsed >= MIN_DAYS_FOR_PROJECTION) {
      // Installments and future-dated entries are already known for the whole
      // month; only everyday spending is extrapolated from the pace so far
      const known = monthExpenses.filter((e) => e.is_installment || e.date > todayKey)
      const variable = monthExpenses.filter((e) => !e.is_installment && e.date <= todayKey)
      projected = (sum(variable, value) / daysElapsed) * daysInMonth + sum(known, value)
    }
  } else if (!isFutureMonth) {
    dailyAverage = sum(monthExpenses, value) / daysInMonth
  }

  return {
    isCurrentMonth,
    isFutureMonth,
    spent: sum(monthExpenses, value),
    spentToDate: isCurrentMonth ? sum(monthExpenses.filter((e) => e.date <= todayKey), value) : sum(monthExpenses, value),
    income: sum(expensesIn(expenses, monthStart, 'income'), value),
    savings: sum(expensesIn(expenses, monthStart, 'savings'), value),
    previousSpent: sum(comparablePrevious(expenses, monthStart, today), value),
    dailyAverage,
    projected,
  }
}

/** Percentage change, or null when there's nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

export type CategoryMonthSpend = {
  categoryId: string
  name: string
  icon: string
  color: string
  total: number
  /** vs the comparable previous period (see summarizeMonth); null if no previous spend */
  changePercent: number | null
}

/** Spending per category in the month, with the change vs the previous month. */
export function categorySpendWithChange(
  expenses: Expense[],
  categories: Category[],
  monthStart: Date,
  value: Valuer,
  today: Date = new Date()
): CategoryMonthSpend[] {
  const todayKey = toDateKey(today)
  const inMonth = (e: Expense) => e.transaction_type === 'expense' && isInMonth(parseExpenseDate(e.date), monthStart)
  const totalsOf = (predicate: (e: Expense) => boolean) =>
    new Map(aggregateByCategory(expenses, categories, predicate, value).map((c) => [c.categoryId, c.totalCents]))

  const current = aggregateByCategory(expenses, categories, inMonth, value)
  // Like summarizeMonth: the change compares spending so far with the previous month up to the same day
  const currentToDate = totalsOf((e) => inMonth(e) && e.date <= todayKey)
  const previousIds = new Set(comparablePrevious(expenses, monthStart, today).map((e) => e.id))
  const previous = totalsOf((e) => previousIds.has(e.id))

  return current.map((c) => ({
    categoryId: c.categoryId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    total: c.totalCents,
    changePercent: percentChange(currentToDate.get(c.categoryId) || 0, previous.get(c.categoryId) || 0),
  }))
}
