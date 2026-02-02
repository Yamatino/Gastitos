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
  
  // Budget goals
  budgets: Record<string, number> // category_id -> amount in cents
  setBudget: (categoryId: string, amount: number) => void
  removeBudget: (categoryId: string) => void
  
  // Savings goal
  monthlySavingsGoalUSD: number
  setMonthlySavingsGoalUSD: (amount: number) => void
  
  // Hide total amount (privacy toggle)
  hideTotalAmount: boolean
  toggleHideTotalAmount: () => void
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
        
        // Fetch all existing categories for this user
        const { data: existingCategories } = await supabase
          .from('categories')
          .select('*')
          .eq('user_id', user.id)
        
        const existingNames = new Set(existingCategories?.map(c => c.name.toLowerCase()) || [])
        
        // Define all default categories that should exist
        const defaultCategories = [
          { name: 'Salario', icon: '💰', color: '#10B981', is_default: true, user_id: user.id, type: 'income' },
          { name: 'Otros', icon: '📥', color: '#6B7280', is_default: true, user_id: user.id, type: 'income' },
          { name: 'Ahorro', icon: '💎', color: '#3B82F6', is_default: true, user_id: user.id, type: 'savings' },
          { name: 'Supermercado', icon: '🛒', color: '#F59E0B', is_default: true, user_id: user.id, type: 'expense' },
          { name: 'Salida', icon: '🍻', color: '#EC4899', is_default: true, user_id: user.id, type: 'expense' },
          { name: 'Transporte', icon: '🚗', color: '#3B82F6', is_default: true, user_id: user.id, type: 'expense' },
          { name: 'Servicios', icon: '💡', color: '#6B7280', is_default: true, user_id: user.id, type: 'expense' },
        ]
        
        // Find which default categories are missing
        const missingDefaults = defaultCategories.filter(
          cat => !existingNames.has(cat.name.toLowerCase())
        )
        
        // Insert missing default categories
        if (missingDefaults.length > 0) {
          const { data: newCategories, error } = await supabase
            .from('categories')
            .insert(missingDefaults)
            .select()
          
          if (error) {
            console.error('Error creating default categories:', error)
          } else if (newCategories) {
            // Combine existing and new categories
            const allCategories = [...(existingCategories || []), ...newCategories]
            set({ categories: allCategories })
            return
          }
        }
        
        // If no missing defaults, just set existing categories
        set({ categories: existingCategories || [] })
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
      
      // Budget goals
      budgets: {},
      setBudget: (categoryId, amount) => set((state) => ({
        budgets: { ...state.budgets, [categoryId]: amount }
      })),
      removeBudget: (categoryId) => set((state) => {
        const { [categoryId]: _, ...rest } = state.budgets
        return { budgets: rest }
      }),
      
      // Savings goal
      monthlySavingsGoalUSD: 0,
      setMonthlySavingsGoalUSD: (amount) => set({ monthlySavingsGoalUSD: amount }),
      
      // Hide total amount (privacy toggle)
      hideTotalAmount: false,
      toggleHideTotalAmount: () => set((state) => ({ hideTotalAmount: !state.hideTotalAmount })),
    }),
    {
      name: 'gastitos-storage',
      partialize: (state) => ({ 
        showUsd: state.showUsd,
        exchangeRate: state.exchangeRate,
        budgets: state.budgets,
        monthlySavingsGoalUSD: state.monthlySavingsGoalUSD,
        hideTotalAmount: state.hideTotalAmount
      }),
    }
  )
)
