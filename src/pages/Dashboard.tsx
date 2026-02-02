import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { supabase, type Expense } from '../services/supabase'
import { formatCurrency } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Plus, CreditCard, Wallet, TrendingUp, ArrowRightLeft, Download, Search, Target, Repeat, Eye, EyeOff, DollarSign } from 'lucide-react'
import { AddExpenseModal } from '../components/AddExpenseModal'
import { AddIncomeModal } from '../components/AddIncomeModal'
import { SummaryView } from '../components/SummaryView'
import { BudgetManager } from '../components/BudgetManager'
import { RecurringManager } from '../components/RecurringManager'

export function Dashboard() {
  const { expenses, setExpenses, categories, setCategories, showUsd, toggleShowUsd, exchangeRate, setExchangeRate, budgets, monthlySavingsGoalUSD, hideTotalAmount, toggleHideTotalAmount } = useAppStore()
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
  const [showInstallments, setShowInstallments] = useState(false)
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
  // Exclude savings from both income and expenses - they only count in savings section
  const monthlyIncome = monthlyTransactions.filter(t => {
    const category = categories.find(c => c.id === t.category_id)
    return t.amount_cents < 0 && category?.type !== 'savings'
  })
  const monthlyExpensesList = monthlyTransactions.filter(t => {
    const category = categories.find(c => c.id === t.category_id)
    return t.amount_cents > 0 && category?.type !== 'savings'
  })

  const totalIncomeArs = monthlyIncome.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0)
  const totalIncomeUsd = monthlyIncome.reduce((sum, t) => sum + Math.abs(t.usd_amount_cents || 0), 0)
  
  const totalExpensesArs = monthlyExpensesList.reduce((sum, t) => sum + t.amount_cents, 0)
  const totalExpensesUsd = monthlyExpensesList.reduce((sum, t) => sum + (t.usd_amount_cents || 0), 0)
  
  // Calculate savings (Ahorro category)
  const monthlySavings = monthlyTransactions.filter(t => {
    const category = categories.find(c => c.id === t.category_id)
    return category?.type === 'savings'
  })
  const totalSavingsArs = monthlySavings.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0)
  const totalSavingsUsd = monthlySavings.reduce((sum, t) => sum + Math.abs(t.usd_amount_cents || 0), 0)
  
  // Calculate balance (income - expenses - savings)
  const balanceArs = totalIncomeArs - totalExpensesArs - totalSavingsArs
  const balanceUsd = totalIncomeUsd - totalExpensesUsd - totalSavingsUsd
  
  // Convert savings goal to ARS using exchange rate at month start
  const monthStartRate = exchangeRate || 1000
  const savingsGoalArs = monthlySavingsGoalUSD * monthStartRate * 100 // Convert to cents
  const savingsProgress = savingsGoalArs > 0 ? Math.min((totalSavingsArs / savingsGoalArs) * 100, 100) : 0

  const pendingCuotas = expenses.filter(e => 
    e.is_installment && 
    e.status === 'pending'
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
      <div className="flex bg-card rounded-xl p-1 shadow-lg border border-border">
        <button
          onClick={() => setActiveTab('gastos')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
            activeTab === 'gastos'
              ? 'bg-primary text-primary-foreground shadow-lg glow-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          Gastos
        </button>
        <button
          onClick={() => setActiveTab('resumen')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
            activeTab === 'resumen'
              ? 'bg-primary text-primary-foreground shadow-lg glow-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          Resumen
        </button>
      </div>

      {activeTab === 'gastos' && (
        <div className="space-y-6">
          {/* Total Card */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Total del Mes</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleHideTotalAmount}
              className="text-primary border-primary/30 hover:bg-primary/10"
              title={hideTotalAmount ? 'Mostrar montos' : 'Ocultar montos'}
            >
              {hideTotalAmount ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleShowUsd}
              className="text-primary border-primary/30 hover:bg-primary/10"
            >
              <ArrowRightLeft className="w-4 h-4 mr-1" />
              {showUsd ? 'USD' : 'ARS'}
            </Button>
          </div>
        </div>
        
        <div className="text-center">
          <div className={`text-4xl font-bold mb-1 font-mono-amount ${
            balanceArs >= 0 ? 'text-success glow-success' : 'text-destructive glow-destructive'
          }`}>
            {hideTotalAmount ? (
              '****'
            ) : (
              <>
                {balanceArs >= 0 ? '+' : '−'}
                {showUsd 
                  ? formatCurrency(Math.abs(balanceUsd), 'USD') 
                  : formatCurrency(Math.abs(balanceArs), 'ARS')
                }
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Balance del mes
          </p>
        </div>
        
        {/* Income vs Expenses */}
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Ingresos</p>
            <p className="text-lg font-semibold text-success font-mono-amount">
              {hideTotalAmount ? '****' : (showUsd ? formatCurrency(totalIncomeUsd, 'USD') : formatCurrency(totalIncomeArs, 'ARS'))}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Gastos</p>
            <p className="text-lg font-semibold text-destructive font-mono-amount">
              {hideTotalAmount ? '****' : (showUsd ? formatCurrency(totalExpensesUsd, 'USD') : formatCurrency(totalExpensesArs, 'ARS'))}
            </p>
          </div>
        </div>
      </div>

      {/* Savings Card */}
      {monthlySavingsGoalUSD > 0 && (
        <div className="glass-card rounded-2xl p-6 border border-primary/20">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-primary/20 rounded-lg">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Ahorro del Mes</h2>
          </div>
          <div className="text-3xl font-bold mb-3 text-foreground font-mono-amount">
            {showUsd 
              ? formatCurrency(totalSavingsUsd, 'USD')
              : formatCurrency(totalSavingsArs, 'ARS')
            }
          </div>
          <div className="flex gap-4 text-sm">
            <div className="bg-muted rounded-lg px-3 py-2">
              <span className="text-muted-foreground">Meta:</span>
              <span className="font-semibold ml-1 text-foreground">
                US${monthlySavingsGoalUSD}
              </span>
            </div>
            <div className="bg-muted rounded-lg px-3 py-2">
              <span className="text-muted-foreground">Progreso:</span>
              <span className="font-semibold ml-1 text-foreground">
                {savingsProgress.toFixed(0)}%
              </span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all shimmer"
                style={{ width: `${savingsProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-4 border border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-primary/20 rounded-lg">
              <CreditCard className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Cuotas Pendientes</span>
          </div>
          <div className="text-2xl font-bold text-foreground">{pendingCuotas.length}</div>
          <div className="text-sm text-muted-foreground font-mono-amount">
            {formatCurrency(pendingCuotas.reduce((sum, c) => sum + (c.installment_amount_cents || 0), 0), 'ARS')}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-success/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-success/20 rounded-lg">
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Gastos Hoy</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {(() => {
              const today = new Date()
              const year = today.getFullYear()
              const month = String(today.getMonth() + 1).padStart(2, '0')
              const day = String(today.getDate()).padStart(2, '0')
              const todayStr = `${year}-${month}-${day}`
              return expenses.filter(e => e.date === todayStr).length
            })()}
          </div>
          <div className="text-sm text-muted-foreground">transacciones</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Button
          onClick={() => setIsIncomeModalOpen(true)}
          variant="outline"
          className="border-success/30 text-success hover:bg-success/10 hover:text-success py-3"
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Agregar Ingreso
        </Button>
        <Button
          onClick={() => setIsBudgetManagerOpen(true)}
          variant="outline"
          className="border-warning/30 text-warning hover:bg-warning/10 hover:text-warning py-3"
        >
          <Target className="w-4 h-4 mr-2" />
          Presupuestos
        </Button>
        <Button
          onClick={() => setIsRecurringManagerOpen(true)}
          variant="outline"
          className="border-primary/30 text-primary hover:bg-primary/10 hover:text-primary py-3"
        >
          <Repeat className="w-4 h-4 mr-2" />
          Recurrentes
        </Button>
      </div>

      {/* Budget Progress */}
      {Object.keys(budgets).length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <h3 className="font-semibold text-foreground mb-3">Presupuestos</h3>
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
                      <span className="text-foreground">{category.name}</span>
                    </span>
                    <span className={`font-semibold font-mono-amount ${isOverBudget ? 'text-destructive' : 'text-foreground'}`}>
                      {formatCurrency(spent, 'ARS')} / {formatCurrency(budgetAmount, 'ARS')}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        isOverBudget ? 'bg-destructive' : percentage > 80 ? 'bg-warning' : 'bg-success'
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar gastos..."
            className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <Button
          onClick={exportToCSV}
          variant="outline"
          className="px-4 border-border hover:bg-muted"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar
        </Button>
      </div>

      {/* Month Selector */}
      <div className="flex gap-3 items-center flex-wrap">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
          className="flex-1 px-4 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground min-w-[120px]"
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
          className="px-4 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
        >
          {[2024, 2025, 2026].map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <Button
          variant="outline"
          onClick={() => setShowAllTransactions(!showAllTransactions)}
          className="whitespace-nowrap border-border hover:bg-muted"
        >
          {showAllTransactions ? 'Ver menos' : 'Ver todos'}
        </Button>
        <label className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-xl cursor-pointer hover:bg-primary/20 transition-colors">
          <input
            type="checkbox"
            checked={showInstallments}
            onChange={(e) => setShowInstallments(e.target.checked)}
            className="w-4 h-4 text-primary rounded focus:ring-primary bg-background border-input"
          />
          <span className="text-sm font-medium text-primary">Ver cuotas</span>
        </label>
      </div>

      {/* Recent Expenses */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Transacciones Recientes</h3>
        </div>
        
        {expenses.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Wallet className="w-12 h-12 mx-auto mb-3 text-primary/30" />
            <p>No hay gastos registrados</p>
            <p className="text-sm mt-1">¡Agrega tu primer gasto!</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
             {(showAllTransactions 
               ? groupedExpenses.filter(e => showInstallments || !e._isInstallmentGroup)
               : groupedExpenses.filter(e => showInstallments || !e._isInstallmentGroup).slice(0, 8)
             ).map((expense) => (
              <div 
                key={expense.id} 
                className={`p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer relative group transition-colors ${
                  expense._isInstallmentGroup ? 'border-l-4 border-l-primary bg-primary/5' : ''
                }`}
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
                          backgroundColor: category?.color ? `${category.color}30` : 'hsl(var(--muted))',
                          color: category?.color || 'hsl(var(--muted-foreground))'
                        }}
                      >
                        {category?.icon || '📦'}
                      </div>
                    )
                  })()}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">
                        {expense._isInstallmentGroup
                          ? expense.description.replace(/\s*\(\d+\/\d+\)$/, '') // Remove (X/Y) from description
                          : expense.description}
                      </p>
                      {expense._isInstallmentGroup && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                          Cuota {expense.installment_number}/{expense.total_installments}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const category = categories.find(c => c.id === expense.category_id)
                        return category?.name || 'Sin categoría'
                      })()} • {new Date(expense.date + 'T12:00:00').toLocaleDateString('es-AR')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold font-mono-amount ${
                    expense.amount_cents < 0 ? 'text-success' : 'text-primary'
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
          className="w-14 h-14 rounded-full bg-primary hover:opacity-90 text-primary-foreground shadow-lg glow-primary transition-all"
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
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteModalOpen(false)} />
          <div className="relative glass-card rounded-2xl p-6 shadow-2xl max-w-sm w-full border border-border">
            <h3 className="text-lg font-bold text-foreground mb-2">Eliminar transacción</h3>
            <p className="text-muted-foreground mb-4">
              ¿Estás seguro de que quieres eliminar "{transactionToDelete.description}"?
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1 border-border hover:bg-muted"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleDeleteTransaction}
                className="flex-1 bg-destructive hover:opacity-90 text-destructive-foreground"
              >
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
