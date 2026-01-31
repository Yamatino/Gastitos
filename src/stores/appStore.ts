import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'
import type { Expense, Category } from '../services/supabase'

interface AppState {
  user: User | null
  setUser: (user: User | null) => void
  
  expenses: Expense[]
  setExpenses: (expenses: Expense[]) => void
  addExpense: (expense: Expense) => void
  
  categories: Category[]
  setCategories: (categories: Category[]) => void
  
  showUsd: boolean
  toggleShowUsd: () => void
  
  exchangeRate: number
  setExchangeRate: (rate: number) => void
  
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      
      expenses: [],
      setExpenses: (expenses) => set({ expenses }),
      addExpense: (expense) => set((state) => ({ 
        expenses: [expense, ...state.expenses] 
      })),
      
      categories: [],
      setCategories: (categories) => set({ categories }),
      
      showUsd: false,
      toggleShowUsd: () => set((state) => ({ showUsd: !state.showUsd })),
      
      exchangeRate: 1000,
      setExchangeRate: (rate) => set({ exchangeRate: rate }),
      
      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'gastitos-storage',
      partialize: (state) => ({ 
        showUsd: state.showUsd,
        exchangeRate: state.exchangeRate 
      }),
    }
  )
)
