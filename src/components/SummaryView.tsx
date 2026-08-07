import { useState, useEffect, useMemo } from 'react'
import { startOfMonth, subMonths } from 'date-fns'
import { useUserStore } from '../stores/userStore'
import { useDataStore } from '../stores/dataStore'
import { useUIStore } from '../stores/uiStore'
import { formatCurrency, toDisplayCurrency } from '../lib/utils'
import { supabase } from '../services/supabase'
import { getTrailingMonths, getUpcomingMonths, isInMonth, parseExpenseDate } from '../lib/dateBuckets'
import { getActiveInstallmentGroups } from '../lib/installments'
import { aggregateByCategory, getCurrentMonthExpenseByCategory } from '../lib/categoryAggregation'
import { getChartColors } from '../lib/chartTheme'
import { Button } from './ui/button'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts'
import { CreditCard, TrendingUp, Trash2, Package, CalendarDays, PiggyBank, Target } from 'lucide-react'
import { fetchInflationData, type ProcessedInflation } from '../services/inflation'
import { useToastStore } from '../stores/toastStore'

type CategoryPeriod = 'month' | '3months' | 'all'

const CATEGORY_PERIOD_LABELS: Record<CategoryPeriod, string> = {
  month: 'Este mes',
  '3months': 'Últimos 3 meses',
  all: 'Todo',
}

