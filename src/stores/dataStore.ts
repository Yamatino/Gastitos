import { create } from 'zustand'
import type { Expense, Category } from '../services/supabase'
import { supabase } from '../services/supabase'
import { 
  fetchExpenses as apiFetchExpenses,
  fetchCategories as apiFetchCategories,
  createExpense as apiCreateExpense,
  createInstallments as apiCreateInstallments,
  createCategory as apiCreateCategory,
  deleteCategory as apiDeleteCategory,
  getTransactionCountForCategory,
  AppError,
  ErrorCodes,
  getErrorMessage,
  showErrorAlert
} from '../lib/api'

interface DataState {
  // Data
  expenses: Expense[]
  categories: Category[]
  
  // Actions
  setExpenses: (expenses: Expense[]) => void
  setCategories: (categories: Category[]) => void
  
  // Fetch operations
  fetchExpenses: (userId: string) => Promise<void>
  fetchCategories: (userId: string) => Promise<void>
  
  // Create operations
  addExpense: (expenseData: Omit<Expense, 'id' | 'created_at' | 'updated_at'>) => Promise<Expense>
  addInstallments: (params: {
    userId: string
    description: string
    amountCents: number
    currency: string
    exchangeRate: number
    usdAmountCents: number
    categoryId: string
    installmentCount: number
    baseDate: string
    billingDay: number
  }) => Promise<void>
  
  // Category operations
  addCategory: (categoryData: Omit<Category, 'id' | 'user_id' | 'created_at'>) => Promise<void>
  removeCategory: (categoryId: string) => Promise<void>
  
  // Initialize default categories
  initializeCategories: (userId: string) => Promise<void>
  
  // Reset
  resetData: () => void
}

export const useDataStore = create<DataState>()((set, get) => ({
  // Initial state
  expenses: [],
  categories: [],
  
  // Setters
  setExpenses: (expenses) => set({ expenses }),
  setCategories: (categories) => set({ categories }),
  
  // Fetch operations
  fetchExpenses: async (userId) => {
    try {
      const expenses = await apiFetchExpenses(userId)
      set({ expenses })
    } catch (error) {
      console.error('Error fetching expenses:', error)
      showErrorAlert(error, 'Error al cargar transacciones')
      throw error
    }
  },
  
  fetchCategories: async (userId) => {
    try {
      const categories = await apiFetchCategories(userId)
      set({ categories })
    } catch (error) {
      console.error('Error fetching categories:', error)
      showErrorAlert(error, 'Error al cargar categorías')
      throw error
    }
  },
  
  // Create operations
  addExpense: async (expenseData) => {
    try {
      const newExpense = await apiCreateExpense(expenseData)
      set((state) => ({
        expenses: [newExpense, ...state.expenses]
      }))
      return newExpense
    } catch (error) {
      console.error('Error adding expense:', error)
      showErrorAlert(error, 'Error al agregar transacción')
      throw error
    }
  },
  
  addInstallments: async (params) => {
    try {
      await apiCreateInstallments(
        params.userId,
        params.description,
        params.amountCents,
        params.currency,
        params.exchangeRate,
        params.usdAmountCents,
        params.categoryId,
        params.installmentCount,
        params.baseDate,
        params.billingDay
      )
      // Refresh expenses after creating installments
      await get().fetchExpenses(params.userId)
    } catch (error) {
      console.error('Error creating installments:', error)
      showErrorAlert(error, 'Error al crear cuotas')
      throw error
    }
  },
  
  // Category operations
  addCategory: async (categoryData) => {
    try {
      const newCategory = await apiCreateCategory(categoryData)
      set((state) => ({
        categories: [...state.categories, newCategory]
      }))
    } catch (error) {
      console.error('Error adding category:', error)
      showErrorAlert(error, 'Error al agregar categoría')
      throw error
    }
  },
  
  removeCategory: async (categoryId) => {
    try {
      // Check if category has transactions
      const transactionCount = await getTransactionCountForCategory(categoryId)
      if (transactionCount > 0) {
        throw new AppError(
          getErrorMessage(ErrorCodes.CATEGORY_HAS_TRANSACTIONS),
          ErrorCodes.CATEGORY_HAS_TRANSACTIONS,
          'high',
          null,
          false
        )
      }
      
      await apiDeleteCategory(categoryId)
      set((state) => ({
        categories: state.categories.filter(c => c.id !== categoryId)
      }))
    } catch (error) {
      console.error('Error removing category:', error)
      showErrorAlert(error, 'Error al eliminar categoría')
      throw error
    }
  },
  
  // Initialize default categories
  initializeCategories: async (userId) => {
    try {
      // Fetch existing categories
      const { data: existingCategories } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', userId)
      
      const existingNames = new Set(existingCategories?.map(c => c.name.toLowerCase()) || [])
      
      // Define default expense categories (all deletable)
      const defaultCategories = [
        { name: 'Supermercado', icon: '🛒', color: '#F59E0B', is_default: false, user_id: userId },
        { name: 'Salida', icon: '🍻', color: '#EC4899', is_default: false, user_id: userId },
        { name: 'Transporte', icon: '🚗', color: '#3B82F6', is_default: false, user_id: userId },
        { name: 'Servicios', icon: '💡', color: '#6B7280', is_default: false, user_id: userId },
      ]
      
      // Find missing defaults
      const missingDefaults = defaultCategories.filter(
        cat => !existingNames.has(cat.name.toLowerCase())
      )
      
      // Insert missing categories
      if (missingDefaults.length > 0) {
        const { data: newCategories, error } = await supabase
          .from('categories')
          .insert(missingDefaults)
          .select()
        
        if (error) {
          console.error('Error creating default categories:', error)
        } else if (newCategories) {
          set({ categories: [...(existingCategories || []), ...newCategories] })
          return
        }
      }
      
      set({ categories: existingCategories || [] })
    } catch (error) {
      console.error('Error initializing categories:', error)
      throw error
    }
  },
  
  // Reset
  resetData: () => set({
    expenses: [],
    categories: [],
  }),
}))
