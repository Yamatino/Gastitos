import { describe, it, expect } from 'vitest'
import { getTrailingMonths, getUpcomingMonths, isInMonth, parseExpenseDate, sumInMonth } from '../lib/dateBuckets'

describe('dateBuckets', () => {
  describe('parseExpenseDate', () => {
    it('parses a YYYY-MM-DD string as local noon', () => {
      const d = parseExpenseDate('2026-03-15')
      expect(d.getFullYear()).toBe(2026)
      expect(d.getMonth()).toBe(2)
      expect(d.getDate()).toBe(15)
    })
  })

  describe('getTrailingMonths', () => {
    it('returns count months ending at endDate inclusive, oldest first', () => {
      const buckets = getTrailingMonths(6, new Date(2026, 7, 7)) // Aug 2026
      expect(buckets).toHaveLength(6)
      expect(buckets[5].monthStart.getMonth()).toBe(7) // August
      expect(buckets[0].monthStart.getMonth()).toBe(2) // March
      expect(buckets[5].monthStart.getFullYear()).toBe(2026)
    })

    it('handles year rollover backward', () => {
      const buckets = getTrailingMonths(3, new Date(2026, 1, 1)) // Feb 2026
      expect(buckets.map((b) => `${b.monthStart.getFullYear()}-${b.monthStart.getMonth()}`)).toEqual([
        '2025-11', // Dec 2025
        '2026-0', // Jan 2026
        '2026-1', // Feb 2026
      ])
    })
  })

  describe('getUpcomingMonths', () => {
    it('returns count months starting at startDate forward', () => {
      const buckets = getUpcomingMonths(3, new Date(2026, 10, 15)) // Nov 2026
      expect(buckets).toHaveLength(3)
      expect(buckets[0].monthStart.getMonth()).toBe(10) // Nov
      expect(buckets[1].monthStart.getMonth()).toBe(11) // Dec
      expect(buckets[2].monthStart.getMonth()).toBe(0) // Jan (rollover)
      expect(buckets[2].monthStart.getFullYear()).toBe(2027)
    })
  })

  describe('isInMonth', () => {
    it('matches same month and year', () => {
      expect(isInMonth(new Date(2026, 4, 20), new Date(2026, 4, 1))).toBe(true)
      expect(isInMonth(new Date(2026, 4, 20), new Date(2026, 5, 1))).toBe(false)
      expect(isInMonth(new Date(2025, 4, 20), new Date(2026, 4, 1))).toBe(false)
    })
  })

  describe('sumInMonth', () => {
    it('sums values for items whose date falls in the given month', () => {
      const items = [
        { date: '2026-08-01', amount: 100 },
        { date: '2026-08-15', amount: 200 },
        { date: '2026-09-01', amount: 300 },
      ]
      const total = sumInMonth(items, (i) => i.date, new Date(2026, 7, 1), (i) => i.amount)
      expect(total).toBe(300)
    })
  })
})
