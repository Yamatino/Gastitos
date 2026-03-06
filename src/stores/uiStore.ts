import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  // Loading states
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  
  // Modals
  isSettingsOpen: boolean
  setIsSettingsOpen: (open: boolean) => void
  
  isBudgetManagerOpen: boolean
  setIsBudgetManagerOpen: (open: boolean) => void
  
  // Transaction modal
  isTransactionModalOpen: boolean
  setIsTransactionModalOpen: (open: boolean) => void
  
  // View states
  activeTab: 'gastos' | 'resumen'
  setActiveTab: (tab: 'gastos' | 'resumen') => void
  
  showAllTransactions: boolean
  setShowAllTransactions: (show: boolean) => void
  
  showInstallments: boolean
  setShowInstallments: (show: boolean) => void
  
  // Search
  searchQuery: string
  setSearchQuery: (query: string) => void
  
  // Filters
  selectedMonth: number
  setSelectedMonth: (month: number) => void
  
  selectedYear: number
  setSelectedYear: (year: number) => void
  
  // Reset all UI state
  resetUI: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Loading
      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),
      
      // Modals
      isSettingsOpen: false,
      setIsSettingsOpen: (open) => set({ isSettingsOpen: open }),
      
      isBudgetManagerOpen: false,
      setIsBudgetManagerOpen: (open) => set({ isBudgetManagerOpen: open }),
      
      isTransactionModalOpen: false,
      setIsTransactionModalOpen: (open) => set({ isTransactionModalOpen: open }),
      
      // View states
      activeTab: 'gastos',
      setActiveTab: (tab) => set({ activeTab: tab }),
      
      showAllTransactions: false,
      setShowAllTransactions: (show) => set({ showAllTransactions: show }),
      
      showInstallments: false,
      setShowInstallments: (show) => set({ showInstallments: show }),
      
      // Search
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
      
      // Filters
      selectedMonth: new Date().getMonth(),
      setSelectedMonth: (month) => set({ selectedMonth: month }),
      
      selectedYear: new Date().getFullYear(),
      setSelectedYear: (year) => set({ selectedYear: year }),
      
      // Reset
      resetUI: () => set({
        isLoading: false,
        isSettingsOpen: false,
        isBudgetManagerOpen: false,
        isTransactionModalOpen: false,
        activeTab: 'gastos',
        showAllTransactions: false,
        showInstallments: false,
        searchQuery: '',
        selectedMonth: new Date().getMonth(),
        selectedYear: new Date().getFullYear(),
      }),
    }),
    {
      name: 'gastitos-ui-storage',
      partialize: (state) => ({
        activeTab: state.activeTab,
        selectedMonth: state.selectedMonth,
        selectedYear: state.selectedYear,
        showInstallments: state.showInstallments,
      }),
    }
  )
)
