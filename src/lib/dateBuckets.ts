import { addMonths, format, isSameMonth, isSameYear, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

/** Parses an Expense.date ('YYYY-MM-DD') as local noon to avoid UTC day-shift. */
export function parseExpenseDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`)
}

export type MonthBucket = {
  key: string
  label: string
  monthStart: Date
}

function toBucket(monthStart: Date): MonthBucket {
  return {
    key: format(monthStart, 'yyyy-MM'),
    label: format(monthStart, 'MMM', { locale: es }),
    monthStart,
  }
}

/** Returns `count` consecutive month buckets ending at endDate's month (inclusive), oldest first. */
export function getTrailingMonths(count: number, endDate: Date = new Date()): MonthBucket[] {
  const end = startOfMonth(endDate)
  const buckets: MonthBucket[] = []
  for (let i = count - 1; i >= 0; i--) {
    buckets.push(toBucket(addMonths(end, -i)))
  }
  return buckets
}

/** Returns `count` consecutive month buckets starting at startDate's month, going forward. */
export function getUpcomingMonths(count: number, startDate: Date = new Date()): MonthBucket[] {
  const start = startOfMonth(startDate)
  const buckets: MonthBucket[] = []
  for (let i = 0; i < count; i++) {
    buckets.push(toBucket(addMonths(start, i)))
  }
  return buckets
}

/** True if `date` falls in the same calendar month+year as `monthStart`. */
export function isInMonth(date: Date, monthStart: Date): boolean {
  return isSameMonth(date, monthStart) && isSameYear(date, monthStart)
}

/** Sums a numeric value for items whose date falls in monthStart's month. */
export function sumInMonth<T>(
  items: T[],
  getDate: (item: T) => string,
  monthStart: Date,
  getValue: (item: T) => number
): number {
  return items.reduce((sum, item) => {
    if (isInMonth(parseExpenseDate(getDate(item)), monthStart)) {
      return sum + getValue(item)
    }
    return sum
  }, 0)
}
