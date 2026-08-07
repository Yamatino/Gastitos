import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = "ARS"): string {
  const formatter = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
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
