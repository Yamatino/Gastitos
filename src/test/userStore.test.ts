import { describe, it, expect, beforeEach } from 'vitest'
import { useUserStore } from '../stores/userStore'
import type { User } from '@supabase/supabase-js'

describe('User Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useUserStore.getState().resetUser()
  })

  describe('User State', () => {
    it('should have null user initially', () => {
      expect(useUserStore.getState().user).toBeNull()
    })

    it('should set user correctly', () => {
      const mockUser = { id: 'user-123', email: 'test@test.com' } as User
      useUserStore.getState().setUser(mockUser)
      expect(useUserStore.getState().user).toEqual(mockUser)
    })

    it('should update user when ID changes', () => {
      const user1 = { id: 'user-1', email: 'user1@test.com' } as User
      const user2 = { id: 'user-2', email: 'user2@test.com' } as User
      
      useUserStore.getState().setUser(user1)
      useUserStore.getState().setUser(user2)
      
      expect(useUserStore.getState().user).toEqual(user2)
    })

    it('should not update when setting same user ID', () => {
      const user1 = { id: 'user-1', email: 'user1@test.com' } as User
      const user2 = { id: 'user-1', email: 'user2@test.com' } as User
      
      useUserStore.getState().setUser(user1)
      useUserStore.getState().setUser(user2)
      
      // Should keep the first user (prevents unnecessary re-renders)
      expect(useUserStore.getState().user).toEqual(user1)
    })

    it('should handle null user', () => {
      const mockUser = { id: 'user-123', email: 'test@test.com' } as User
      useUserStore.getState().setUser(mockUser)
      useUserStore.getState().setUser(null)
      expect(useUserStore.getState().user).toBeNull()
    })
  })

  describe('Preferences', () => {
    it('should have default preferences', () => {
      const state = useUserStore.getState()
      expect(state.showUsd).toBe(false)
      expect(state.isLightMode).toBe(false)
      expect(state.reducedMotion).toBe(false)
      expect(state.hideTotalAmount).toBe(false)
    })

    describe('USD Display', () => {
      it('should toggle showUsd', () => {
        useUserStore.getState().toggleShowUsd()
        expect(useUserStore.getState().showUsd).toBe(true)
        
        useUserStore.getState().toggleShowUsd()
        expect(useUserStore.getState().showUsd).toBe(false)
      })
    })

    describe('Theme', () => {
      it('should toggle theme', () => {
        useUserStore.getState().toggleTheme()
        expect(useUserStore.getState().isLightMode).toBe(true)
        
        useUserStore.getState().toggleTheme()
        expect(useUserStore.getState().isLightMode).toBe(false)
      })
    })

    describe('Reduced Motion', () => {
      it('should toggle reduced motion', () => {
        useUserStore.getState().toggleReducedMotion()
        expect(useUserStore.getState().reducedMotion).toBe(true)
        
        useUserStore.getState().toggleReducedMotion()
        expect(useUserStore.getState().reducedMotion).toBe(false)
      })
    })

    describe('Hide Total Amount', () => {
      it('should toggle hide total amount', () => {
        useUserStore.getState().toggleHideTotalAmount()
        expect(useUserStore.getState().hideTotalAmount).toBe(true)
        
        useUserStore.getState().toggleHideTotalAmount()
        expect(useUserStore.getState().hideTotalAmount).toBe(false)
      })
    })
  })

  describe('Financial Goals', () => {
    it('should have default monthly savings goal of 0', () => {
      expect(useUserStore.getState().monthlySavingsGoalUSD).toBe(0)
    })

    it('should set monthly savings goal', () => {
      useUserStore.getState().setMonthlySavingsGoalUSD(500)
      expect(useUserStore.getState().monthlySavingsGoalUSD).toBe(500)
    })

    it('should update savings goal', () => {
      useUserStore.getState().setMonthlySavingsGoalUSD(1000)
      useUserStore.getState().setMonthlySavingsGoalUSD(1500)
      expect(useUserStore.getState().monthlySavingsGoalUSD).toBe(1500)
    })
  })

  describe('Budgets', () => {
    it('should have empty budgets initially', () => {
      expect(useUserStore.getState().budgets).toEqual({})
    })

    it('should set budget for category', () => {
      useUserStore.getState().setBudget('cat-1', 50000)
      expect(useUserStore.getState().budgets['cat-1']).toBe(50000)
    })

    it('should update existing budget', () => {
      useUserStore.getState().setBudget('cat-1', 50000)
      useUserStore.getState().setBudget('cat-1', 75000)
      expect(useUserStore.getState().budgets['cat-1']).toBe(75000)
    })

    it('should set multiple category budgets', () => {
      useUserStore.getState().setBudget('cat-1', 50000)
      useUserStore.getState().setBudget('cat-2', 30000)
      useUserStore.getState().setBudget('cat-3', 20000)
      
      expect(useUserStore.getState().budgets).toEqual({
        'cat-1': 50000,
        'cat-2': 30000,
        'cat-3': 20000,
      })
    })

    it('should remove budget for category', () => {
      useUserStore.getState().setBudget('cat-1', 50000)
      useUserStore.getState().setBudget('cat-2', 30000)
      
      useUserStore.getState().removeBudget('cat-1')
      
      expect(useUserStore.getState().budgets).toEqual({
        'cat-2': 30000,
      })
    })

    it('should handle removing non-existent budget', () => {
      useUserStore.getState().setBudget('cat-1', 50000)
      useUserStore.getState().removeBudget('non-existent')
      
      expect(useUserStore.getState().budgets).toEqual({
        'cat-1': 50000,
      })
    })
  })

  describe('Exchange Rate', () => {
    it('should have default exchange rate of 1000', () => {
      expect(useUserStore.getState().exchangeRate).toBe(1000)
    })

    it('should set exchange rate', () => {
      useUserStore.getState().setExchangeRate(1200)
      expect(useUserStore.getState().exchangeRate).toBe(1200)
    })
  })

  describe('Reset', () => {
    it('should reset all state to defaults', () => {
      // Set various values
      const mockUser = { id: 'user-123', email: 'test@test.com' } as User
      useUserStore.getState().setUser(mockUser)
      useUserStore.getState().toggleShowUsd()
      useUserStore.getState().toggleTheme()
      useUserStore.getState().setMonthlySavingsGoalUSD(1000)
      useUserStore.getState().setBudget('cat-1', 50000)
      useUserStore.getState().setExchangeRate(1200)
      
      // Reset
      useUserStore.getState().resetUser()
      
      // Verify defaults
      const state = useUserStore.getState()
      expect(state.user).toBeNull()
      expect(state.showUsd).toBe(false)
      expect(state.isLightMode).toBe(false)
      expect(state.monthlySavingsGoalUSD).toBe(0)
      expect(state.budgets).toEqual({})
      expect(state.exchangeRate).toBe(1000)
    })
  })
})
