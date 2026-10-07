// Helpers that make adding a transaction faster by learning from past entries:
// description suggestions, the category usually used with a description, and
// categories ordered by how often they're used.
import { subDays } from 'date-fns'
import type { Category, Expense } from '../services/supabase'
import { toDateKey } from './dateBuckets'

export type DescriptionSuggestion = {
  description: string
  categoryId: string | null
  count: number
}

type IndexEntry = DescriptionSuggestion & { lastDate: string }
export type DescriptionIndex = Map<string, IndexEntry>

const MIN_QUERY_LENGTH = 2
// Usage window for ordering categories, so old habits fade out
const CATEGORY_USAGE_DAYS = 90

/** Normalized lookup key: installment suffix "(3/12)" removed, trimmed, lowercase. */
export function descriptionKey(description: string): string {
  return description.replace(/\s*\(\d+\/\d+\)$/, '').trim().toLowerCase()
}

/**
 * Indexes past descriptions of one transaction type. Each entry keeps the most
 * recent spelling and category, since that's what the user would want reused.
 */
export function buildDescriptionIndex(expenses: Expense[], type: Expense['transaction_type']): DescriptionIndex {
  const index: DescriptionIndex = new Map()
  for (const e of expenses) {
    if (e.transaction_type !== type) continue
    const key = descriptionKey(e.description)
    if (!key) continue
    const existing = index.get(key)
    if (!existing) {
      index.set(key, {
        description: e.description.replace(/\s*\(\d+\/\d+\)$/, '').trim(),
        categoryId: e.category_id,
        count: 1,
        lastDate: e.date,
      })
      continue
    }
    existing.count++
    if (e.date > existing.lastDate) {
      existing.lastDate = e.date
      existing.categoryId = e.category_id
      existing.description = e.description.replace(/\s*\(\d+\/\d+\)$/, '').trim()
    }
  }
  return index
}

/** Past descriptions containing the query: prefix matches first, then most used, then most recent. */
export function suggestDescriptions(index: DescriptionIndex, query: string, limit = 4): DescriptionSuggestion[] {
  const q = query.trim().toLowerCase()
  if (q.length < MIN_QUERY_LENGTH) return []

  return Array.from(index.entries())
    .filter(([key]) => key.includes(q) && key !== q)
    .sort(([keyA, a], [keyB, b]) => {
      const prefixA = keyA.startsWith(q) ? 0 : 1
      const prefixB = keyB.startsWith(q) ? 0 : 1
      return prefixA - prefixB || b.count - a.count || b.lastDate.localeCompare(a.lastDate)
    })
    .slice(0, limit)
    .map(([, { description, categoryId, count }]) => ({ description, categoryId, count }))
}

/** The category last used with exactly this description, if any. */
export function categoryForDescription(index: DescriptionIndex, description: string): string | null {
  return index.get(descriptionKey(description))?.categoryId ?? null
}

/** Categories ordered by use in the last 90 days (most used first), then by name. */
export function orderCategoriesByUsage(categories: Category[], expenses: Expense[], today: Date = new Date()): Category[] {
  const since = toDateKey(subDays(today, CATEGORY_USAGE_DAYS))
  const counts = new Map<string, number>()
  for (const e of expenses) {
    if (e.transaction_type !== 'expense' || !e.category_id || e.date < since) continue
    // An installment plan is one purchase, not one per month
    if (e.is_installment && e.installment_number !== 1) continue
    counts.set(e.category_id, (counts.get(e.category_id) || 0) + 1)
  }
  return [...categories].sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.name.localeCompare(b.name, 'es'))
}

/** Category of the most recently added expense, to preselect on a new one. */
export function lastUsedCategoryId(expenses: Expense[], categories: Category[]): string | null {
  let latest: Expense | null = null
  for (const e of expenses) {
    if (e.transaction_type !== 'expense' || !e.category_id) continue
    if (!latest || e.created_at > latest.created_at) latest = e
  }
  // Ignore a category that has since been deleted
  return latest && categories.some((c) => c.id === latest.category_id) ? latest.category_id : null
}
