import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDataStore } from '../stores/dataStore'
import type { Expense, Category } from '../services/supabase'

// Mock the API module
vi.mock('../lib/api', () => ({
  fetchExpenses: vi.fn(),
  fetchCategories: vi.fn(),
  createExpense: vi.fn(),
  createInstallments: vi.fn(),
  createCategory: vi.fn(),
  deleteCategory: vi.fn(),
  getTransactionCountForCategory: vi.fn(),
  AppError: class AppError extends Error {
    code: string
    severity: string
    originalError: unknown
    isRetryable: boolean
    
    constructor(
      message: string,
      code: string,
      severity: string,
      originalError: unknown,
      isRetryable: boolean
    ) {
      super(message)
      this.name = 'AppError'
      this.code = code
      this.severity = severity
      this.originalError = originalError
      this.isRetryable = isRetryable
    }
  },
  ErrorCodes: {
    CATEGORY_HAS_TRANSACTIONS: 'CATEGORY_HAS_TRANSACTIONS',
    AUTH_ERROR: 'AUTH_ERROR',
    DB_QUERY_ERROR: 'DB_QUERY_ERROR',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  },
  getErrorMessage: vi.fn((code: string) => code),
  showErrorAlert: vi.fn(),
}))

// Mock Supabase
vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    })),
    rpc: vi.fn(),
  },
}))

