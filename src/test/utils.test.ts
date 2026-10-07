import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, cn, toUsdCents } from '../lib/utils'

describe('Utility Functions', () => {
  describe('cn (className utilities)', () => {
    it('merges class names', () => {
      expect(cn('class1', 'class2')).toBe('class1 class2')
    })

    it('handles conditional classes', () => {
      const isVisible = true
      const isHidden = false
      expect(cn('base', isHidden && 'hidden', isVisible && 'visible')).toBe('base visible')
    })

    it('handles Tailwind conflicts', () => {
      // cn should resolve Tailwind conflicts by keeping the last one
      expect(cn('p-4', 'p-6')).toBe('p-6')
    })

    it('handles array inputs', () => {
      expect(cn(['class1', 'class2'])).toBe('class1 class2')
    })

    it('handles object inputs', () => {
      expect(cn({ active: true, disabled: false })).toBe('active')
    })
  })

  describe('formatCurrency', () => {
    it('drops ",00" only when asked and the amount has no cents', () => {
      expect(formatCurrency(85000000, 'ARS', true)).toBe('$\u00A0850.000')
      expect(formatCurrency(85000050, 'ARS', true)).toBe('$\u00A0850.000,50')
      expect(formatCurrency(85000000, 'ARS')).toBe('$\u00A0850.000,00')
    })

    it('formats ARS currency correctly', () => {
      // 10000 cents = 100 ARS
      // Note: Intl.NumberFormat adds non-breaking space (\u00A0) between symbol and number
      expect(formatCurrency(10000, 'ARS')).toBe('$\u00A0100,00')
    })

    it('formats USD currency correctly', () => {
      // 10000 cents = 100 USD
      expect(formatCurrency(10000, 'USD')).toBe('US$\u00A0100,00')
    })

    it('formats zero correctly', () => {
      expect(formatCurrency(0, 'ARS')).toBe('$\u00A00,00')
    })

    it('formats small amounts correctly', () => {
      // 150 cents = 1.50 ARS
      expect(formatCurrency(150, 'ARS')).toBe('$\u00A01,50')
    })

    it('formats large amounts correctly', () => {
      // 10000000 cents = 100,000 ARS
      expect(formatCurrency(10000000, 'ARS')).toBe('$\u00A0100.000,00')
    })

    it('defaults to ARS when currency not specified', () => {
      expect(formatCurrency(10000)).toBe('$\u00A0100,00')
    })

    it('handles decimal cents correctly', () => {
      // This tests edge cases with cents
      expect(formatCurrency(1, 'ARS')).toBe('$\u00A00,01')
      expect(formatCurrency(10, 'ARS')).toBe('$\u00A00,10')
      expect(formatCurrency(99, 'ARS')).toBe('$\u00A00,99')
      expect(formatCurrency(100, 'ARS')).toBe('$\u00A01,00')
    })
  })

  describe('formatDate', () => {
    it('formats Date object correctly', () => {
      // Use noon UTC to avoid timezone issues at midnight
      const date = new Date('2024-01-15T12:00:00Z')
      const formatted = formatDate(date)
      // Should be "15 ene 2024" in Spanish locale
      expect(formatted).toMatch(/15.*ene.*2024/)
    })

    it('formats date string correctly', () => {
      // Use noon UTC to avoid timezone issues
      const formatted = formatDate('2024-01-15T12:00:00Z')
      expect(formatted).toMatch(/15.*ene.*2024/)
    })

    it('formats ISO date string correctly', () => {
      const formatted = formatDate('2024-01-15T10:30:00.000Z')
      // Should be around Jan 15, depending on timezone
      expect(formatted).toMatch(/\d{1,2}.*(ene|ene\.).*2024/)
    })

    it('handles end of month dates', () => {
      // Use noon UTC to avoid timezone issues
      const formatted = formatDate('2024-12-31T12:00:00Z')
      expect(formatted).toMatch(/31.*dic.*2024/)
    })

    it('handles leap year dates', () => {
      // Use noon UTC to avoid timezone issues
      const formatted = formatDate('2024-02-29T12:00:00Z')
      expect(formatted).toMatch(/29.*feb.*2024/)
    })
  })

  describe('toUsdCents', () => {
    const today = '2026-10-07'
    const row = { amount_cents: 150000_00, usd_amount_cents: 150_00, exchange_rate: 1000, date: '2026-01-10' }

    it('uses the USD amount stored when the transaction happened', () => {
      expect(toUsdCents(row, 1500, today)).toBe(150_00)
    })

    it('ignores the sign of stored income amounts', () => {
      expect(toUsdCents({ ...row, amount_cents: -150000_00, usd_amount_cents: -150_00 }, 1500, today)).toBe(150_00)
    })

    it('falls back to the row rate, then the current rate, when USD was not stored', () => {
      expect(toUsdCents({ ...row, usd_amount_cents: null }, 1500, today)).toBe(150_00)
      expect(toUsdCents({ ...row, usd_amount_cents: null, exchange_rate: null }, 1500, today)).toBe(100_00)
    })

    it('uses the current rate for future-dated rows', () => {
      expect(toUsdCents({ ...row, date: '2026-11-10' }, 1500, today)).toBe(100_00)
    })
  })
})
