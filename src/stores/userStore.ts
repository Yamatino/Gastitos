import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'

// Settings that follow the user across devices. Everything else in this store
// (theme, USD toggle, hidden totals...) is a per-device display preference.
export type SyncedSettings = {
  budgets: Record<string, number>
  monthlySavingsGoalUSD: number
  billingDay: number
}

const DEFAULT_SYNCED_SETTINGS: SyncedSettings = {
  budgets: {},
  monthlySavingsGoalUSD: 0,
  billingDay: 10,
}

interface UserState {
  user: User | null
  setUser: (user: User | null) => void
  
  // User preferences
  showUsd: boolean
  toggleShowUsd: () => void
  
  isLightMode: boolean
  toggleTheme: () => void
  
  reducedMotion: boolean
  toggleReducedMotion: () => void
  
  hideTotalAmount: boolean
  toggleHideTotalAmount: () => void
  
  // Financial goals
  monthlySavingsGoalUSD: number
  setMonthlySavingsGoalUSD: (amount: number) => void
  
  // Budgets
  budgets: Record<string, number>
  setBudget: (categoryId: string, amount: number) => void
  removeBudget: (categoryId: string) => void
  
  // Day of the month card installments are billed
  billingDay: number
  setBillingDay: (day: number) => void
  
  // Settings synced to the user_settings table (see lib/settingsSync)
  applySyncedSettings: (settings: SyncedSettings) => void
  clearSyncedSettings: () => void
  
  // Exchange rate
  exchangeRate: number
  // False until a real rate (live or cached) has loaded; exchangeRate is only a
  // placeholder for display until then and must not be saved on transactions
  exchangeRateAvailable: boolean
  setExchangeRate: (rate: number) => void
  
  // Reset
  resetUser: () => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      // User
      user: null,
      setUser: (user) => set((state) => {
        // Only update if the user ID has actually changed
        const currentId = state.user?.id
        const newId = user?.id
        
        if (currentId === newId) {
          // User hasn't changed, don't update state
          return state
        }
        
        return { user }
      }),
      
      // Preferences
      showUsd: false,
      toggleShowUsd: () => set((state) => ({ showUsd: !state.showUsd })),
      
      isLightMode: false,
      toggleTheme: () => set((state) => ({ isLightMode: !state.isLightMode })),
      
      reducedMotion: false,
      toggleReducedMotion: () => set((state) => ({ reducedMotion: !state.reducedMotion })),
      
      hideTotalAmount: false,
      toggleHideTotalAmount: () => set((state) => ({ hideTotalAmount: !state.hideTotalAmount })),
      
      // Financial goals
      monthlySavingsGoalUSD: 0,
      setMonthlySavingsGoalUSD: (amount) => set({ monthlySavingsGoalUSD: amount }),
      
      // Budgets
      budgets: {},
      setBudget: (categoryId, amount) => set((state) => ({
        budgets: { ...state.budgets, [categoryId]: amount }
      })),
      removeBudget: (categoryId) => set((state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [categoryId]: _, ...rest } = state.budgets
        return { budgets: rest }
      }),
      
      billingDay: DEFAULT_SYNCED_SETTINGS.billingDay,
      setBillingDay: (day) => set({ billingDay: day }),
      
      applySyncedSettings: (settings) => set({
        budgets: settings.budgets,
        monthlySavingsGoalUSD: settings.monthlySavingsGoalUSD,
        billingDay: settings.billingDay,
      }),
      // On logout, so the next account on this device doesn't inherit them
      clearSyncedSettings: () => set({ ...DEFAULT_SYNCED_SETTINGS }),
      
      // Exchange rate
      exchangeRate: 1000,
      exchangeRateAvailable: false,
      setExchangeRate: (rate) => set({ exchangeRate: rate, exchangeRateAvailable: true }),
      
      // Reset
      resetUser: () => set({
        user: null,
        showUsd: false,
        isLightMode: false,
        reducedMotion: false,
        hideTotalAmount: false,
        ...DEFAULT_SYNCED_SETTINGS,
        exchangeRate: 1000,
        exchangeRateAvailable: false,
      }),
    }),
    {
      name: 'gastitos-user-storage',
      partialize: (state) => ({
        showUsd: state.showUsd,
        isLightMode: state.isLightMode,
        reducedMotion: state.reducedMotion,
        hideTotalAmount: state.hideTotalAmount,
        monthlySavingsGoalUSD: state.monthlySavingsGoalUSD,
        budgets: state.budgets,
        billingDay: state.billingDay,
        // Note: exchangeRate is NOT persisted - always fetched from API on load
      }),
    }
  )
)
