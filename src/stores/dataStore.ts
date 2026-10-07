import { create } from 'zustand'
import type { Expense, Category } from '../services/supabase'
import { supabase } from '../services/supabase'
import { 
  fetchExpenses as apiFetchExpenses,
  fetchCategories as apiFetchCategories,
  createExpense as apiCreateExpense,
  updateExpense as apiUpdateExpense,
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
  loadedUserId: string | null
  // Set when the initial load fails, so the UI can offer a retry instead of
  // showing an empty account that looks like the data is gone
  loadError: string | null
  
  // Actions
  setExpenses: (expenses: Expense[]) => void
  setCategories: (categories: Category[]) => void
  setLoadedUserId: (userId: string | null) => void
  
  // Fetch operations
  fetchExpenses: (userId: string) => Promise<void>
  fetchCategories: (userId: string) => Promise<void>
  loadUserData: (userId: string) => Promise<void>
  
  // Create operations
  addExpense: (expenseData: Omit<Expense, 'id' | 'created_at' | 'updated_at'>) => Promise<Expense>
  updateExpense: (id: string, updates: Partial<Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'original_currency' | 'original_amount_cents'>> & {
    original_currency?: 'ARS' | 'USD' | null
    original_amount_cents?: number | null
  }) => Promise<Expense>
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

// A timed-out or dropped write may still have reached the database, so instead of a
// plain "try again" (which would save it twice) refresh the list and say so.
function reportWriteError(error: unknown, context: string, refresh: () => Promise<void>) {
  const code = error instanceof AppError ? error.code : undefined
  if (code === ErrorCodes.TIMEOUT_ERROR || code === ErrorCodes.NETWORK_ERROR) {
    showErrorAlert(
      new Error('No pudimos confirmar si se guardó. Revisá la lista antes de volver a intentar.'),
      context
    )
    void refresh()
    return
  }
  showErrorAlert(error, context)
}

export const useDataStore = create<DataState>()((set, get) => ({
  // Initial state
  expenses: [],
  categories: [],
  loadedUserId: null,
  loadError: null,
  
  // Setters
  setExpenses: (expenses) => set({ expenses }),
  setCategories: (categories) => set({ categories }),
  setLoadedUserId: (userId) => set({ loadedUserId: userId }),
  
  // Fetch operations (refreshes). On failure they keep what's already on screen:
  // wiping it would make a network hiccup look like the data was deleted.
  fetchExpenses: async (userId) => {
    try {
      const expenses = await apiFetchExpenses(userId)
      set({ expenses: expenses || [] })
    } catch (error) {
      console.error('Error fetching expenses:', error)
      showErrorAlert(error, 'Error al cargar transacciones')
    }
  },
  
  fetchCategories: async (userId) => {
    try {
      const categories = await apiFetchCategories(userId)
      set({ categories: categories || [] })
    } catch (error) {
      console.error('Error fetching categories:', error)
      showErrorAlert(error, 'Error al cargar categorías')
    }
  },
  
  // Load all user data at once with deduplication
  loadUserData: async (userId) => {
    const state = get()
    
    // Skip if we already loaded data for this user
    if (state.loadedUserId === userId) {
      return
    }
    
    // Set loaded user ID first to prevent concurrent calls
    set({ loadedUserId: userId, loadError: null })
    
    try {
      // Calls the API directly (not the refresh actions above, which swallow
      // errors) so a failed load is actually reported
      const [expenses, categories] = await Promise.all([
        apiFetchExpenses(userId),
        apiFetchCategories(userId),
      ])
      // Ignore a response that arrives after logout or a user switch
      if (get().loadedUserId !== userId) return
      set({ expenses: expenses || [], categories: categories || [] })
    } catch (error) {
      console.error('Error loading user data:', error)
      if (get().loadedUserId !== userId) return
      // Reset on error so we can retry
      set({
        loadedUserId: null,
        loadError: error instanceof Error ? error.message : getErrorMessage(ErrorCodes.UNKNOWN_ERROR),
      })
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
      reportWriteError(error, 'Error al agregar transacción', () => get().fetchExpenses(expenseData.user_id))
      throw error
    }
  },
  
  updateExpense: async (id, updates) => {
    try {
      const updated = await apiUpdateExpense(id, updates)
      set((state) => ({
        expenses: state.expenses.map((e) => (e.id === id ? updated : e))
      }))
      return updated
    } catch (error) {
      console.error('Error updating expense:', error)
      showErrorAlert(error, 'Error al actualizar transacción')
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
      reportWriteError(error, 'Error al crear cuotas', () => get().fetchExpenses(params.userId))
      throw error
    }
  },
  
  // Category operations
  addCategory: async (categoryData) => {
    try {
      // Get current user from Supabase auth
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new AppError(
          'Usuario no autenticado',
          ErrorCodes.AUTH_ERROR,
          'high',
          null,
          false
        )
      }
      
      const newCategory = await apiCreateCategory({
        ...categoryData,
        user_id: user.id
      })
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
      // Define default expense categories (all deletable)
      const defaultCategories = [
        { name: 'Supermercado', icon: '🛒', color: '#F59E0B', is_default: false, user_id: userId },
        { name: 'Salida', icon: '🍻', color: '#EC4899', is_default: false, user_id: userId },
        { name: 'Transporte', icon: '🚗', color: '#3B82F6', is_default: false, user_id: userId },
        { name: 'Servicios', icon: '💡', color: '#6B7280', is_default: false, user_id: userId },
      ]

      // Only seed a brand-new account (no categories at all). Seeding whatever
      // defaults were missing brought back categories the user had deleted on
      // every login.
      const { count, error: countError } = await supabase
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)

      if (countError) {
        console.error('Error checking categories:', countError)
        return
      }

      if (count === 0) {
        // Upsert against the (user_id, name) unique index: if two tabs both see
        // an empty account, the second insert is ignored instead of duplicating.
        const { error: upsertError } = await supabase
          .from('categories')
          .upsert(defaultCategories, { onConflict: 'user_id,name', ignoreDuplicates: true })

        if (upsertError) {
          console.error('Error creating default categories:', upsertError)
        }
      }

      const { data: existingCategories } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', userId)
        .order('name')

      const existingCats = existingCategories || []

      // Only update state if categories are different from current state
      const currentCategories = get().categories
      const hasChanged = currentCategories.length !== existingCats.length ||
        existingCats.some((cat, index) => currentCategories[index]?.id !== cat.id)

      if (hasChanged) {
        set({ categories: existingCats })
      }
    } catch (error) {
      console.error('Error initializing categories:', error)
      throw error
    }
  },
  
  // Reset
  resetData: () => set({
    expenses: [],
    categories: [],
    loadedUserId: null,
    loadError: null,
  }),
}))