export function SummaryView() {
  const { exchangeRate, showUsd, budgets } = useUserStore()
  const { expenses, categories } = useDataStore()
  const { setIsBudgetManagerOpen } = useUIStore()
  const [isLoading, setIsLoading] = useState(true)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null)
  const [inflationData, setInflationData] = useState<ProcessedInflation | null>(null)
  const [isLoadingInflation, setIsLoadingInflation] = useState(true)
  const [categoryPeriod, setCategoryPeriod] = useState<CategoryPeriod>('month')

  useEffect(() => {
    setIsLoading(false)
  }, [expenses])

  useEffect(() => {
    const loadInflation = async () => {
      setIsLoadingInflation(true)
      const data = await fetchInflationData()
      setInflationData(data)
      setIsLoadingInflation(false)
    }

    loadInflation()
  }, [])

  const fmt = (cents: number) => {
    const { amount, currency } = toDisplayCurrency(cents, showUsd, exchangeRate)
    return formatCurrency(amount, currency)
  }

  const monthStart = useMemo(() => startOfMonth(new Date()), [])
  const upcomingMonths = useMemo(() => getUpcomingMonths(3), [])
  const chartColors = useMemo(() => getChartColors(), [])

  // Last 6 months income/expense series (drives the bar chart and several derived cards)
  const last6Months = useMemo(() => {
    return getTrailingMonths(6).map((bucket) => {
      const monthExpenses = expenses.filter(
        (e) => e.transaction_type === 'expense' && isInMonth(parseExpenseDate(e.date), bucket.monthStart)
      )
      const monthIncome = expenses.filter(
        (e) => e.transaction_type === 'income' && isInMonth(parseExpenseDate(e.date), bucket.monthStart)
      )
      return {
        key: bucket.key,
        name: bucket.label,
        incomeCents: monthIncome.reduce((sum, e) => sum + Math.abs(e.amount_cents), 0),
        expensesCents: monthExpenses.reduce((sum, e) => sum + e.amount_cents, 0),
      }
    })
  }, [expenses])

  const last6MonthsChartData = useMemo(
    () => last6Months.map((m) => ({ name: m.name, income: m.incomeCents / 100, expenses: m.expensesCents / 100 })),
    [last6Months]
  )

  const currentMonthData = last6Months[last6Months.length - 1]

  // Total pending installment debt
  const debtTotals = useMemo(() => {
    const pending = expenses.filter((e) => e.is_installment && e.status === 'pending')
    const totalDebtCents = pending.reduce((sum, e) => sum + e.amount_cents, 0)
    const thisMonthDebtCents = pending
      .filter((e) => isInMonth(parseExpenseDate(e.date), monthStart))
      .reduce((sum, e) => sum + e.amount_cents, 0)
    return {
      totalDebtCents,
      thisMonthDebtCents,
      nextMonthsDebtCents: totalDebtCents - thisMonthDebtCents,
    }
  }, [expenses, monthStart])

  // Upcoming 3-month debt breakdown
  const threeMonthDebt = useMemo(() => {
    const pending = expenses.filter((e) => e.is_installment && e.status === 'pending')
    const buckets = upcomingMonths.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      amountCents: pending
        .filter((e) => isInMonth(parseExpenseDate(e.date), bucket.monthStart))
        .reduce((sum, e) => sum + e.amount_cents, 0),
    }))
    return { buckets, totalCents: buckets.reduce((sum, b) => sum + b.amountCents, 0) }
  }, [expenses, upcomingMonths])

  // Savings rate for the current month
  const savingsRate = useMemo(() => {
    const totalIncomeCents = currentMonthData?.incomeCents || 0
    const totalSavingsCents = expenses
      .filter((e) => e.transaction_type === 'savings' && isInMonth(parseExpenseDate(e.date), monthStart))
      .reduce((sum, e) => sum + Math.abs(e.amount_cents), 0)
    return {
      rate: totalIncomeCents > 0 ? (totalSavingsCents / totalIncomeCents) * 100 : 0,
    }
  }, [expenses, monthStart, currentMonthData])

  // Category breakdown, scoped by the selected period (fixes the missing date-scope bug)
  const categoryBreakdown = useMemo(() => {
    let predicate: (e: (typeof expenses)[number]) => boolean

    if (categoryPeriod === 'month') {
      predicate = (e) => e.transaction_type === 'expense' && isInMonth(parseExpenseDate(e.date), monthStart)
    } else if (categoryPeriod === '3months') {
      const months = getTrailingMonths(3)
      predicate = (e) =>
        e.transaction_type === 'expense' &&
        months.some((m) => isInMonth(parseExpenseDate(e.date), m.monthStart))
    } else {
      predicate = (e) => e.transaction_type === 'expense'
    }

    return aggregateByCategory(expenses, categories, predicate)
      .slice(0, 5)
      .map((c) => ({ name: c.name, value: c.totalCents / 100, color: c.color }))
  }, [expenses, categories, categoryPeriod, monthStart])

  // Daily spending for the last 30 days
  const last30Days = useMemo(() => {
    const days = []
    const today = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]

      const dayExpenses = expenses
        .filter((e) => e.date === dateStr && e.transaction_type === 'expense')
        .reduce((sum, e) => sum + e.amount_cents, 0)

      days.push({ day: d.getDate(), amount: dayExpenses / 100 })
    }
    return days
  }, [expenses])

  // Daily average spend this month (spend-so-far / days-elapsed-so-far)
  const dailyAverage = useMemo(() => {
    const currentDay = new Date().getDate()
    const currentMonthExpenseCents = expenses
      .filter((e) => e.transaction_type === 'expense' && isInMonth(parseExpenseDate(e.date), monthStart))
      .reduce((sum, e) => sum + e.amount_cents, 0)
    return currentDay > 0 ? currentMonthExpenseCents / currentDay : 0
  }, [expenses, monthStart])

  const activeInstallmentGroups = useMemo(() => getActiveInstallmentGroups(expenses), [expenses])

  const estadoFinanciero = useMemo(() => {
    const totalIncomeCents = currentMonthData?.incomeCents || 0
    const totalExpensesCents = currentMonthData?.expensesCents || 0
    const ratio = totalIncomeCents > 0 ? totalExpensesCents / totalIncomeCents : 0

    let status: 'good' | 'warning' | 'danger' = 'good'
    let message = 'Todo bien: Gastos bajo control'
    let icon = '🟢'
    if (ratio > 0.9) {
      status = 'danger'
      message = 'Alerta: Gastos superan el 90% de tus ingresos'
      icon = '🔴'
    } else if (ratio > 0.8) {
      status = 'warning'
      message = 'Atención: Gastos elevados'
      icon = '🟡'
    }

    return { ratio, status, message, icon }
  }, [currentMonthData])

  const monthOverMonthChange = useMemo(() => {
    if (last6Months.length < 2) return null
    const current = last6Months[last6Months.length - 1]
    const previous = last6Months[last6Months.length - 2]
    if (previous.expensesCents <= 0) return 0
    return ((current.expensesCents - previous.expensesCents) / previous.expensesCents) * 100
  }, [last6Months])

  // Purchasing power impact: 3-month average expense ~6 months ago vs. today, adjusted for inflation
  const purchasingPower = useMemo(() => {
    if (!inflationData || inflationData.cumulativeSixMonths <= 0) return null

    const sixMonthsAgo = subMonths(new Date(), 6)
    const referenceMonths = getTrailingMonths(3, sixMonthsAgo)
    const monthlyTotals = referenceMonths.map((bucket) =>
      expenses
        .filter((e) => e.transaction_type === 'expense' && isInMonth(parseExpenseDate(e.date), bucket.monthStart))
        .reduce((sum, e) => sum + e.amount_cents, 0)
    )
    const monthsWithData = monthlyTotals.filter((t) => t > 0).length
    const referenceLabel = `${referenceMonths[0].label}-${referenceMonths[2].label}`

    if (monthsWithData === 0) {
      return { hasData: false as const, referenceLabel }
    }

    const avgOldCents = monthlyTotals.reduce((a, b) => a + b, 0) / monthsWithData
    const adjustedCents = avgOldCents * (1 + inflationData.cumulativeSixMonths / 100)

    return {
      hasData: true as const,
      referenceLabel,
      avgOldCents,
      adjustedCents,
      cumulativeInflation: inflationData.cumulativeSixMonths,
    }
  }, [expenses, inflationData])

  const top5Expenses = useMemo(() => {
    return expenses
      .filter((e) => e.transaction_type === 'expense' && isInMonth(parseExpenseDate(e.date), monthStart))
      .sort((a, b) => b.amount_cents - a.amount_cents)
      .slice(0, 5)
  }, [expenses, monthStart])

  const budgetProgress = useMemo(() => {
    const spendMap = getCurrentMonthExpenseByCategory(expenses, categories)
    return Object.entries(budgets)
      .map(([categoryId, budgetCents]) => {
        const category = categories.find((c) => c.id === categoryId)
        const spentCents = spendMap.get(categoryId) || 0
        const percentage = budgetCents > 0 ? (spentCents / budgetCents) * 100 : 0
        return {
          categoryId,
          name: category?.name || 'Sin categoría',
          icon: category?.icon || '📦',
          budgetCents,
          spentCents,
          percentage,
        }
      })
      .sort((a, b) => b.percentage - a.percentage)
  }, [budgets, expenses, categories])

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')

      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('installment_group_id', groupToDelete)
        .eq('user_id', user.id)

      if (error) throw error

      await useDataStore.getState().fetchExpenses(user.id)
      setDeleteModalOpen(false)
      setGroupToDelete(null)
    } catch (err) {
      console.error('Error deleting group:', err)
      useToastStore.getState().addToast('Error al eliminar el grupo de cuotas')
    }
  }

  if (isLoading || isLoadingInflation) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-primary">Cargando resumen...</div>
      </div>
    )
  }

  const tooltipStyle = {
    borderRadius: '8px',
    border: `1px solid ${chartColors.border}`,
    background: chartColors.card,
    color: chartColors.mutedForeground,
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Total Debt Card (Cuotas) */}
      <div className="glass-card rounded-2xl p-5 sm:p-6 border border-destructive/20">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 text-destructive" />
          <h2 className="text-base sm:text-lg font-semibold text-foreground">Deuda Total Pendiente (Cuotas)</h2>
        </div>
        <div className="text-2xl sm:text-3xl font-bold mb-3 text-destructive font-mono-amount">
          {fmt(debtTotals.totalDebtCents)}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="bg-muted/40 rounded-lg px-3 py-2">
            <span className="text-muted-foreground">Este mes: </span>
            <span className="font-semibold text-foreground font-mono-amount">{fmt(debtTotals.thisMonthDebtCents)}</span>
          </div>
          <div className="bg-muted/40 rounded-lg px-3 py-2">
            <span className="text-muted-foreground">Próximos meses: </span>
            <span className="font-semibold text-foreground font-mono-amount">{fmt(debtTotals.nextMonthsDebtCents)}</span>
          </div>
        </div>
      </div>

      {/* Inflation Card */}
      {inflationData?.latest && (
        <div className="glass-card rounded-2xl p-4 sm:p-6 border border-warning/20">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-warning/15 p-2 rounded-lg">
              <span className="text-xl">📈</span>
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground">Inflación Oficial</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-warning font-mono-amount">
                {inflationData.latest.valor.toFixed(1)}%
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {new Date(inflationData.latest.fecha).toLocaleDateString('es-AR', {
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-warning font-mono-amount">
                {inflationData.cumulativeSixMonths.toFixed(1)}%
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Acumulado 6 meses</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground/70 mt-3">Fuente: INDEC vía ArgentinaDatos</p>
        </div>
      )}

      {/* Savings Rate and 3-Month Debt Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          className={`glass-card rounded-2xl p-5 sm:p-6 border ${
            savingsRate.rate >= 20
              ? 'border-success/30'
              : savingsRate.rate >= 10
                ? 'border-warning/30'
                : 'border-destructive/30'
          }`}
        >
          <div className="flex items-center gap-2 mb-4">
            <PiggyBank
              className={`w-5 h-5 sm:w-6 sm:h-6 ${
                savingsRate.rate >= 20 ? 'text-success' : savingsRate.rate >= 10 ? 'text-warning' : 'text-destructive'
              }`}
            />
            <h2 className="text-base sm:text-lg font-semibold text-foreground">Tasa de Ahorro</h2>
          </div>
          <div
            className={`text-2xl sm:text-3xl font-bold mb-2 font-mono-amount ${
              savingsRate.rate >= 20 ? 'text-success' : savingsRate.rate >= 10 ? 'text-warning' : 'text-destructive'
            }`}
          >
            {savingsRate.rate.toFixed(1)}%
          </div>
          <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm text-muted-foreground">
            {savingsRate.rate >= 20
              ? '¡Excelente! Estás ahorrando muy bien'
              : savingsRate.rate >= 10
                ? 'Bien, pero podrías ahorrar más'
                : 'Alerta: Ahorro muy bajo'}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 sm:p-6 border border-border">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <h2 className="text-base sm:text-lg font-semibold text-foreground">Deuda Próximos 3 Meses</h2>
          </div>
          <div className="text-2xl sm:text-3xl font-bold mb-3 text-primary font-mono-amount">
            {fmt(threeMonthDebt.totalCents)}
          </div>
          <div className="flex flex-col gap-2 text-sm">
            {threeMonthDebt.buckets.map((b) => (
              <div key={b.key} className="bg-muted/40 rounded-lg px-3 py-1.5 flex justify-between">
                <span className="text-muted-foreground capitalize">{b.label}:</span>
                <span className="font-semibold text-foreground font-mono-amount">{fmt(b.amountCents)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Budget vs Actual */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-border">
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <h3 className="text-base sm:text-lg font-semibold text-foreground">Presupuestos del Mes</h3>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsBudgetManagerOpen(true)}
            className="text-primary border-primary/30 hover:bg-primary/10"
          >
            Configurar
          </Button>
        </div>

        {budgetProgress.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            No configuraste presupuestos todavía. Tocá "Configurar" para agregar uno por categoría.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {budgetProgress.map((b) => (
              <div key={b.categoryId} className="bg-muted/30 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg shrink-0">{b.icon}</span>
                    <span className="font-medium text-foreground truncate">{b.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground whitespace-nowrap font-mono-amount">
                    {fmt(b.spentCents)} / {fmt(b.budgetCents)}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      b.percentage > 100 ? 'bg-destructive' : b.percentage > 80 ? 'bg-warning' : 'bg-success'
                    }`}
                    style={{ width: `${Math.min(b.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly Comparison Chart */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-border">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">Ingresos vs Gastos (Últimos 6 meses)</h3>
        <div className="h-48 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last6MonthsChartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
              <XAxis dataKey="name" stroke={chartColors.mutedForeground} fontSize={10} tickMargin={5} />
              <YAxis stroke={chartColors.mutedForeground} fontSize={10} width={40} />
              <Tooltip
                formatter={(value) => formatCurrency((value as number) * 100, 'ARS')}
                contentStyle={tooltipStyle}
              />
              <Legend wrapperStyle={{ fontSize: '12px', color: chartColors.mutedForeground }} />
              <Bar dataKey="income" name="Ingresos" fill={chartColors.success} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Gastos" fill={chartColors.destructive} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Categories & Financial Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Categories Pie Chart */}
        <div className="glass-card rounded-2xl p-4 sm:p-6 border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-foreground">
              Gastos por Categoría · {CATEGORY_PERIOD_LABELS[categoryPeriod]}
            </h3>
            <div className="flex bg-muted rounded-lg p-1">
              {(Object.keys(CATEGORY_PERIOD_LABELS) as CategoryPeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setCategoryPeriod(period)}
                  className={`text-xs sm:text-sm px-2.5 py-1 rounded-md font-medium transition-all ${
                    categoryPeriod === period
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {period === 'month' ? 'Mes' : period === '3months' ? '3 meses' : 'Todo'}
                </button>
              ))}
            </div>
          </div>
          {categoryBreakdown.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No hay gastos registrados en este período</p>
          ) : (
            <>
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      cx="50%"
                      cy="45%"
                      labelLine={false}
                      label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency((value as number) * 100, 'ARS')} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Category legend for mobile */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:hidden">
                {categoryBreakdown.map((cat, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }}></span>
                    <span className="text-muted-foreground truncate">{cat.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Financial Insights */}
        <div className="glass-card rounded-2xl p-4 sm:p-6 border border-border">
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">Estado Financiero</h3>

          {/* Status Indicator */}
          <div className="mb-6">
            <div
              className={`p-4 rounded-xl border ${
                estadoFinanciero.status === 'good'
                  ? 'bg-success/10 border-success/30'
                  : estadoFinanciero.status === 'warning'
                    ? 'bg-warning/10 border-warning/30'
                    : 'bg-destructive/10 border-destructive/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{estadoFinanciero.icon}</span>
                <div>
                  <p
                    className={`font-semibold ${
                      estadoFinanciero.status === 'good'
                        ? 'text-success'
                        : estadoFinanciero.status === 'warning'
                          ? 'text-warning'
                          : 'text-destructive'
                    }`}
                  >
                    {estadoFinanciero.message}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Estás usando el {(estadoFinanciero.ratio * 100).toFixed(0)}% de tus ingresos
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Month-over-Month Comparison */}
          {monthOverMonthChange !== null && (
            <div className="space-y-3">
              <h4 className="font-medium text-foreground">Comparación vs Mes Anterior</h4>
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                <span className="text-muted-foreground">Variación de gastos</span>
                <span className={`font-semibold ${monthOverMonthChange > 0 ? 'text-destructive' : 'text-success'}`}>
                  {monthOverMonthChange > 0 ? '↑' : '↓'} {Math.abs(monthOverMonthChange).toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {/* Daily Average */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between p-4 bg-primary/10 rounded-xl">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-primary" />
                <span className="text-foreground">Gasto promedio diario</span>
              </div>
              <span className="font-bold text-primary font-mono-amount">{fmt(dailyAverage)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Purchasing Power Impact */}
      {purchasingPower && (
        <div className="glass-card rounded-2xl p-4 sm:p-6 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <div className="bg-warning/15 p-2 rounded-lg">
              <span className="text-xl">💸</span>
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-foreground">Impacto en tu Poder Adquisitivo</h3>
          </div>

          {!purchasingPower.hasData ? (
            <p className="text-muted-foreground text-center py-4 text-sm">
              No hay gastos registrados de hace 6 meses para comparar
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-4">
                Promedio de {purchasingPower.referenceLabel} (3 meses, para suavizar gastos puntuales)
              </p>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-4 bg-muted/30 rounded-xl">
                  <div>
                    <p className="text-sm text-muted-foreground">Gasto mensual promedio de entonces</p>
                    <p className="text-xs text-muted-foreground/70">Sin ajustar</p>
                  </div>
                  <span className="text-xl font-bold text-foreground font-mono-amount">{fmt(purchasingPower.avgOldCents)}</span>
                </div>

                <div className="flex justify-between items-center p-4 bg-warning/10 rounded-xl border border-warning/20">
                  <div>
                    <p className="text-sm text-foreground">Equivalente hoy</p>
                    <p className="text-xs text-muted-foreground">
                      Ajustado por inflación ({purchasingPower.cumulativeInflation.toFixed(1)}%)
                    </p>
                  </div>
                  <span className="text-xl font-bold text-warning font-mono-amount">{fmt(purchasingPower.adjustedCents)}</span>
                </div>

                <div className="text-center p-3 bg-destructive/10 rounded-lg">
                  <p className="text-sm text-destructive">
                    <span className="font-bold">Pérdida de poder adquisitivo:</span> ese mismo gasto equivale a{' '}
                    {((purchasingPower.adjustedCents / purchasingPower.avgOldCents - 1) * 100).toFixed(1)}% más hoy
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Daily Spending Trend */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-border">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">Tendencia de Gastos (Últimos 30 días)</h3>
        <div className="h-40 sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last30Days} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
              <XAxis dataKey="day" stroke={chartColors.mutedForeground} fontSize={9} interval={4} tickMargin={5} />
              <YAxis stroke={chartColors.mutedForeground} fontSize={10} width={40} />
              <Tooltip
                formatter={(value) => formatCurrency((value as number) * 100, 'ARS')}
                contentStyle={tooltipStyle}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke={chartColors.primary}
                strokeWidth={2}
                dot={{ fill: chartColors.primary, strokeWidth: 0, r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top 5 Expenses */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 border border-border">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">Top 5 Gastos del Mes</h3>
        <div className="space-y-3">
          {top5Expenses.map((expense, index) => {
            const category = categories.find((c) => c.id === expense.category_id)
            return (
              <div key={expense.id} className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{expense.description}</p>
                    <p className="text-xs text-muted-foreground truncate">{category?.name}</p>
                  </div>
                </div>
                <span className="font-semibold text-primary whitespace-nowrap font-mono-amount">
                  {fmt(expense.amount_cents)}
                </span>
              </div>
            )
          })}

          {top5Expenses.length === 0 && (
            <p className="text-center text-muted-foreground py-4 text-sm">No hay gastos registrados este mes</p>
          )}
        </div>
      </div>

      {/* All Active Installments */}
      {activeInstallmentGroups.length > 0 && (
        <div className="glass-card rounded-2xl p-4 sm:p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              <h3 className="text-base sm:text-lg font-semibold text-foreground">Cuotas en Progreso</h3>
            </div>
            <span className="text-sm text-muted-foreground">{activeInstallmentGroups.length} activas</span>
          </div>

          <div className="space-y-4">
            {activeInstallmentGroups.map((group) => {
              const category = categories.find((c) => c.id === group.categoryId)
              const progressPercent = (group.paidCount / group.totalInstallments) * 100

              return (
                <div key={group.groupId} className="p-4 bg-muted/30 rounded-xl">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl shrink-0">{category?.icon || '📦'}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{group.description}</p>
                        <p className="text-sm text-primary font-semibold">
                          Cuota {group.currentNumber} / {group.totalInstallments}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setGroupToDelete(group.groupId)
                        setDeleteModalOpen(true)
                      }}
                      className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
                      title="Eliminar todas las cuotas"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between text-sm gap-2">
                    <span className="text-muted-foreground">
                      {group.paidCount} pagadas • {group.remainingCount} restantes
                    </span>
                    <span className="font-semibold text-foreground whitespace-nowrap font-mono-amount">
                      {fmt(group.remainingAmountCents)} restantes
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteModalOpen(false)} />
          <div className="relative glass-card rounded-2xl p-6 shadow-2xl max-w-sm w-full border border-border">
            <h3 className="text-lg font-bold text-foreground mb-2">Eliminar todas las cuotas</h3>
            <p className="text-muted-foreground mb-4">
              ¿Estás seguro de que quieres eliminar TODAS las cuotas de este pago?
              Se eliminarán las cuotas pagadas y pendientes de todos los meses.
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
                onClick={handleDeleteGroup}
                className="flex-1 bg-destructive hover:opacity-90 text-destructive-foreground"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Eliminar todo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
