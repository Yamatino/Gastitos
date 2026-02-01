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
  addCategory: (category: Omit<Category, 'id' | 'user_id' | 'created_at'>) => Promise<void>
  removeCategory: (id: string) => Promise<void>
  
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
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        
        const { data: existing } = await supabase.from('categories').select('*').eq('user_id', user.id).limit(1)
        if (existing && existing.length > 0) {
          set({ categories: existing })
          return
        }
        
        const defaultCategories = [
          { name: 'Salario', icon: '💰', color: '#10B981', is_default: true, user_id: user.id, type: 'income' },
          { name: 'Otros', icon: '📥', color: '#6B7280', is_default: true, user_id: user.id, type: 'income' },
          { name: 'Supermercado', icon: '🛒', color: '#F59E0B', is_default: true, user_id: user.id, type: 'expense' },
          { name: 'Salida', icon: '🍻', color: '#EC4899', is_default: true, user_id: user.id, type: 'expense' },
          { name: 'Transporte', icon: '🚗', color: '#3B82F6', is_default: true, user_id: user.id, type: 'expense' },
          { name: 'Servicios', icon: '💡', color: '#6B7280', is_default: true, user_id: user.id, type: 'expense' },
        ]
        
        const { data, error } = await supabase.from('categories').insert(defaultCategories).select()
        if (error) {
          console.error('Error creating default categories:', error)
        } else {
          set({ categories: data || [] })
        }
      },
      addCategory: async (category) => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('No user')
        
        const categoryWithUser = { ...category, user_id: user.id, type: 'expense' }
        const { data, error } = await supabase.from('categories').insert(categoryWithUser).select()
        if (error) {
          console.error('Error adding category:', error)
          throw error
        } else if (data) {
          set((state) => ({ categories: [...state.categories, data[0]] }))
        }
      },
      removeCategory: async (id) => {
        const { error } = await supabase.from('categories').delete().eq('id', id)
        if (error) {
          console.error('Error removing category:', error)
          throw error
        } else {
          set((state) => ({ categories: state.categories.filter(c => c.id !== id) }))
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
