import { useState, useEffect } from 'react'
import { useUserStore } from '../stores/userStore'
import { useDataStore } from '../stores/dataStore'
import { useUIStore } from '../stores/uiStore'
import { supabase, type Expense } from '../services/supabase'
import { formatCurrency } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Plus, CreditCard, Wallet, TrendingUp, ArrowRightLeft, Search, Eye, EyeOff } from 'lucide-react'
import { AddTransactionModal } from '../components/AddTransactionModal'
import { MoreActionsMenu } from '../components/MoreActionsMenu'
import { SummaryView } from '../components/SummaryView'
import { BudgetManager } from '../components/BudgetManager'
import { RecurringManager } from '../components/RecurringManager'

export function Dashboard() {
  // User store
  const { 
    showUsd, 
    toggleShowUsd, 
    hideTotalAmount, 
    toggleHideTotalAmount
  } = useUserStore()
  
  // Data store
  const { 
    expenses, 
    categories,
    fetchExpenses: dataFetchExpenses,
    fetchCategories: dataFetchCategories
  } = useDataStore()
  
  // UI store
  const { 
    isTransactionModalOpen, 
    setIsTransactionModalOpen,
    isBudgetManagerOpen,
    setIsBudgetManagerOpen,
    isRecurringManagerOpen,
    setIsRecurringManagerOpen,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    selectedMonth,
    setSelectedMonth,
    selectedYear,
    setSelectedYear,
    showAllTransactions,
    setShowAllTransactions,
    showInstallments,
    setShowInstallments,
    isLoading,
    setIsLoading
  } = useUIStore()

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [transactionToDelete, setTransactionToDelete] = useState<Expense | null>(null)
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        console.log('Loading data for user:', user.id)
        await dataFetchExpenses(user.id)
        await dataFetchCategories(user.id)
        await checkAndCreateRecurring(user.id)
      } else {
        console.log('No user found, skipping data load')
      }
    } catch (error) {
      console.error('Error loading data:', error)
      alert('Error al cargar datos. Por favor recarga la página.')
    } finally {
      setIsLoading(false)
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
      
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await dataFetchExpenses(user.id)
      }
      setDeleteModalOpen(false)
      setTransactionToDelete(null)
    } catch (err) {
      console.error('Error deleting transaction:', err)
      alert('Error al eliminar la transacción')
    }
  }

  const checkAndCreateRecurring = async (userId: string) => {
    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()
    
    const { data: recurringExpenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('is_recurring', true)
      .eq('user_id', userId)
    
    if (!recurringExpenses) return
    
    const uniqueRecurring = new Map()
    recurringExpenses.forEach(expense => {
      const key = `${expense.description}-${expense.category_id}`
      if (!uniqueRecurring.has(key) || new Date(expense.date + 'T12:00:00') > new Date(uniqueRecurring.get(key).date + 'T12:00:00')) {
        uniqueRecurring.set(key, expense)
      }
    })
    
    for (const expense of uniqueRecurring.values()) {
      const expenseDate = new Date(expense.date + 'T12:00:00')
      const isCurrentMonth = expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear
      
      if (!isCurrentMonth) {
        const newDate = new Date(currentYear, currentMonth, Math.min(expenseDate.getDate(), 28))
        
        await supabase.from('expenses').insert({
          user_id: userId,
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
          transaction_type: 'expense',
          is_salary: false
        })
      }
    }
  }

  const exportToCSV = () => {
    const headers = ['Fecha', 'Descripción', 'Categoría', 'Monto (ARS)', 'Monto (USD)', 'Método de Pago', 'Tipo']
    const rows = expenses.map(e => {
      const category = categories.find(c => c.id === e.category_id)?.name || 'Sin categoría'
      let typeLabel = 'Gasto'
      if (e.transaction_type === 'income') typeLabel = e.is_salary ? 'Salario' : 'Ingreso'
      if (e.transaction_type === 'savings') typeLabel = 'Ahorro'
      
      return [
        e.date,
        e.description,
        category,
        (Math.abs(e.amount_cents) / 100).toFixed(2),
        ((e.usd_amount_cents || 0) / 100).toFixed(2),
        e.payment_method === 'credit' ? 'Crédito' : 'Débito',
        typeLabel
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

  const monthlyIncome = monthlyTransactions.filter(t => t.transaction_type === 'income')
  const monthlyExpensesList = monthlyTransactions.filter(t => t.transaction_type === 'expense')
  const monthlySavings = monthlyTransactions.filter(t => t.transaction_type === 'savings')

  const totalIncomeArs = monthlyIncome.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0)
  const totalIncomeUsd = monthlyIncome.reduce((sum, t) => sum + Math.abs(t.usd_amount_cents || 0), 0)
  
  const totalExpensesArs = monthlyExpensesList.reduce((sum, t) => sum + t.amount_cents, 0)
  const totalExpensesUsd = monthlyExpensesList.reduce((sum, t) => sum + (t.usd_amount_cents || 0), 0)
  
  const totalSavingsArs = monthlySavings.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0)
  const totalSavingsUsd = monthlySavings.reduce((sum, t) => sum + Math.abs(t.usd_amount_cents || 0), 0)
  
  const balanceArs = totalIncomeArs - totalExpensesArs - totalSavingsArs
  const balanceUsd = totalIncomeUsd - totalExpensesUsd - totalSavingsUsd

  const pendingCuotas = expenses.filter(e => 
    e.is_installment && 
    e.status === 'pending'
  )

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

  const getGroupedTransactions = () => {
    const grouped = new Map()
    
    filteredExpenses.forEach(expense => {
      if (expense.is_installment && expense.installment_group_id) {
        if (!grouped.has(expense.installment_group_id)) {
          grouped.set(expense.installment_group_id, {
            ...expense,
            _isGrouped: true,
            _installments: []
          })
        }
        grouped.get(expense.installment_group_id)._installments.push(expense)
      } else {
        grouped.set(expense.id, expense)
      }
    })
    
    return Array.from(grouped.values()).map(group => {
      if (group._isGrouped) {
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

  // Get badge for transaction type
  const getTransactionBadge = (expense: Expense) => {
    if (expense.transaction_type === 'income') {
      return expense.is_salary ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success">
          💰 Salario
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/20 text-success">
          📥 Ingreso
        </span>
      )
    }
    if (expense.transaction_type === 'savings') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
          💎 Ahorro
        </span>
      )
    }
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-violet-600">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto px-4 pb-24">
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
        <div className="space-y-4">
          {/* Total Card */}
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
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
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Ingresos</p>
                <p className="text-base font-semibold text-success font-mono-amount">
                  {hideTotalAmount ? '****' : (showUsd ? formatCurrency(totalIncomeUsd, 'USD') : formatCurrency(totalIncomeArs, 'ARS'))}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Gastos</p>
                <p className="text-base font-semibold text-destructive font-mono-amount">
                  {hideTotalAmount ? '****' : (showUsd ? formatCurrency(totalExpensesUsd, 'USD') : formatCurrency(totalExpensesArs, 'ARS'))}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Ahorro</p>
                <p className="text-base font-semibold text-primary font-mono-amount">
                  {hideTotalAmount ? '****' : (showUsd ? formatCurrency(totalSavingsUsd, 'USD') : formatCurrency(totalSavingsArs, 'ARS'))}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats - Compact Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card rounded-xl p-3 border border-primary/20">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/20 rounded-lg">
                  <CreditCard className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Cuotas Pendientes</span>
                  <span className="text-lg font-bold text-foreground">{pendingCuotas.length}</span>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-xl p-3 border border-success/20">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-success/20 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-success" />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Gastos Hoy</span>
                  <span className="text-lg font-bold text-foreground">
                    {(() => {
                      const today = new Date()
                      const year = today.getFullYear()
                      const month = String(today.getMonth() + 1).padStart(2, '0')
                      const day = String(today.getDate()).padStart(2, '0')
                      const todayStr = `${year}-${month}-${day}`
                      return expenses.filter(e => e.date === todayStr).length
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Search Bar with More Actions */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar transacciones..."
                className="w-full pl-10 pr-4 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <MoreActionsMenu
              onBudgetsClick={() => setIsBudgetManagerOpen(true)}
              onRecurringClick={() => setIsRecurringManagerOpen(true)}
              onExportClick={exportToCSV}
            />
          </div>

          {/* Month Selector */}
          <div className="flex gap-2 items-center">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="flex-1 px-3 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-sm"
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
              className="px-3 py-2 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-sm"
            >
              {[2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllTransactions(!showAllTransactions)}
              className="whitespace-nowrap border-border hover:bg-muted text-sm"
            >
              {showAllTransactions ? 'Ver menos' : 'Ver todos'}
            </Button>
          </div>

          {/* Show Installments Toggle */}
          <label className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/30 rounded-xl cursor-pointer hover:bg-primary/20 transition-colors w-fit">
            <input
              type="checkbox"
              checked={showInstallments}
              onChange={(e) => setShowInstallments(e.target.checked)}
              className="w-4 h-4 text-primary rounded focus:ring-primary bg-background border-input"
            />
            <span className="text-sm font-medium text-primary">Ver cuotas</span>
          </label>

          {/* Recent Expenses */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Transacciones Recientes</h3>
            </div>
            
            {expenses.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Wallet className="w-12 h-12 mx-auto mb-3 text-primary/30" />
                <p>No hay transacciones registradas</p>
                <p className="text-sm mt-1">¡Agrega tu primera transacción!</p>
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
                        // Determine icon and color based on transaction type
                        let icon = category?.icon || '📦'
                        let color = category?.color || '#6B7280'
                        
                        if (expense.transaction_type === 'income') {
                          icon = expense.is_salary ? '💰' : '📥'
                          color = '#10B981'
                        } else if (expense.transaction_type === 'savings') {
                          icon = '💎'
                          color = '#3B82F6'
                        }
                        
                        return (
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                            style={{
                              backgroundColor: `${color}30`,
                              color: color
                            }}
                          >
                            {icon}
                          </div>
                        )
                      })()}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground">
                            {expense._isInstallmentGroup
                              ? expense.description.replace(/\s*\(\d+\/\d+\)$/, '')
                              : expense.description}
                          </p>
                          {expense._isInstallmentGroup && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                              Cuota {expense.installment_number}/{expense.total_installments}
                            </span>
                          )}
                          {getTransactionBadge(expense)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(() => {
                            if (expense.transaction_type === 'income') {
                              return expense.is_salary ? 'Salario' : 'Ingreso'
                            }
                            if (expense.transaction_type === 'savings') {
                              return 'Ahorro'
                            }
                            const category = categories.find(c => c.id === expense.category_id)
                            return category?.name || 'Sin categoría'
                          })()} • {new Date(expense.date + 'T12:00:00').toLocaleDateString('es-AR')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold font-mono-amount ${
                        expense.transaction_type === 'income' ? 'text-success' : 
                        expense.transaction_type === 'savings' ? 'text-primary' : 'text-destructive'
                      }`}>
                        {expense.transaction_type === 'income' ? '+' : ''}
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
              onClick={() => setIsTransactionModalOpen(true)}
              size="lg"
              className="w-14 h-14 rounded-full bg-primary hover:opacity-90 text-primary-foreground shadow-lg glow-primary transition-all"
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>

          {/* Add Transaction Modal */}
          <AddTransactionModal
            isOpen={isTransactionModalOpen}
            onClose={() => setIsTransactionModalOpen(false)}
            onSuccess={loadData}
            categories={categories}
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
