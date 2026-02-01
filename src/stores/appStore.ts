import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'
import type { Expense, Category } from '../services/supabase'
import { supabase } from '../services/supabase'

interface AppState {
  user: User | null
  setUser: (user: User | null) => void
  
  expenses: Expense[]
  setExpenses: (expenses: Expense[]) => void
  addExpense: (expense: Expense) => void
  
  categories: Category[]
  setCategories: (categories: Category[]) => void
  initializeCategories: () => Promise<void>
  
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
      initializeCategories: async () => {
        const { data: existing } = await supabase.from('categories').select('*').limit(1)
        if (existing && existing.length > 0) return
        
        const defaultCategories = [
          { name: 'Salario', icon: '💰', color: '#10B981', is_default: true },
          { name: 'Comida', icon: '🍔', color: '#F59E0B', is_default: true },
          { name: 'Transporte', icon: '🚗', color: '#3B82F6', is_default: true },
          { name: 'Entretenimiento', icon: '🎬', color: '#EC4899', is_default: true },
          { name: 'Servicios', icon: '💡', color: '#6B7280', is_default: true },
          { name: 'Compras', icon: '🛍️', color: '#8B5CF6', is_default: true },
        ]
        
        const { data, error } = await supabase.from('categories').insert(defaultCategories).select()
        if (error) {
          console.error('Error creating default categories:', error)
        } else {
          set({ categories: data || [] })
        }
      },
      
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
