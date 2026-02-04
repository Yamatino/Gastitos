import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'

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
  
  // Exchange rate
  exchangeRate: number
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
        const { [categoryId]: _, ...rest } = state.budgets
        return { budgets: rest }
      }),
      
      // Exchange rate
      exchangeRate: 1000,
      setExchangeRate: (rate) => set({ exchangeRate: rate }),
      
      // Reset
      resetUser: () => set({
        user: null,
        showUsd: false,
        isLightMode: false,
        reducedMotion: false,
        hideTotalAmount: false,
        monthlySavingsGoalUSD: 0,
        budgets: {},
        exchangeRate: 1000,
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
        exchangeRate: state.exchangeRate,
      }),
    }
  )
)
