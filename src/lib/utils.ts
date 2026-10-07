import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formats cents. hideZeroCents drops a ",00" ending (used where space is tight). */
export function formatCurrency(amount: number, currency: string = "ARS", hideZeroCents: boolean = false): string {
  const formatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: hideZeroCents && amount % 100 === 0 ? 0 : 2,
  })
  return formatter.format(amount / 100)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date))
}

/** Converts a cents amount to the currently displayed currency using the live exchange rate. */
export function toDisplayCurrency(
  amountCents: number,
  showUsd: boolean,
  exchangeRate: number
): { amount: number; currency: "ARS" | "USD" } {
  return showUsd
    ? { amount: Math.round(amountCents / exchangeRate), currency: "USD" }
    : { amount: amountCents, currency: "ARS" }
}

/**
 * USD cents for a transaction at the rate of the day it happened (stored on the row),
 * so past months don't shift every time the peso moves. Future-dated rows (upcoming
 * installments) use today's rate, since their real rate isn't known yet.
 */
export function toUsdCents(
  expense: { amount_cents: number; usd_amount_cents: number | null; exchange_rate: number | null; date: string },
  currentRate: number,
  todayKey: string
): number {
  const arsCents = Math.abs(expense.amount_cents)
  if (expense.date > todayKey) return Math.round(arsCents / currentRate)
  if (expense.usd_amount_cents != null) return Math.abs(expense.usd_amount_cents)
  if (expense.exchange_rate && expense.exchange_rate > 0) return Math.round(arsCents / expense.exchange_rate)
  return Math.round(arsCents / currentRate)
}

/** Amount inputs take whole units with thousands dots: "1234567" -> "1.234.567". */
export function formatAmountInput(text: string): string {
  return text.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Reads an amount input back as whole units ("1.234.567" -> 1234567; empty -> 0). */
export function parseAmountInput(text: string): number {
  return parseInt(text.replace(/\D/g, '')) || 0
}
