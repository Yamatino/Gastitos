import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { supabase, type Expense } from '../services/supabase'
import { formatCurrency } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Plus, CreditCard, Wallet, TrendingUp, ArrowRightLeft, Download, Search, Target, Repeat, Trash2 } from 'lucide-react'
import { AddExpenseModal } from '../components/AddExpenseModal'
import { AddIncomeModal } from '../components/AddIncomeModal'
import { SummaryView } from '../components/SummaryView'
import { BudgetManager } from '../components/BudgetManager'
import { RecurringManager } from '../components/RecurringManager'

export function Dashboard() {
  const { expenses, setExpenses, categories, setCategories, showUsd, toggleShowUsd, exchangeRate, setExchangeRate, budgets, monthlySavingsGoalUSD } = useAppStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'gastos' | 'resumen'>('gastos')
  const [isBudgetManagerOpen, setIsBudgetManagerOpen] = useState(false)
  const [isRecurringManagerOpen, setIsRecurringManagerOpen] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [showAllTransactions, setShowAllTransactions] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [transactionToDelete, setTransactionToDelete] = useState<Expense | null>(null)
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchExpenses()
    fetchCategories().then(() => checkAndCreateRecurring())
    fetchExchangeRate()
  }, [])

  const fetchExpenses = async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('date', { ascending: false })
      .limit(50)

    if (!error && data) {
      setExpenses(data)
    }
    setIsLoading(false)
  }

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name')

    if (!error && data) {
      setCategories(data)
    }
  }

  const handleDeleteTransaction = async () => {
    if (!transactionToDelete) return
    
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', transactionToDelete.id)
      
      if (error) throw error
      
      // Refresh expenses
      fetchExpenses()
      setDeleteModalOpen(false)
      setTransactionToDelete(null)
    } catch (err) {
      console.error('Error deleting transaction:', err)
      alert('Error al eliminar la transacción')
    }
  }

  const checkAndCreateRecurring = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    
    // Find recurring expenses from last month that don't have a current month entry
    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()
    
    const { data: recurringExpenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('is_recurring', true)
      .eq('user_id', user.id)
    
    if (!recurringExpenses) return
    
    // Group by description to find unique recurring expenses
    const uniqueRecurring = new Map()
    recurringExpenses.forEach(expense => {
      const key = `${expense.description}-${expense.category_id}`
      if (!uniqueRecurring.has(key) || new Date(expense.date + 'T12:00:00') > new Date(uniqueRecurring.get(key).date + 'T12:00:00')) {
        uniqueRecurring.set(key, expense)
      }
    })
    
    // Check if any need to be created for current month
    for (const expense of uniqueRecurring.values()) {
      const expenseDate = new Date(expense.date + 'T12:00:00')
      const isCurrentMonth = expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear
      
      if (!isCurrentMonth) {
        // Create new recurring expense for current month
        const newDate = new Date(currentYear, currentMonth, Math.min(expenseDate.getDate(), 28))
        
        await supabase.from('expenses').insert({
          user_id: user.id,
          description: expense.description,
          amount_cents: expense.amount_cents,
          currency: expense.currency,
          exchange_rate: expense.exchange_rate,
          usd_amount_cents: expense.usd_amount_cents,
          category_id: expense.category_id,
          payment_method: expense.payment_method,
          is_installment: false,
          is_recurring: true,
          date: newDate.toISOString().split('T')[0],
          status: 'paid',
        })
      }
    }
  }

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch('https://api.bluelytics.com.ar/v2/latest')
      if (!response.ok) throw new Error('Failed to fetch exchange rate')
      const data = await response.json()
      
      // Use the official "oficial" rate from BlueLytics
      const oficialRate = data.oficial?.value_sell || data.oficial?.value_avg
      if (oficialRate) {
        setExchangeRate(oficialRate)
      }
    } catch (err) {
      console.error('Error fetching exchange rate:', err)
      // Keep default rate if API fails
    }
  }

  const exportToCSV = () => {
    const headers = ['Fecha', 'Descripción', 'Categoría', 'Monto (ARS)', 'Monto (USD)', 'Método de Pago', 'Tipo']
    const rows = expenses.map(e => {
      const category = categories.find(c => c.id === e.category_id)?.name || 'Sin categoría'
      return [
        e.date,
        e.description,
        category,
        (e.amount_cents / 100).toFixed(2),
        ((e.usd_amount_cents || 0) / 100).toFixed(2),
        e.payment_method === 'credit' ? 'Crédito' : 'Débito',
        e.amount_cents < 0 ? 'Ingreso' : 'Gasto'
      ]
    })
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `gastitos_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Calculate totals
  const monthlyTransactions = expenses.filter(expense => {
    const expenseDate = new Date(expense.date + 'T12:00:00')
    return expenseDate.getMonth() === selectedMonth && expenseDate.getFullYear() === selectedYear
  })

  // Separate income (negative amounts) from expenses (positive amounts)
  const monthlyIncome = monthlyTransactions.filter(t => t.amount_cents < 0)
  const monthlyExpensesList = monthlyTransactions.filter(t => t.amount_cents > 0)

  const totalIncomeArs = monthlyIncome.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0)
  const totalIncomeUsd = monthlyIncome.reduce((sum, t) => sum + Math.abs(t.usd_amount_cents || 0), 0)
  
  const totalExpensesArs = monthlyExpensesList.reduce((sum, t) => sum + t.amount_cents, 0)
  const totalExpensesUsd = monthlyExpensesList.reduce((sum, t) => sum + (t.usd_amount_cents || 0), 0)

  const balanceArs = totalIncomeArs - totalExpensesArs
  const balanceUsd = totalIncomeUsd - totalExpensesUsd
  
  // Calculate savings (Ahorro category)
  const monthlySavings = monthlyTransactions.filter(t => {
    const category = categories.find(c => c.id === t.category_id)
    return category?.type === 'savings'
  })
  const totalSavingsArs = monthlySavings.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0)
  const totalSavingsUsd = monthlySavings.reduce((sum, t) => sum + Math.abs(t.usd_amount_cents || 0), 0)
  
  // Convert savings goal to ARS using exchange rate at month start
  const monthStartRate = exchangeRate || 1000
  const savingsGoalArs = monthlySavingsGoalUSD * monthStartRate * 100 // Convert to cents
  const savingsProgress = savingsGoalArs > 0 ? Math.min((totalSavingsArs / savingsGoalArs) * 100, 100) : 0

  const pendingCuotas = expenses.filter(e => 
    e.is_installment && 
    e.status === 'pending' &&
    new Date(e.date + 'T12:00:00') <= new Date()
  )

  // Filter expenses based on search and selected month/year
  const filteredExpenses = searchQuery
    ? expenses.filter(e => 
        e.description.toLowerCase().includes(searchQuery.toLowerCase()) &&
        new Date(e.date + 'T12:00:00').getMonth() === selectedMonth &&
        new Date(e.date + 'T12:00:00').getFullYear() === selectedYear
      )
    : expenses.filter(e => 
        new Date(e.date + 'T12:00:00').getMonth() === selectedMonth &&
        new Date(e.date + 'T12:00:00').getFullYear() === selectedYear
      )

  // Group installments by installment_group_id for display
  const getGroupedTransactions = () => {
    const grouped = new Map()
    
    filteredExpenses.forEach(expense => {
      if (expense.is_installment && expense.installment_group_id) {
        // Group by installment_group_id
        if (!grouped.has(expense.installment_group_id)) {
          grouped.set(expense.installment_group_id, {
            ...expense,
            _isGrouped: true,
            _installments: []
          })
        }
        grouped.get(expense.installment_group_id)._installments.push(expense)
      } else {
        // Non-installment expense - keep as is
        grouped.set(expense.id, expense)
      }
    })
    
    return Array.from(grouped.values()).map(group => {
      if (group._isGrouped) {
        // Calculate total and find next pending
        const total = group._installments.reduce((sum: number, inst: Expense) => sum + inst.amount_cents, 0)
        const totalUsd = group._installments.reduce((sum: number, inst: Expense) => sum + (inst.usd_amount_cents || 0), 0)
        const nextPending = group._installments
          .filter((inst: Expense) => inst.status === 'pending')
          .sort((a: Expense, b: Expense) => new Date(a.date + 'T12:00:00').getTime() - new Date(b.date + 'T12:00:00').getTime())[0]
        
        return {
          ...group,
          amount_cents: total,
          usd_amount_cents: totalUsd,
          _displayText: `Cuota ${group.installment_number}/${group.total_installments}`,
          _nextPendingDate: nextPending?.date,
          _isInstallmentGroup: true
        }
      }
      return group
    })
  }

  const groupedExpenses = getGroupedTransactions()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-violet-600">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4">
      {/* Tab Navigation */}
      <div className="flex bg-white rounded-xl p-1 shadow-sm border border-violet-100">
        <button
          onClick={() => setActiveTab('gastos')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
            activeTab === 'gastos'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Gastos
        </button>
        <button
          onClick={() => setActiveTab('resumen')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
            activeTab === 'resumen'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Resumen
        </button>
      </div>

      {activeTab === 'gastos' && (
        <div className="space-y-6">
          {/* Total Card */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-violet-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-700">Total del Mes</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleShowUsd}
            className="text-violet-600 border-violet-200"
          >
            <ArrowRightLeft className="w-4 h-4 mr-1" />
            {showUsd ? 'USD' : 'ARS'}
          </Button>
        </div>
        
        <div className="text-center">
          <div className={`text-4xl font-bold mb-1 ${
            balanceArs >= 0 ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {balanceArs >= 0 ? '+' : '−'}
            {showUsd 
              ? formatCurrency(Math.abs(balanceUsd), 'USD') 
              : formatCurrency(Math.abs(balanceArs), 'ARS')
            }
          </div>
          <p className="text-sm text-gray-500">
            Balance del mes
          </p>
        </div>
        
        {/* Income vs Expenses */}
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Ingresos</p>
            <p className="text-lg font-semibold text-emerald-600">
              {showUsd ? formatCurrency(totalIncomeUsd, 'USD') : formatCurrency(totalIncomeArs, 'ARS')}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-1">Gastos</p>
            <p className="text-lg font-semibold text-red-500">
              {showUsd ? formatCurrency(totalExpensesUsd, 'USD') : formatCurrency(totalExpensesArs, 'ARS')}
            </p>
          </div>
        </div>
      </div>

      {/* Savings Card */}
      {monthlySavingsGoalUSD > 0 && (
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">💎</span>
            <h2 className="text-lg font-semibold">Ahorro del Mes</h2>
          </div>
          <div className="text-3xl font-bold mb-3">
            {showUsd 
              ? formatCurrency(totalSavingsUsd, 'USD')
              : formatCurrency(totalSavingsArs, 'ARS')
            }
          </div>
          <div className="flex gap-4 text-sm">
            <div className="bg-white/20 rounded-lg px-3 py-2">
              <span className="opacity-80">Meta:</span>
              <span className="font-semibold ml-1">
                US${monthlySavingsGoalUSD}
              </span>
            </div>
            <div className="bg-white/20 rounded-lg px-3 py-2">
              <span className="opacity-80">Progreso:</span>
              <span className="font-semibold ml-1">
                {savingsProgress.toFixed(0)}%
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3">
            <div className="h-2 bg-white/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${savingsProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-5 h-5" />
            <span className="text-sm font-medium">Cuotas Pendientes</span>
          </div>
          <div className="text-2xl font-bold">{pendingCuotas.length}</div>
          <div className="text-sm opacity-90">
            {formatCurrency(pendingCuotas.reduce((sum, c) => sum + (c.installment_amount_cents || 0), 0), 'ARS')}
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5" />
            <span className="text-sm font-medium">Gastos Hoy</span>
          </div>
          <div className="text-2xl font-bold">
            {expenses.filter(e => {
              const today = new Date().toISOString().split('T')[0]
              return e.date === today
            }).length}
          </div>
          <div className="text-sm opacity-90">transacciones</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Button
          onClick={() => setIsIncomeModalOpen(true)}
          variant="outline"
          className="bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 py-3"
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Agregar Ingreso
        </Button>
        <Button
          onClick={() => setIsBudgetManagerOpen(true)}
          variant="outline"
          className="bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 py-3"
        >
          <Target className="w-4 h-4 mr-2" />
          Presupuestos
        </Button>
        <Button
          onClick={() => setIsRecurringManagerOpen(true)}
          variant="outline"
          className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 py-3"
        >
          <Repeat className="w-4 h-4 mr-2" />
          Recurrentes
        </Button>
      </div>

      {/* Budget Progress */}
      {Object.keys(budgets).length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-lg border border-violet-100">
          <h3 className="font-semibold text-gray-700 mb-3">Presupuestos</h3>
          <div className="space-y-3">
            {Object.entries(budgets).slice(0, 3).map(([categoryId, budgetAmount]) => {
              const category = categories.find(c => c.id === categoryId)
              if (!category) return null
              
              const spent = expenses
                .filter(e => {
                  const date = new Date(e.date + 'T12:00:00')
                  return e.category_id === categoryId && 
                         date.getMonth() === selectedMonth && 
                         date.getFullYear() === selectedYear && 
                         e.amount_cents > 0
                })
                .reduce((sum, e) => sum + e.amount_cents, 0)
              
              const percentage = Math.min((spent / budgetAmount) * 100, 100)
              const isOverBudget = spent > budgetAmount
              
              return (
                <div key={categoryId}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="flex items-center gap-1">
                      <span>{category.icon}</span>
                      <span className="text-gray-700">{category.name}</span>
                    </span>
                    <span className={`font-semibold ${isOverBudget ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(spent, 'ARS')} / {formatCurrency(budgetAmount, 'ARS')}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        isOverBudget ? 'bg-red-500' : percentage > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Search and Export Bar */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar gastos..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <Button
          onClick={exportToCSV}
          variant="outline"
          className="px-4"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar
        </Button>
      </div>

      {/* Month Selector */}
      <div className="flex gap-3 items-center">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
          className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i}>
              {new Date(2024, i).toLocaleDateString('es-AR', { month: 'long' })}
            </option>
          ))}
        </select>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
        >
          {[2024, 2025, 2026].map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <Button
          variant="outline"
          onClick={() => setShowAllTransactions(!showAllTransactions)}
          className="whitespace-nowrap"
        >
          {showAllTransactions ? 'Ver menos' : 'Ver todos'}
        </Button>
      </div>

      {/* Recent Expenses */}
      <div className="bg-white rounded-2xl shadow-lg border border-violet-100 overflow-hidden">
        <div className="p-4 border-b border-violet-100">
          <h3 className="font-semibold text-gray-700">Transacciones Recientes</h3>
        </div>
        
        {expenses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Wallet className="w-12 h-12 mx-auto mb-3 text-violet-300" />
            <p>No hay gastos registrados</p>
            <p className="text-sm mt-1">¡Agrega tu primer gasto!</p>
          </div>
        ) : (
          <div className="divide-y divide-violet-50">
             {(showAllTransactions ? groupedExpenses : groupedExpenses.slice(0, 8)).map((expense) => (
              <div 
                key={expense.id} 
                className="p-4 flex items-center justify-between hover:bg-violet-50/50 cursor-pointer relative group"
                onContextMenu={(e) => {
                  e.preventDefault()
                  setTransactionToDelete(expense)
                  setDeleteModalOpen(true)
                }}
                onTouchStart={() => {
                  const timer = setTimeout(() => {
                    setTransactionToDelete(expense)
                    setDeleteModalOpen(true)
                  }, 800)
                  setLongPressTimer(timer)
                }}
                onTouchEnd={() => {
                  if (longPressTimer) {
                    clearTimeout(longPressTimer)
                    setLongPressTimer(null)
                  }
                }}
                onMouseDown={() => {
                  const timer = setTimeout(() => {
                    setTransactionToDelete(expense)
                    setDeleteModalOpen(true)
                  }, 800)
                  setLongPressTimer(timer)
                }}
                onMouseUp={() => {
                  if (longPressTimer) {
                    clearTimeout(longPressTimer)
                    setLongPressTimer(null)
                  }
                }}
                onMouseLeave={() => {
                  if (longPressTimer) {
                    clearTimeout(longPressTimer)
                    setLongPressTimer(null)
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  {(() => {
                    const category = categories.find(c => c.id === expense.category_id)
                    return (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                        style={{
                          backgroundColor: category?.color ? `${category.color}20` : '#e5e7eb',
                          color: category?.color || '#6b7280'
                        }}
                      >
                        {category?.icon || '📦'}
                      </div>
                    )
                  })()}
                  <div>
                    <p className="font-medium text-gray-900">
                      {expense._isInstallmentGroup
                        ? expense.description.replace(/\s*\(\d+\/\d+\)$/, '') // Remove (X/Y) from description
                        : expense.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(() => {
                        const category = categories.find(c => c.id === expense.category_id)
                        return category?.name || 'Sin categoría'
                      })()} • {new Date(expense.date + 'T12:00:00').toLocaleDateString('es-AR')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${
                    expense.amount_cents < 0 ? 'text-emerald-600' : 'text-violet-600'
                  }`}>
                    {expense.amount_cents < 0 ? '+' : ''}
                    {showUsd 
                      ? formatCurrency(Math.abs(expense.usd_amount_cents || 0), 'USD') 
                      : formatCurrency(Math.abs(expense.amount_cents), 'ARS')
                    }
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-20">
        <Button
          onClick={() => setIsModalOpen(true)}
          size="lg"
          className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg hover:shadow-xl transition-all"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Add Expense Modal */}
      <AddExpenseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchExpenses}
        categories={categories}
        exchangeRate={exchangeRate}
      />

      {/* Add Income Modal */}
      <AddIncomeModal
        isOpen={isIncomeModalOpen}
        onClose={() => setIsIncomeModalOpen(false)}
        onSuccess={fetchExpenses}
        categories={categories}
        exchangeRate={exchangeRate}
      />

      {/* Budget Manager */}
      <BudgetManager
        isOpen={isBudgetManagerOpen}
        onClose={() => setIsBudgetManagerOpen(false)}
      />

      {/* Recurring Manager */}
      <RecurringManager
        isOpen={isRecurringManagerOpen}
        onClose={() => setIsRecurringManagerOpen(false)}
      />

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && transactionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteModalOpen(false)} />
          <div className="relative bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Eliminar transacción</h3>
            <p className="text-gray-600 mb-4">
              ¿Estás seguro de que quieres eliminar "{transactionToDelete.description}" por {formatCurrency(Math.abs(transactionToDelete.amount_cents), 'ARS')}?
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleDeleteTransaction}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
      </div>
      )}

      {activeTab === 'resumen' && <SummaryView />}
    </div>
  )
}
