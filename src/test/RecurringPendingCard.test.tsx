import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from './test-utils'
import { RecurringPendingCard } from '../components/RecurringPendingCard'
import { useDataStore } from '../stores/dataStore'
import { useUserStore } from '../stores/userStore'
import { toPeriod, type RecurringTransaction } from '../lib/recurring'
import type { User } from '@supabase/supabase-js'

vi.mock('../services/supabase', () => ({
  supabase: { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
}))

const netflix: RecurringTransaction = {
  id: 'r1', user_id: 'u1', description: 'Netflix', amount_cents: 850000, currency: 'ARS',
  transaction_type: 'expense', category_id: null, payment_method: 'credit', is_salary: false,
  day_of_month: 28, start_period: toPeriod(new Date()), skipped_periods: [], active: true, created_at: '',
}

describe('RecurringPendingCard', () => {
  const original = useDataStore.getState()
  const confirmRecurring = vi.fn().mockResolvedValue(undefined)
  const skipRecurring = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    useUserStore.setState({ user: { id: 'u1' } as User, exchangeRate: 1400, exchangeRateAvailable: true })
    useDataStore.setState({ recurring: [netflix], expenses: [], categories: [], confirmRecurring, skipRecurring })
  })

  afterEach(() => {
    useDataStore.setState({ confirmRecurring: original.confirmRecurring, skipRecurring: original.skipRecurring })
  })

  it('confirms with the edited amount', async () => {
    const user = userEvent.setup()
    render(<RecurringPendingCard onManage={vi.fn()} />)

    const amount = screen.getByRole('textbox', { name: 'Monto de Netflix' })
    expect(amount).toHaveValue('8.500')
    await user.clear(amount)
    await user.type(amount, '9900')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(confirmRecurring).toHaveBeenCalledWith(
      expect.objectContaining({ period: toPeriod(new Date()) }),
      990000,
      1400,
      'u1'
    )
  })

  it('skips a month', async () => {
    const user = userEvent.setup()
    render(<RecurringPendingCard onManage={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Omitir' }))

    expect(skipRecurring).toHaveBeenCalledWith(expect.objectContaining({ period: toPeriod(new Date()) }))
  })

  it('is hidden when the month is already confirmed', () => {
    useDataStore.setState({
      expenses: [{ id: 'e1', recurring_id: 'r1', recurring_period: toPeriod(new Date()) } as never],
    })
    const { container } = render(<RecurringPendingCard onManage={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
