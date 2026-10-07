import { useState, useEffect, useRef } from 'react'
import { useUserStore } from '../stores/userStore'
import { useDataStore } from '../stores/dataStore'
import { useUIStore } from '../stores/uiStore'
import { supabase, type Expense } from '../services/supabase'
import { formatCurrency, toUsdCents } from '../lib/utils'
import { toDateKey } from '../lib/dateBuckets'
import { isInstallmentPending } from '../lib/installments'
import { Button } from '../components/ui/button'
import { Plus, CreditCard, Wallet, TrendingUp, ArrowRightLeft, Search, Eye, EyeOff, Pencil, Trash2, ChevronLeft, ChevronRight, EllipsisVertical } from 'lucide-react'
import { AddTransactionModal } from '../components/AddTransactionModal'
import { MoreActionsMenu } from '../components/MoreActionsMenu'
import { SummaryView } from '../components/SummaryView'
import { BudgetManager } from '../components/BudgetManager'
import { useToastStore } from '../stores/toastStore'


export function Dashboard() {
  // User store
  const { 
    user: currentUser,
    showUsd, 
    toggleShowUsd, 
    hideTotalAmount, 
    toggleHideTotalAmount,
    exchangeRate
  } = useUserStore()
  
  // Data store
  const { 
    expenses, 
    categories,
    loadError
  } = useDataStore()
  
  // UI store
  const { 
    isTransactionModalOpen, 
    setIsTransactionModalOpen,
    isBudgetManagerOpen,
    setIsBudgetManagerOpen,

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
    setShowInstallments
  } = useUIStore()

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [transactionToDelete, setTransactionToDelete] = useState<Expense | null>(null)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [pendingDeleteKeys, setPendingDeleteKeys] = useState<Set<string>>(new Set())
  const pendingDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [rowMenu, setRowMenu] = useState<{ expense: Expense & { _isInstallmentGroup?: boolean }; x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowMenuRef = useRef<HTMLDivElement | null>(null)
  // The ⋯ button that opened the menu, to give focus back to it on close
  const rowMenuTrigger = useRef<HTMLElement | null>(null)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  // Get store references
  const dataStore = useDataStore()

  // Track previous user ID to prevent unnecessary re-runs
  const prevUserIdRef = useRef<string | undefined>(undefined)
  const [isLocalLoading, setIsLocalLoading] = useState(false)
  
  const loadData = (userId: string) => {
    setIsLocalLoading(true)
    dataStore.loadUserData(userId)
      .catch((error) => {
        // loadError in the store drives the retry screen below
        console.error('Error loading data:', error)
      })
      .finally(() => {
        setIsLocalLoading(false)
      })
  }

  // Load data when user ID changes
  useEffect(() => {
    const userId = currentUser?.id
    
    // Only run if userId changed
    if (userId && userId !== prevUserIdRef.current) {
      prevUserIdRef.current = userId
      loadData(userId)
    }
  }, [currentUser?.id])

  // Background refresh after saving a transaction. The store already holds the
  // saved row; if this refresh fails it keeps the current list and shows a toast.
  const reloadData = async () => {
    if (!currentUser?.id) return
    await dataStore.fetchExpenses(currentUser.id)
  }

  const commitDeleteTransaction = async (transaction: Expense) => {
    try {
      const isGroup = (transaction as Expense & { _isInstallmentGroup?: boolean })._isInstallmentGroup
      const query = supabase.from('expenses').delete()
      const { error } = isGroup && transaction.installment_group_id
        ? await query.eq('installment_group_id', transaction.installment_group_id)
        : await query.eq('id', transaction.id)

      if (error) throw error

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await dataStore.fetchExpenses(user.id)
      }
    } catch (err) {
      console.error('Error deleting transaction:', err)
      useToastStore.getState().addToast('Error al eliminar la transacción')
    }
  }

  // Soft delete: hide the row immediately and give the user a few seconds to undo
  // before the deletion actually hits the database.
  const handleDeleteTransaction = () => {
    if (!transactionToDelete) return

    const transaction = transactionToDelete
    const isGroup = (transaction as Expense & { _isInstallmentGroup?: boolean })._isInstallmentGroup
    const key = isGroup && transaction.installment_group_id ? transaction.installment_group_id : transaction.id

    setPendingDeleteKeys(prev => new Set(prev).add(key))
    setDeleteModalOpen(false)
    setTransactionToDelete(null)

    const timer = setTimeout(() => {
      pendingDeleteTimers.current.delete(key)
      commitDeleteTransaction(transaction)
      setPendingDeleteKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }, 5000)
    pendingDeleteTimers.current.set(key, timer)

    useToastStore.getState().addToast(
      isGroup ? 'Cuotas eliminadas' : 'Transacción eliminada',
      'success',
      {
        duration: 5000,
        action: {
          label: 'Deshacer',
          onClick: () => {
            const pendingTimer = pendingDeleteTimers.current.get(key)
            if (pendingTimer) {
              clearTimeout(pendingTimer)
              pendingDeleteTimers.current.delete(key)
            }
            setPendingDeleteKeys(prev => {
              const next = new Set(prev)
              next.delete(key)
              return next
            })
          }
        }
      }
    )
  }

  useEffect(() => {
    return () => {
      pendingDeleteTimers.current.forEach(timer => clearTimeout(timer))
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])



  const exportToCSV = () => {
    // Quote every field that needs it, so descriptions containing commas, quotes
    // or line breaks don't shift the columns
    const escapeCsv = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
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
        (toUsdCents(e, exchangeRate, todayKey) / 100).toFixed(2),
        e.payment_method === 'credit' ? 'Crédito' : 'Débito',
        typeLabel
      ]
    })
    
    const csvContent = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\r\n')
    // The BOM makes Excel read the file as UTF-8 (otherwise "Descripción" shows as "DescripciÃ³n")
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `gastitos_${toDateKey()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Row actions (edit/delete) live in a small menu, opened from each row's ⋯
  // button, or by right-click / long-press as shortcuts.
  const openRowMenu = (expense: Expense & { _isInstallmentGroup?: boolean }, x: number, y: number) => {
    const menuWidth = 176
    const menuHeight = expense._isInstallmentGroup ? 52 : 96
    const clampedX = Math.min(x, window.innerWidth - menuWidth - 8)
    const clampedY = Math.min(y, window.innerHeight - menuHeight - 8)
    setRowMenu({ expense, x: Math.max(8, clampedX), y: Math.max(8, clampedY) })
  }

  const closeRowMenu = () => {
    setRowMenu(null)
    rowMenuTrigger.current?.focus()
    rowMenuTrigger.current = null
  }

  const handleRowMenuButton = (expense: Expense) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    rowMenuTrigger.current = e.currentTarget
    // Right-align the menu under the button
    openRowMenu(expense, rect.right - 176, rect.bottom + 4)
  }

  // Keyboard support while the menu is open: focus the first action,
  // Escape closes, arrow keys move between actions
  useEffect(() => {
    if (!rowMenu) return
    const items = () => Array.from(rowMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    items()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRowMenu()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const list = items()
        const current = list.indexOf(document.activeElement as HTMLButtonElement)
        const next = (current + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
        list[next]?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rowMenu])

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    touchStartPos.current = null
  }

  const handleRowContextMenu = (expense: Expense) => (e: React.MouseEvent) => {
    e.preventDefault()
    openRowMenu(expense, e.clientX, e.clientY)
  }

  const handleRowTouchStart = (expense: Expense) => (e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartPos.current = { x: touch.clientX, y: touch.clientY }
    longPressTimer.current = setTimeout(() => {
      openRowMenu(expense, touch.clientX, touch.clientY)
      longPressTimer.current = null
    }, 550)
  }

  const handleRowTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return
    const touch = e.touches[0]
    const dx = Math.abs(touch.clientX - touchStartPos.current.x)
    const dy = Math.abs(touch.clientY - touchStartPos.current.y)
    if (dx > 10 || dy > 10) clearLongPress()
  }

  const changeMonth = (delta: number) => {
    let newMonth = selectedMonth + delta
    let newYear = selectedYear
    if (newMonth < 0) {
      newMonth = 11
      newYear -= 1
    } else if (newMonth > 11) {
      newMonth = 0
      newYear += 1
    }
    setSelectedMonth(newMonth)
    setSelectedYear(newYear)
  }

  // Calculate totals
  const monthlyTransactions = expenses.filter(expense => {
    const expenseDate = new Date(expense.date + 'T12:00:00')
    return expenseDate.getMonth() === selectedMonth && expenseDate.getFullYear() === selectedYear
  })

  const monthlyIncome = monthlyTransactions.filter(t => t.transaction_type === 'income')
  const monthlyExpensesList = monthlyTransactions.filter(t => t.transaction_type === 'expense')
  const monthlySavings = monthlyTransactions.filter(t => t.transaction_type === 'savings')

  // USD uses each transaction's own rate (see toUsdCents), not today's, so a past
  // month's USD totals don't change every time the peso moves
  const todayKey = toDateKey()
  const sumUsd = (list: Expense[]) => list.reduce((sum, t) => sum + toUsdCents(t, exchangeRate, todayKey), 0)

  const totalIncomeArs = monthlyIncome.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0)
  const totalIncomeUsd = sumUsd(monthlyIncome)
  
  const totalExpensesArs = monthlyExpensesList.reduce((sum, t) => sum + t.amount_cents, 0)
  const totalExpensesUsd = sumUsd(monthlyExpensesList)
  
  const totalSavingsArs = monthlySavings.reduce((sum, t) => sum + Math.abs(t.amount_cents), 0)
  const totalSavingsUsd = sumUsd(monthlySavings)
  
  const balanceArs = totalIncomeArs - totalExpensesArs - totalSavingsArs
  const balanceUsd = totalIncomeUsd - totalExpensesUsd - totalSavingsUsd

  // Count unique installment groups with pending installments
  const pendingCuotas = Array.from(
    new Set(
      expenses
        .filter(e => isInstallmentPending(e))
        .map(e => e.installment_group_id)
    )
  )

  const isPendingDelete = (e: Expense) =>
    pendingDeleteKeys.has(e.id) || (!!e.installment_group_id && pendingDeleteKeys.has(e.installment_group_id))

  // Searching looks across all periods, not just the selected month — otherwise a
  // match outside the current month silently shows up as "no results".
  const filteredExpenses = (searchQuery
    ? expenses.filter(e => e.description.toLowerCase().includes(searchQuery.toLowerCase()))
    : expenses.filter(e =>
        new Date(e.date + 'T12:00:00').getMonth() === selectedMonth &&
        new Date(e.date + 'T12:00:00').getFullYear() === selectedYear
      )
  ).filter(e => !isPendingDelete(e))

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
        const nextPending = group._installments
          .filter((inst: Expense) => isInstallmentPending(inst))
          .sort((a: Expense, b: Expense) => new Date(a.date + 'T12:00:00').getTime() - new Date(b.date + 'T12:00:00').getTime())[0]
        
        return {
          ...group,
          amount_cents: total,
          _usdCents: sumUsd(group._installments),
          _displayText: `Cuota ${group.installment_number}/${group.total_installments}`,
          _nextPendingDate: nextPending?.date,
          _isInstallmentGroup: true
        }
      }
      return group
    })
  }

  const groupedExpenses = getGroupedTransactions()

  if (isLocalLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    )
  }

  if (loadError && currentUser) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-64 text-center">
        <p className="text-foreground font-semibold">No pudimos cargar tus datos</p>
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button onClick={() => loadData(currentUser.id)}>Reintentar</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto px-4 pb-24">
      {/* Tab Navigation */}
      <div className="flex bg-muted rounded-xl p-1">
        <button
          onClick={() => setActiveTab('gastos')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
            activeTab === 'gastos'
              ? 'bg-card dark:bg-input text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Gastos
        </button>
        <button
          onClick={() => setActiveTab('resumen')}
          className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
            activeTab === 'resumen'
              ? 'bg-card dark:bg-input text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
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
              <div className={`text-3xl sm:text-4xl font-bold tracking-tight mb-1 font-amount ${
                balanceArs >= 0 ? 'text-success' : 'text-destructive'
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
              <div className="flex sm:flex-col items-center justify-between sm:justify-center p-3 sm:p-2 bg-secondary rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success"></span>
                  <p className="text-sm sm:text-xs text-muted-foreground">Ingresos</p>
                </div>
                <p className="text-lg sm:text-base font-semibold text-success font-amount">
                  {hideTotalAmount ? '****' : (showUsd ? formatCurrency(totalIncomeUsd, 'USD') : formatCurrency(totalIncomeArs, 'ARS'))}
                </p>
              </div>
              <div className="flex sm:flex-col items-center justify-between sm:justify-center p-3 sm:p-2 bg-secondary rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-destructive"></span>
                  <p className="text-sm sm:text-xs text-muted-foreground">Gastos</p>
                </div>
                <p className="text-lg sm:text-base font-semibold text-destructive font-amount">
                  {hideTotalAmount ? '****' : (showUsd ? formatCurrency(totalExpensesUsd, 'USD') : formatCurrency(totalExpensesArs, 'ARS'))}
                </p>
              </div>
              <div className="flex sm:flex-col items-center justify-between sm:justify-center p-3 sm:p-2 bg-secondary rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary"></span>
                  <p className="text-sm sm:text-xs text-muted-foreground">Ahorro</p>
                </div>
                <p className="text-lg sm:text-base font-semibold text-primary font-amount">
                  {hideTotalAmount ? '****' : (showUsd ? formatCurrency(totalSavingsUsd, 'USD') : formatCurrency(totalSavingsArs, 'ARS'))}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats - Compact Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card rounded-xl p-3">
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

            <div className="glass-card rounded-xl p-3">
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
              onExportClick={exportToCSV}
            />
          </div>
          {searchQuery && (
            <p className="text-xs text-muted-foreground -mt-2">
              Buscando en todos los períodos
            </p>
          )}

          {/* Month Selector */}
          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => changeMonth(-1)}
              className="border-border hover:bg-muted shrink-0 px-2.5"
              title="Mes anterior"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
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
              onClick={() => changeMonth(1)}
              className="border-border hover:bg-muted shrink-0 px-2.5"
              title="Mes siguiente"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* List filters */}
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 px-3 py-1.5 bg-secondary border border-border rounded-lg cursor-pointer hover:bg-muted transition-colors">
              <input
                type="checkbox"
                checked={showInstallments}
                onChange={(e) => setShowInstallments(e.target.checked)}
                className="w-4 h-4 text-primary rounded focus:ring-primary bg-background border-input"
              />
              <span className="text-sm font-medium text-foreground">Ver cuotas</span>
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllTransactions(!showAllTransactions)}
              className="whitespace-nowrap border-border hover:bg-muted text-sm"
            >
              {showAllTransactions ? 'Ver menos' : 'Ver todos'}
            </Button>
          </div>

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
                    className={`p-4 flex items-center justify-between gap-3 hover:bg-muted/50 relative group transition-colors select-none ${
                      expense._isInstallmentGroup ? 'border-l-4 border-l-primary bg-primary/5' : ''
                    }`}
                    style={{ WebkitTouchCallout: 'none' }}
                    onContextMenu={handleRowContextMenu(expense)}
                    onTouchStart={handleRowTouchStart(expense)}
                    onTouchMove={handleRowTouchMove}
                    onTouchEnd={clearLongPress}
                    onTouchCancel={clearLongPress}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {(() => {
                        const category = categories.find(c => c.id === expense.category_id)
                        // Determine icon and color based on transaction type
                        let icon = category?.icon || '📦'
                        let color = category?.color || '#6B7280'
                        
                        if (expense.transaction_type === 'income') {
                          icon = expense.is_salary ? '💰' : '📥'
                          color = 'hsl(var(--success))'
                        } else if (expense.transaction_type === 'savings') {
                          icon = '💎'
                          color = 'hsl(var(--primary))'
                        }
                        
                        return (
                          <div
                            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-lg"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                              color: color
                            }}
                          >
                            {icon}
                          </div>
                        )
                      })()}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-medium text-foreground truncate">
                            {expense._isInstallmentGroup
                              ? expense.description.replace(/\s*\(\d+\/\d+\)$/, '')
                              : expense.description}
                          </p>
                          {expense._isInstallmentGroup && (
                            <span className="inline-flex shrink-0 items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
                              Cuota {expense.installment_number}/{expense.total_installments}
                            </span>
                          )}
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
                    <div className="flex items-center gap-1 shrink-0">
                    <div className="text-right">
                      <p className={`font-semibold font-amount ${
                        expense.transaction_type === 'income' ? 'text-success' :
                        expense.transaction_type === 'savings' ? 'text-primary' : 'text-foreground'
                      }`}>
                        {expense.transaction_type === 'income' ? '+' : ''}
                        {showUsd
                          ? formatCurrency(expense._usdCents ?? toUsdCents(expense, exchangeRate, todayKey), 'USD')
                          : formatCurrency(Math.abs(expense.amount_cents), 'ARS')
                        }
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Acciones"
                      aria-haspopup="menu"
                      aria-expanded={rowMenu?.expense.id === expense.id}
                      onClick={handleRowMenuButton(expense)}
                      // Don't start the row's long-press timer from a tap on the button
                      onTouchStart={(e) => e.stopPropagation()}
                      className="-mr-2 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
                    >
                      <EllipsisVertical className="w-4 h-4" />
                    </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Row action menu (right-click / long-press) */}
          {rowMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={closeRowMenu}
                onContextMenu={(e) => {
                  e.preventDefault()
                  closeRowMenu()
                }}
              />
              <div
                ref={rowMenuRef}
                role="menu"
                aria-label="Acciones de la transacción"
                className="fixed z-50 w-44 glass-card rounded-xl border border-border shadow-2xl overflow-hidden py-1"
                style={{ left: rowMenu.x, top: rowMenu.y }}
              >
                {!rowMenu.expense._isInstallmentGroup && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setEditingExpense(rowMenu.expense)
                      closeRowMenu()
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted focus:bg-muted focus:outline-none transition-colors"
                  >
                    <Pencil className="w-4 h-4 text-primary" />
                    Editar
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setTransactionToDelete(rowMenu.expense)
                    setDeleteModalOpen(true)
                    closeRowMenu()
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 focus:bg-destructive/10 focus:outline-none transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar
                </button>
              </div>
            </>
          )}

          {/* Floating Add Button */}
          <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-20">
            <Button
              onClick={() => {
                setEditingExpense(null)
                setIsTransactionModalOpen(true)
              }}
              size="lg"
              className="w-14 h-14 rounded-full bg-primary hover:opacity-90 text-primary-foreground shadow-lg shadow-primary/30 transition-all"
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>

          {/* Add/Edit Transaction Modal */}
          <AddTransactionModal
            isOpen={isTransactionModalOpen || !!editingExpense}
            onClose={() => {
              setIsTransactionModalOpen(false)
              setEditingExpense(null)
            }}
            onSuccess={reloadData}
            categories={categories}
            editingExpense={editingExpense}
          />

          {/* Budget Manager */}
          <BudgetManager
            isOpen={isBudgetManagerOpen}
            onClose={() => setIsBudgetManagerOpen(false)}
          />



          {/* Delete Confirmation Modal */}
          {deleteModalOpen && transactionToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteModalOpen(false)} />
              <div className="relative glass-card rounded-2xl p-6 shadow-2xl max-w-sm w-full border border-border">
                <h3 className="text-lg font-bold text-foreground mb-2">
                  {(transactionToDelete as Expense & { _isInstallmentGroup?: boolean })._isInstallmentGroup
                    ? 'Eliminar todas las cuotas'
                    : 'Eliminar transacción'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {(transactionToDelete as Expense & { _isInstallmentGroup?: boolean })._isInstallmentGroup
                    ? `¿Estás seguro de que quieres eliminar TODAS las cuotas de "${transactionToDelete.description.replace(/\s*\(\d+\/\d+\)$/, '')}"? Se eliminarán las cuotas pagadas y pendientes de todos los meses.`
                    : `¿Estás seguro de que quieres eliminar "${transactionToDelete.description}"?`}
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
