import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from './test-utils'
import { AddTransactionModal } from '../components/AddTransactionModal'
import { useDataStore } from '../stores/dataStore'
import { useUserStore } from '../stores/userStore'
import type { Category, Expense } from '../services/supabase'
import type { User } from '@supabase/supabase-js'

vi.mock('../services/supabase', () => ({
  supabase: { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}))

const categories: Category[] = [
  { id: 'super', user_id: 'u1', name: 'Supermercado', icon: '🛒', color: '#F59E0B', is_default: false, created_at: '' },
  { id: 'salida', user_id: 'u1', name: 'Salida', icon: '🍻', color: '#EC4899', is_default: false, created_at: '' },
  { id: 'auto', user_id: 'u1', name: 'Auto', icon: '🚗', color: '#3B82F6', is_default: false, created_at: '' },
]

let seq = 0
function tx(overrides: Partial<Expense>): Expense {
  return {
    id: `t${seq++}`, user_id: 'u1', description: 'x', amount_cents: 1000, currency: 'ARS', exchange_rate: 1000,
    usd_amount_cents: 1, category_id: 'super', payment_method: 'debit', is_installment: false,
    installment_group_id: null, installment_number: null, total_installments: null, installment_amount_cents: null,
    date: new Date().toISOString().slice(0, 10), status: 'paid', created_at: '2026-10-01T10:00:00Z', updated_at: '',
    transaction_type: 'expense', is_salary: false, ...overrides,
  }
}

const renderModal = () =>
  render(<AddTransactionModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} categories={categories} />)

const isSelected = (name: RegExp) => screen.getByRole('radio', { name }).getAttribute('aria-checked') === 'true'

describe('AddTransactionModal: faster entry', () => {
  beforeEach(() => {
    useUserStore.setState({ user: { id: 'u1' } as User, exchangeRate: 1000, exchangeRateAvailable: true })
    useDataStore.setState({
      categories,
      expenses: [
        tx({ description: 'Coto', category_id: 'super', created_at: '2026-10-01T10:00:00Z' }),
        tx({ description: 'Coto', category_id: 'super', created_at: '2026-10-02T10:00:00Z' }),
        tx({ description: 'Cerveza', category_id: 'salida', created_at: '2026-10-05T10:00:00Z' }), // most recent
      ],
    })
  })

  it('preselects the category of the last expense added', () => {
    renderModal()
    expect(isSelected(/Salida/)).toBe(true)
  })

  it('lists categories most used first', () => {
    renderModal()
    const names = screen.getAllByRole('radio').map((chip) => chip.textContent)
    expect(names).toEqual(['🛒Supermercado', '🍻Salida', '🚗Auto'])
  })

  it('suggests past descriptions and fills in their category', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(screen.getByPlaceholderText('Ej: Cena con amigos'), 'co')
    await user.click(screen.getByRole('button', { name: 'Coto' }))

    expect(screen.getByPlaceholderText('Ej: Cena con amigos')).toHaveValue('Coto')
    expect(isSelected(/Supermercado/)).toBe(true)
  })

  it('fills in the category when a known description is typed in full', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.type(screen.getByPlaceholderText('Ej: Cena con amigos'), 'coto')

    expect(isSelected(/Supermercado/)).toBe(true)
  })

  it('keeps a category the user tapped, even when the description suggests another', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(screen.getByRole('radio', { name: /Auto/ }))
    await user.type(screen.getByPlaceholderText('Ej: Cena con amigos'), 'coto')

    expect(isSelected(/Auto/)).toBe(true)
  })

  it('"Repetir todos los meses" saves a template and links this month to it', async () => {
    const original = useDataStore.getState()
    const addRecurring = vi.fn().mockResolvedValue({ id: 'r9' })
    const addExpense = vi.fn().mockResolvedValue({})
    useDataStore.setState({ addRecurring, addExpense })
    try {
      const user = userEvent.setup()
      renderModal()

      await user.type(screen.getByPlaceholderText('0'), '8500')
      await user.type(screen.getByPlaceholderText('Ej: Cena con amigos'), 'Netflix')
      await user.click(screen.getByRole('checkbox', { name: /Repetir todos los meses/ }))
      await user.click(screen.getByRole('button', { name: /Guardar Gasto/ }))

      const today = new Date()
      const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
      expect(addRecurring).toHaveBeenCalledWith('u1', expect.objectContaining({
        description: 'Netflix',
        amount_cents: 850000,
        transaction_type: 'expense',
        category_id: 'salida', // preselected last-used category
        day_of_month: today.getDate(),
        start_period: period,
      }))
      expect(addExpense).toHaveBeenCalledWith(expect.objectContaining({ recurring_id: 'r9', recurring_period: period, amount_cents: 850000 }))
    } finally {
      useDataStore.setState({ addRecurring: original.addRecurring, addExpense: original.addExpense })
    }
  })
})
