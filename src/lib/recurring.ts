// Recurring transactions ("gastos fijos"): monthly templates the user confirms
// with one tap. Nothing here writes to the database; it works out what's due
// and builds the row to insert.
import { format, getDaysInMonth, subMonths } from 'date-fns'
import type { Expense } from '../services/supabase'
import { toDateKey } from './dateBuckets'

export type RecurringTransaction = {
  id: string
  user_id: string
  description: string
  /** Positive, in cents of `currency` */
  amount_cents: number
  currency: 'ARS' | 'USD'
  transaction_type: 'expense' | 'income' | 'savings'
  category_id: string | null
  payment_method: 'debit' | 'credit'
  is_salary: boolean
  day_of_month: number
  /** First month it applies to, 'YYYY-MM' */
  start_period: string
  skipped_periods: string[]
  active: boolean
  created_at: string
}

export type PendingRecurring = {
  recurring: RecurringTransaction
  /** 'YYYY-MM' */
  period: string
  /** 'YYYY-MM-DD' */
  dueDate: string
  isOverdue: boolean
}

// Unconfirmed months stay listed this far back, so a missed month isn't lost
// but an abandoned template doesn't pile up forever
const LOOKBACK_MONTHS = 2

export const toPeriod = (date: Date): string => format(date, 'yyyy-MM')

/** Due date in a period, clamping the day to short months (31 -> 30 Nov, 28/29 Feb). */
export function dueDateFor(period: string, dayOfMonth: number): string {
  const [year, month] = period.split('-').map(Number)
  const day = Math.min(dayOfMonth, getDaysInMonth(new Date(year, month - 1, 1)))
  return `${period}-${String(day).padStart(2, '0')}`
}

/** Months (oldest first) not yet confirmed or skipped for each active template, sorted by due date. */
export function getPendingRecurring(
  recurrings: RecurringTransaction[],
  expenses: Expense[],
  today: Date = new Date()
): PendingRecurring[] {
  const confirmed = new Set(
    expenses.filter((e) => e.recurring_id && e.recurring_period).map((e) => `${e.recurring_id}:${e.recurring_period}`)
  )
  const todayKey = toDateKey(today)
  const periods = Array.from({ length: LOOKBACK_MONTHS + 1 }, (_, i) => toPeriod(subMonths(today, LOOKBACK_MONTHS - i)))

  const pending: PendingRecurring[] = []
  for (const recurring of recurrings) {
    if (!recurring.active) continue
    for (const period of periods) {
      if (period < recurring.start_period) continue
      if (recurring.skipped_periods.includes(period)) continue
      if (confirmed.has(`${recurring.id}:${period}`)) continue
      const dueDate = dueDateFor(period, recurring.day_of_month)
      pending.push({ recurring, period, dueDate, isOverdue: dueDate < todayKey })
    }
  }
  return pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export type ConfirmedExpenseInput = Omit<Expense, 'id' | 'created_at' | 'updated_at'>

/**
 * The transaction to record when a pending month is confirmed. `amountCents`
 * is in the template's currency (possibly edited); USD is converted at `rate`.
 * Confirming early records it today; a late confirmation keeps the due date.
 */
export function buildConfirmedExpense(
  pending: PendingRecurring,
  amountCents: number,
  rate: number,
  userId: string,
  today: Date = new Date()
): ConfirmedExpenseInput {
  const { recurring, period, dueDate } = pending
  const todayKey = toDateKey(today)
  const isUsd = recurring.currency === 'USD'
  const arsCents = isUsd ? Math.round(amountCents * rate) : amountCents
  const usdCents = isUsd ? amountCents : Math.round(amountCents / rate)
  // Income is stored negative (see the check_amount_cents_sign constraint)
  const sign = recurring.transaction_type === 'income' ? -1 : 1

  return {
    user_id: userId,
    description: recurring.description,
    amount_cents: sign * arsCents,
    currency: 'ARS',
    exchange_rate: rate,
    usd_amount_cents: sign * usdCents,
    original_currency: isUsd ? 'USD' : undefined,
    original_amount_cents: isUsd ? amountCents : undefined,
    category_id: recurring.transaction_type === 'expense' ? recurring.category_id : null,
    payment_method: recurring.transaction_type === 'expense' ? recurring.payment_method : 'debit',
    date: dueDate > todayKey ? todayKey : dueDate,
    transaction_type: recurring.transaction_type,
    is_salary: recurring.transaction_type === 'income' && recurring.is_salary,
    is_installment: false,
    status: 'paid',
    installment_group_id: null,
    installment_number: null,
    total_installments: null,
    installment_amount_cents: null,
    recurring_id: recurring.id,
    recurring_period: period,
  }
}