describe('Data Store', () => {
  beforeEach(async () => {
    // Reset store to initial state
    useDataStore.getState().resetData()
    // Also reset loadedUserId since resetData doesn't include it
    useDataStore.getState().setLoadedUserId(null)
    vi.clearAllMocks()
    
    // Reset mock implementations to default resolved values
    const api = await import('../lib/api')
    vi.mocked(api.fetchExpenses).mockReset().mockResolvedValue([])
    vi.mocked(api.fetchCategories).mockReset().mockResolvedValue([])
  })

  describe('Initial State', () => {
    it('should have empty expenses initially', () => {
      expect(useDataStore.getState().expenses).toEqual([])
    })

    it('should have empty categories initially', () => {
      expect(useDataStore.getState().categories).toEqual([])
    })

    it('should have null loadedUserId initially', () => {
      expect(useDataStore.getState().loadedUserId).toBeNull()
    })
  })

  describe('State Setters', () => {
    it('should set expenses', () => {
      const mockExpenses: Expense[] = [
        {
          id: 'exp-1',
          user_id: 'user-1',
          description: 'Test Expense',
          amount_cents: 10000,
          currency: 'ARS',
          exchange_rate: 1000,
          usd_amount_cents: 10,
          category_id: null,
          payment_method: 'debit',
          is_installment: false,
          installment_group_id: null,
          installment_number: null,
          total_installments: null,
          installment_amount_cents: null,
          date: '2024-01-15',
          status: 'paid',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          transaction_type: 'expense',
          is_salary: false,
        },
      ]
      useDataStore.getState().setExpenses(mockExpenses)
      expect(useDataStore.getState().expenses).toEqual(mockExpenses)
    })

    it('should set categories', () => {
      const mockCategories: Category[] = [
        {
          id: 'cat-1',
          user_id: 'user-1',
          name: 'Supermercado',
          icon: '🛒',
          color: '#F59E0B',
          is_default: false,
          created_at: '2024-01-15T10:00:00Z',
        },
      ]
      useDataStore.getState().setCategories(mockCategories)
      expect(useDataStore.getState().categories).toEqual(mockCategories)
    })

    it('should set loadedUserId', () => {
      useDataStore.getState().setLoadedUserId('user-123')
      expect(useDataStore.getState().loadedUserId).toBe('user-123')
    })
  })

  describe('Load User Data', () => {
    it('should skip loading if user already loaded', async () => {
      const { fetchExpenses, fetchCategories } = await import('../lib/api')
      
      useDataStore.getState().setLoadedUserId('user-123')
      await useDataStore.getState().loadUserData('user-123')
      
      expect(fetchExpenses).not.toHaveBeenCalled()
      expect(fetchCategories).not.toHaveBeenCalled()
    })

    it('should set loadedUserId before fetching', async () => {
      const { fetchExpenses } = await import('../lib/api')
      vi.mocked(fetchExpenses).mockResolvedValue([])
      
      const { fetchCategories } = await import('../lib/api')
      vi.mocked(fetchCategories).mockResolvedValue([])
      
      await useDataStore.getState().loadUserData('user-123')
      
      expect(useDataStore.getState().loadedUserId).toBe('user-123')
    })

    it('should reset loadedUserId on error', async () => {
      // Spy on fetchExpenses and make it reject
      const error = new Error('Network error')
      const spy = vi.spyOn(useDataStore.getState(), 'fetchExpenses').mockRejectedValue(error)
      
      try {
        // Expect loadUserData to throw, but loadedUserId should be reset before throwing
        await expect(useDataStore.getState().loadUserData('user-123')).rejects.toThrow('Network error')
        expect(useDataStore.getState().loadedUserId).toBeNull()
      } finally {
        spy.mockRestore()
      }
    })
  })

  describe('Fetch Operations', () => {
    it('should fetch and set expenses', async () => {
      const mockExpenses: Expense[] = [
        {
          id: 'exp-1',
          user_id: 'user-1',
          description: 'Groceries',
          amount_cents: 50000,
          currency: 'ARS',
          exchange_rate: 1000,
          usd_amount_cents: 50,
          category_id: 'cat-1',
          payment_method: 'debit',
          is_installment: false,
          installment_group_id: null,
          installment_number: null,
          total_installments: null,
          installment_amount_cents: null,
          date: '2024-01-15',
          status: 'paid',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z',
          transaction_type: 'expense',
          is_salary: false,
        },
      ]
      
      const { fetchExpenses } = await import('../lib/api')
      vi.mocked(fetchExpenses).mockResolvedValue(mockExpenses)
      
      await useDataStore.getState().fetchExpenses('user-1')
      
      expect(useDataStore.getState().expenses).toEqual(mockExpenses)
    })

    it('should handle empty expenses response', async () => {
      const { fetchExpenses } = await import('../lib/api')
      vi.mocked(fetchExpenses).mockResolvedValue([])
      
      await useDataStore.getState().fetchExpenses('user-1')
      
      expect(useDataStore.getState().expenses).toEqual([])
    })

    it('should fetch and set categories', async () => {
      const mockCategories: Category[] = [
        {
          id: 'cat-1',
          user_id: 'user-1',
          name: 'Supermercado',
          icon: '🛒',
          color: '#F59E0B',
          is_default: false,
          created_at: '2024-01-15T10:00:00Z',
        },
      ]
      
      const { fetchCategories } = await import('../lib/api')
      vi.mocked(fetchCategories).mockResolvedValue(mockCategories)
      
      await useDataStore.getState().fetchCategories('user-1')
      
      expect(useDataStore.getState().categories).toEqual(mockCategories)
    })

    it('should handle fetch errors gracefully', async () => {
      const { fetchExpenses, showErrorAlert } = await import('../lib/api')
      vi.mocked(fetchExpenses).mockRejectedValue(new Error('Network error'))
      
      await useDataStore.getState().fetchExpenses('user-1')
      
      expect(useDataStore.getState().expenses).toEqual([])
      expect(showErrorAlert).toHaveBeenCalled()
    })
  })

  describe('Add Expense', () => {
    it('should add expense to store', async () => {
      const newExpense: Expense = {
        id: 'exp-new',
        user_id: 'user-1',
        description: 'New Expense',
        amount_cents: 25000,
        currency: 'ARS',
        exchange_rate: 1000,
        usd_amount_cents: 25,
        category_id: 'cat-1',
        payment_method: 'credit',
        is_installment: false,
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
        installment_amount_cents: null,
        date: '2024-01-20',
        status: 'pending',
        created_at: '2024-01-20T10:00:00Z',
        updated_at: '2024-01-20T10:00:00Z',
        transaction_type: 'expense',
        is_salary: false,
      }
      
      const { createExpense } = await import('../lib/api')
      vi.mocked(createExpense).mockResolvedValue(newExpense)
      
      const result = await useDataStore.getState().addExpense({
        user_id: 'user-1',
        description: 'New Expense',
        amount_cents: 25000,
        currency: 'ARS',
        exchange_rate: 1000,
        usd_amount_cents: 25,
        category_id: 'cat-1',
        payment_method: 'credit',
        date: '2024-01-20',
        transaction_type: 'expense',
        is_installment: false,
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
        installment_amount_cents: null,
        status: 'pending',
        is_salary: false,
      })
      
      expect(result).toEqual(newExpense)
      expect(useDataStore.getState().expenses).toContainEqual(newExpense)
    })

    it('should add expense to beginning of array', async () => {
      const existingExpense: Expense = {
        id: 'exp-1',
        user_id: 'user-1',
        description: 'Existing',
        amount_cents: 10000,
        currency: 'ARS',
        exchange_rate: 1000,
        usd_amount_cents: 10,
        category_id: null,
        payment_method: 'debit',
        is_installment: false,
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
        installment_amount_cents: null,
        date: '2024-01-15',
        status: 'paid',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        transaction_type: 'expense',
        is_salary: false,
      }
      
      const newExpense: Expense = {
        ...existingExpense,
        id: 'exp-2',
        description: 'New',
      }
      
      useDataStore.getState().setExpenses([existingExpense])
      
      const { createExpense } = await import('../lib/api')
      vi.mocked(createExpense).mockResolvedValue(newExpense)
      
      await useDataStore.getState().addExpense({
        user_id: 'user-1',
        description: 'New',
        amount_cents: 10000,
        currency: 'ARS',
        exchange_rate: 1000,
        usd_amount_cents: 10,
        category_id: null,
        payment_method: 'debit',
        date: '2024-01-15',
        transaction_type: 'expense',
        is_installment: false,
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
        installment_amount_cents: null,
        status: 'paid',
        is_salary: false,
      })
      
      const expenses = useDataStore.getState().expenses
      expect(expenses[0]).toEqual(newExpense)
      expect(expenses[1]).toEqual(existingExpense)
    })

    it('should throw on add expense error', async () => {
      const { createExpense } = await import('../lib/api')
      vi.mocked(createExpense).mockRejectedValue(new Error('DB Error'))
      
      await expect(
        useDataStore.getState().addExpense({
          user_id: 'user-1',
          description: 'Test',
          amount_cents: 10000,
          currency: 'ARS',
          exchange_rate: 1000,
          usd_amount_cents: 10,
          category_id: null,
          payment_method: 'debit',
          date: '2024-01-15',
          transaction_type: 'expense',
          is_salary: false,
          is_installment: false,
          installment_group_id: null,
          installment_number: null,
          total_installments: null,
          installment_amount_cents: null,
          status: 'paid',
        })
      ).rejects.toThrow()
    })
  })

  describe('Reset', () => {
    it('should reset data to initial state', () => {
      const mockExpense: Expense = {
        id: 'exp-1',
        user_id: 'user-1',
        description: 'Test',
        amount_cents: 10000,
        currency: 'ARS',
        exchange_rate: 1000,
        usd_amount_cents: 10,
        category_id: null,
        payment_method: 'debit',
        is_installment: false,
        installment_group_id: null,
        installment_number: null,
        total_installments: null,
        installment_amount_cents: null,
        date: '2024-01-15',
        status: 'paid',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        transaction_type: 'expense',
        is_salary: false,
      }
      
      const mockCategory: Category = {
        id: 'cat-1',
        user_id: 'user-1',
        name: 'Test',
        icon: '📦',
        color: '#000000',
        is_default: false,
        created_at: '2024-01-15T10:00:00Z',
      }
      
      useDataStore.getState().setExpenses([mockExpense])
      useDataStore.getState().setCategories([mockCategory])
      
      useDataStore.getState().resetData()
      
      expect(useDataStore.getState().expenses).toEqual([])
      expect(useDataStore.getState().categories).toEqual([])
    })
  })
})
