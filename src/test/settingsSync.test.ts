import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useUserStore } from '../stores/userStore'
import { startSettingsSync, stopSettingsSync } from '../lib/settingsSync'

vi.mock('../lib/api', () => ({
  fetchUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
}))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('settingsSync', () => {
  beforeEach(async () => {
    stopSettingsSync()
    useUserStore.getState().resetUser()
    vi.clearAllMocks()
    // localStorage is a stub in tests (see setup.ts)
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    const api = await import('../lib/api')
    vi.mocked(api.fetchUserSettings).mockResolvedValue(null)
    vi.mocked(api.saveUserSettings).mockResolvedValue(undefined)
  })

  it('uploads this device’s settings on the first sync, including the legacy billing day', async () => {
    const api = await import('../lib/api')
    useUserStore.getState().setBudget('cat-1', 500000)
    vi.mocked(localStorage.getItem).mockImplementation((key) => (key === 'defaultBillingDay' ? '15' : null))

    await startSettingsSync('user-1')

    expect(api.saveUserSettings).toHaveBeenCalledWith('user-1', {
      budgets: { 'cat-1': 500000 },
      monthlySavingsGoalUSD: 0,
      billingDay: 15,
    })
    expect(localStorage.removeItem).toHaveBeenCalledWith('defaultBillingDay')
  })

  it('applies saved settings from the server without echoing them back', async () => {
    const api = await import('../lib/api')
    vi.mocked(api.fetchUserSettings).mockResolvedValue({
      budgets: { 'cat-2': 100 },
      monthlySavingsGoalUSD: 300,
      billingDay: 5,
    })

    await startSettingsSync('user-1')
    await flush()

    const state = useUserStore.getState()
    expect(state.budgets).toEqual({ 'cat-2': 100 })
    expect(state.monthlySavingsGoalUSD).toBe(300)
    expect(state.billingDay).toBe(5)
    expect(api.saveUserSettings).not.toHaveBeenCalled()
  })

  it('saves changes made after the initial sync', async () => {
    const api = await import('../lib/api')
    vi.mocked(api.fetchUserSettings).mockResolvedValue({ budgets: {}, monthlySavingsGoalUSD: 0, billingDay: 10 })
    await startSettingsSync('user-1')

    useUserStore.getState().setBillingDay(20)
    await flush()

    expect(api.saveUserSettings).toHaveBeenLastCalledWith('user-1', expect.objectContaining({ billingDay: 20 }))
  })

  it('stops saving after logout', async () => {
    const api = await import('../lib/api')
    vi.mocked(api.fetchUserSettings).mockResolvedValue({ budgets: {}, monthlySavingsGoalUSD: 0, billingDay: 10 })
    await startSettingsSync('user-1')

    stopSettingsSync()
    useUserStore.getState().clearSyncedSettings()
    useUserStore.getState().setBillingDay(20)
    await flush()

    expect(api.saveUserSettings).not.toHaveBeenCalled()
  })

  it('ignores a fetch that returns after logout', async () => {
    const api = await import('../lib/api')
    let resolve: (v: { budgets: Record<string, number>; monthlySavingsGoalUSD: number; billingDay: number }) => void = () => {}
    vi.mocked(api.fetchUserSettings).mockReturnValue(new Promise((r) => { resolve = r }))

    const sync = startSettingsSync('user-1')
    stopSettingsSync()
    resolve({ budgets: { 'cat-9': 1 }, monthlySavingsGoalUSD: 99, billingDay: 3 })
    await sync

    expect(useUserStore.getState().budgets).toEqual({})
    expect(useUserStore.getState().billingDay).toBe(10)
  })

  it('keeps settings on the device when the server is unreachable', async () => {
    const api = await import('../lib/api')
    vi.mocked(api.fetchUserSettings).mockRejectedValue(new Error('relation "user_settings" does not exist'))
    useUserStore.getState().setBudget('cat-1', 500000)

    await startSettingsSync('user-1')
    useUserStore.getState().setBillingDay(20)
    await flush()

    expect(useUserStore.getState().budgets).toEqual({ 'cat-1': 500000 })
    expect(api.saveUserSettings).not.toHaveBeenCalled()
  })
})
