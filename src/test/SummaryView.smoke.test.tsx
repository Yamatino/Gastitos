import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { addMonths, format, subMonths } from 'date-fns'
import { render } from './test-utils'
import { SummaryView } from '../components/SummaryView'
import { useDataStore } from '../stores/dataStore'
import { useUserStore } from '../stores/userStore'
import type { Category, Expense } from '../services/supabase'

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    })),
  },
}))

const categories: Category[] = [
  { id: 'cat-food', user_id: 'u1', name: 'Comida', icon: '🍔', color: '#ff6b6b', is_default: true, created_at: '' },
  { id: 'cat-transport', user_id: 'u1', name: 'Transporte', icon: '🚌', color: '#4dabf7', is_default: true, created_at: '' },
]

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: overrides.id || Math.random().toString(),
    user_id: 'user-1',
    description: 'Test',
    amount_cents: 1000,
    currency: 'ARS',
    exchange_rate: 1000,
    usd_amount_cents: 1,
    category_id: 'cat-food',
    payment_method: 'debit',
    is_installment: false,
    installment_group_id: null,
    installment_number: null,
    total_installments: null,
    installment_amount_cents: null,
    date: format(new Date(), 'yyyy-MM-dd'),
    status: 'paid',
    created_at: '',
    updated_at: '',
    transaction_type: 'expense',
    is_salary: false,
    ...overrides,
  }
}

function buildFixtures(): Expense[] {
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const sixMonthsAgo = format(subMonths(now, 6), 'yyyy-MM-dd')

  return [
    // Regular income and expenses this month
    makeExpense({ id: 'income-1', transaction_type: 'income', amount_cents: -500000, date: today }),
    makeExpense({ id: 'expense-1', transaction_type: 'expense', category_id: 'cat-food', amount_cents: 15000, date: today }),
    makeExpense({ id: 'expense-2', transaction_type: 'expense', category_id: 'cat-transport', amount_cents: 8000, date: today }),
    // A savings transfer — must NOT show up as an "expense" anywhere
    makeExpense({ id: 'savings-1', transaction_type: 'savings', category_id: 'cat-food', amount_cents: 900000, date: today }),
    // Expenses from 6 months ago for the purchasing-power card
    makeExpense({ id: 'old-1', transaction_type: 'expense', amount_cents: 20000, date: sixMonthsAgo }),
    // An installment plan crossing a year boundary: one paid, two pending (one lands next year)
    makeExpense({
      id: 'inst-1', description: 'Notebook (1/3)', is_installment: true, installment_group_id: 'grp-1',
      installment_number: 1, total_installments: 3, status: 'paid', amount_cents: 30000,
      date: format(subMonths(now, 1), 'yyyy-MM-dd'), transaction_type: 'expense',
    }),
    makeExpense({
      id: 'inst-2', description: 'Notebook (2/3)', is_installment: true, installment_group_id: 'grp-1',
      installment_number: 2, total_installments: 3, status: 'pending', amount_cents: 30000,
      date: format(now, 'yyyy-MM-dd'), transaction_type: 'expense',
    }),
    makeExpense({
      id: 'inst-3', description: 'Notebook (3/3)', is_installment: true, installment_group_id: 'grp-1',
      installment_number: 3, total_installments: 3, status: 'pending', amount_cents: 30000,
      date: format(addMonths(now, 13), 'yyyy-MM-dd'), transaction_type: 'expense',
    }),
  ]
}

describe('SummaryView (smoke)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { fecha: '2026-06-01', valor: 2.1 },
        { fecha: '2026-07-01', valor: 1.9 },
      ],
    }) as unknown as typeof fetch

    useDataStore.getState().setExpenses(buildFixtures())
    useDataStore.getState().setCategories(categories)
    useUserStore.setState({ showUsd: false, exchangeRate: 1000, budgets: { 'cat-food': 20000 } })
  })

  it('renders without crashing and shows the key cards', async () => {
    render(<SummaryView />)

    await waitFor(() => expect(screen.queryByText('Cargando resumen...')).not.toBeInTheDocument())

    expect(screen.getByText('Deuda Total Pendiente (Cuotas)')).toBeInTheDocument()
    expect(screen.getByText('Tasa de Ahorro')).toBeInTheDocument()
    expect(screen.getByText('Presupuestos del Mes')).toBeInTheDocument()
    expect(screen.getByText('Estado Financiero')).toBeInTheDocument()
    expect(screen.getByText('Cuotas en Progreso')).toBeInTheDocument()
  })

  it('excludes savings transactions from Top 5 Gastos del Mes', async () => {
    render(<SummaryView />)
    await waitFor(() => expect(screen.queryByText('Cargando resumen...')).not.toBeInTheDocument())

    // The savings row (9000 ARS) must not appear as a "top expense" of the month
    const top5Section = screen.getByText('Top 5 Gastos del Mes').closest('.glass-card')!
    expect(top5Section).not.toHaveTextContent('$ 9.000,00')
  })

  it('shows an active installment group with correct progress', async () => {
    render(<SummaryView />)
    await waitFor(() => expect(screen.queryByText('Cargando resumen...')).not.toBeInTheDocument())

    expect(screen.getByText('Notebook')).toBeInTheDocument()
    expect(screen.getByText('Cuota 2 / 3')).toBeInTheDocument()
  })

  it('renders a budget progress row for the configured category', async () => {
    render(<SummaryView />)
    await waitFor(() => expect(screen.queryByText('Cargando resumen...')).not.toBeInTheDocument())

    const budgetSection = screen.getByText('Presupuestos del Mes').closest('.glass-card')!
    expect(budgetSection).toHaveTextContent('Comida')
    // expense-1 (15000) + this month's food-categorized installment (30000) = 45000 cents, against a 20000 budget
    expect(budgetSection).toHaveTextContent('$ 450,00 / $ 200,00')
  })
})
