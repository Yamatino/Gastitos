import { useState, useEffect, type ReactNode } from 'react'
import { addMonths, format, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { useUserStore } from '../stores/userStore'
import { useDataStore } from '../stores/dataStore'
import { useUIStore } from '../stores/uiStore'
import { formatCurrency, toUsdCents } from '../lib/utils'
import { supabase, type Expense } from '../services/supabase'
import { getTrailingMonths, getUpcomingMonths, isInMonth, parseExpenseDate, toDateKey } from '../lib/dateBuckets'
import { getActiveInstallmentGroups, isInstallmentPending } from '../lib/installments'
import { aggregateByCategory, getCurrentMonthExpenseByCategory } from '../lib/categoryAggregation'
import { categorySpendWithChange, percentChange, summarizeMonth, type Valuer } from '../lib/monthStats'
import { getChartColors } from '../lib/chartTheme'
import { Button } from './ui/button'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { ChevronLeft, ChevronRight, CreditCard, PiggyBank, Tags, Target, Trash2, TrendingUp, Wallet } from 'lucide-react'
import { fetchInflationData, type ProcessedInflation } from '../services/inflation'
import { useToastStore } from '../stores/toastStore'

type CategoryPeriod = 'month' | '3months' | 'all'

const PERIOD_LABELS: Record<CategoryPeriod, string> = {
  month: 'Mes',
  '3months': '3 meses',
  all: 'Todo',
}

// Installment plans listed before "Ver todas"
const PLANS_PREVIEW = 3

// Compact axis ticks ("1,8 M", "500 mil") so large peso amounts fit the narrow Y axis
const compactAxisFormatter = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 })
const formatAxisTick = (value: number) => compactAxisFormatter.format(value)

const stripInstallmentSuffix = (description: string) => description.replace(/\s*\(\d+\/\d+\)$/, '')
const monthName = (date: Date) => format(date, 'MMMM', { locale: es })
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function Card({ children }: { children: ReactNode }) {
  return <section className="glass-card rounded-2xl p-4 sm:p-6">{children}</section>
}

function CardTitle({ icon, title, aside }: { icon: ReactNode; title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h3 className="text-base sm:text-lg font-semibold text-foreground truncate">{title}</h3>
      </div>
      {aside}
    </div>
  )
}

/** ▲/▼ chip for spending changes: more spending is shown as bad, less as good. */
function ChangeChip({ percent }: { percent: number | null }) {
  // Under 1% would render as a meaningless "▲ 0%"
  if (percent === null || !Number.isFinite(percent) || Math.abs(percent) < 1) return null
  const up = percent > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 shrink-0 whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full ${
        up ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success'
      }`}
    >
      {up ? '▲' : '▼'} {Math.abs(percent).toFixed(0)}%
    </span>
  )
}

function ProgressBar({ percent, tone }: { percent: number; tone: 'success' | 'warning' | 'destructive' | 'primary' }) {
  const color = { success: 'bg-success', warning: 'bg-warning', destructive: 'bg-destructive', primary: 'bg-primary' }[tone]
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} />
    </div>
  )
}

/** One label/amount row inside a StatList (rows never truncate amounts, unlike side-by-side tiles). */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground font-amount">{value}</span>
    </div>
  )
}

function StatList({ children }: { children: ReactNode }) {
  return <div className="mt-4 bg-muted/40 rounded-xl divide-y divide-border">{children}</div>
}

export function SummaryView() {
  const { exchangeRate, showUsd, budgets, monthlySavingsGoalUSD } = useUserStore()
  const { expenses, categories } = useDataStore()
  const {
    setIsBudgetManagerOpen,
    setIsSettingsOpen,
    selectedMonth,
    selectedYear,
    setSelectedMonth,
    setSelectedYear,
  } = useUIStore()
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null)
  const [inflationData, setInflationData] = useState<ProcessedInflation | null>(null)
  const [categoryPeriod, setCategoryPeriod] = useState<CategoryPeriod>('month')
  const [showAllPlans, setShowAllPlans] = useState(false)

  // Inflation only feeds a footnote, so the rest of the page doesn't wait for it
  useEffect(() => {
    fetchInflationData().then(setInflationData)
  }, [])

  const today = new Date()
  const todayKey = toDateKey(today)
  const chartColors = getChartColors()

  // Same month as the Gastos tab, so switching tabs keeps your place
  const monthStart = new Date(selectedYear, selectedMonth, 1)
  const isCurrentMonth = isInMonth(today, monthStart)
  const previousMonthStart = subMonths(monthStart, 1)

  const shiftMonth = (delta: number) => {
    const target = addMonths(monthStart, delta)
    setSelectedMonth(target.getMonth())
    setSelectedYear(target.getFullYear())
  }
  const goToCurrentMonth = () => {
    setSelectedMonth(today.getMonth())
    setSelectedYear(today.getFullYear())
  }

  // Amounts follow the ARS/USD toggle. USD uses each transaction's own rate (see toUsdCents).
  const currency = showUsd ? 'USD' : 'ARS'
  const value: Valuer = (e) => (showUsd ? toUsdCents(e, exchangeRate, todayKey) : Math.abs(e.amount_cents))
  const fmt = (cents: number) => formatCurrency(cents, currency, true)
  // Budgets are set in pesos, and purchasing power is a peso concept, so those stay in ARS
  const fmtArs = (cents: number) => formatCurrency(cents, 'ARS', true)
  const sumValues = (list: Expense[]) => list.reduce((acc, e) => acc + value(e), 0)

  // ---- El mes ----
  const summary = summarizeMonth(expenses, monthStart, value, today)
  const spendChange = percentChange(summary.spentToDate, summary.previousSpent)
  const incomeRatio = summary.income > 0 ? (summary.spent / summary.income) * 100 : null

  // ---- Ahorro ----
  const monthSavings = expenses.filter(
    (e) => e.transaction_type === 'savings' && isInMonth(parseExpenseDate(e.date), monthStart)
  )
  const savingsRate = summary.income > 0 ? (summary.savings / summary.income) * 100 : null
  const savingsUsdCents = monthSavings.reduce((acc, e) => acc + toUsdCents(e, exchangeRate, todayKey), 0)
  const goalPercent = monthlySavingsGoalUSD > 0 ? (savingsUsdCents / 100 / monthlySavingsGoalUSD) * 100 : null

  // ---- Presupuestos ----
  const spendByCategory = getCurrentMonthExpenseByCategory(expenses, categories, monthStart)
  const budgetProgress = Object.entries(budgets)
    .map(([categoryId, budgetCents]) => {
      const category = categories.find((c) => c.id === categoryId)
      const spentCents = spendByCategory.get(categoryId) || 0
      return {
        categoryId,
        name: category?.name || 'Sin categoría',
        icon: category?.icon || '📦',
        budgetCents,
        spentCents,
        percentage: budgetCents > 0 ? (spentCents / budgetCents) * 100 : 0,
      }
    })
    .sort((a, b) => b.percentage - a.percentage)

  // ---- Categorías ----
  const categoryRows =
    categoryPeriod === 'month'
      ? categorySpendWithChange(expenses, categories, monthStart, value, today)
      : aggregateByCategory(
          expenses,
          categories,
          categoryPeriod === '3months'
            ? (e) =>
                e.transaction_type === 'expense' &&
                getTrailingMonths(3, monthStart).some((m) => isInMonth(parseExpenseDate(e.date), m.monthStart))
            : (e) => e.transaction_type === 'expense',
          value
        ).map((c) => ({ ...c, total: c.totalCents, changePercent: null }))
  const categoryTotal = categoryRows.reduce((acc, c) => acc + c.total, 0)

  const topExpenses = expenses
    .filter((e) => e.transaction_type === 'expense' && isInMonth(parseExpenseDate(e.date), monthStart))
    .sort((a, b) => value(b) - value(a))
    .slice(0, 5)

  // ---- Cuotas (always from today, whatever month is selected) ----
  const pendingInstallments = expenses.filter((e) => isInstallmentPending(e, today))
  const totalDebt = sumValues(pendingInstallments)
  const upcomingDebt = getUpcomingMonths(3, today).map((bucket) => ({
    ...bucket,
    amount: sumValues(pendingInstallments.filter((e) => isInMonth(parseExpenseDate(e.date), bucket.monthStart))),
  }))
  const activePlans = getActiveInstallmentGroups(expenses, today)
  const visiblePlans = showAllPlans ? activePlans : activePlans.slice(0, PLANS_PREVIEW)

  // ---- Tendencia ----
  const trend = getTrailingMonths(6, monthStart).map((bucket) => {
    const inBucket = (type: Expense['transaction_type']) =>
      expenses.filter((e) => e.transaction_type === type && isInMonth(parseExpenseDate(e.date), bucket.monthStart))
    return { name: bucket.label, income: sumValues(inBucket('income')) / 100, expenses: sumValues(inBucket('expense')) / 100 }
  })

  // Purchasing power: average monthly spend ~6 months ago, adjusted by inflation since then (pesos)
  const purchasingPower = (() => {
    if (!inflationData || inflationData.cumulativeSixMonths <= 0) return null
    const referenceMonths = getTrailingMonths(3, subMonths(startOfMonth(today), 6))
    const totals = referenceMonths.map((bucket) =>
      expenses
        .filter((e) => e.transaction_type === 'expense' && isInMonth(parseExpenseDate(e.date), bucket.monthStart))
        .reduce((acc, e) => acc + e.amount_cents, 0)
    )
    const monthsWithData = totals.filter((t) => t > 0).length
    if (monthsWithData === 0) return null
    const avgOldCents = Math.round(totals.reduce((a, b) => a + b, 0) / monthsWithData / 100) * 100
    return {
      label: `${referenceMonths[0].label}–${referenceMonths[2].label}`,
      avgOldCents,
      // Rounded to whole pesos: centavos are noise in an estimate like this
      adjustedCents: Math.round((avgOldCents * (1 + inflationData.cumulativeSixMonths / 100)) / 100) * 100,
    }
  })()

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

  const tooltipStyle = {
    borderRadius: '8px',
    border: `1px solid ${chartColors.border}`,
    background: chartColors.card,
    color: chartColors.foreground,
  }
  const chartTooltipFormatter = (v: unknown) => formatCurrency((v as number) * 100, currency, true)

  return (
    <div className="space-y-4 sm:space-y-6 pb-20">
      {/* Month selector (shared with the Gastos tab) */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} aria-label="Mes anterior" className="border-border">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-foreground capitalize">{format(monthStart, 'MMMM yyyy', { locale: es })}</p>
          {!isCurrentMonth && (
            <button onClick={goToCurrentMonth} className="text-xs text-primary hover:underline">
              Volver al mes actual
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} aria-label="Mes siguiente" className="border-border">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* 1. El mes */}
      <Card>
        <CardTitle
          icon={<Wallet className="w-5 h-5 text-primary" />}
          title="Gastos del mes"
          aside={<ChangeChip percent={spendChange} />}
        />
        <p className="text-3xl font-bold text-foreground font-amount">{fmt(summary.spent)}</p>
        {/* The ▲▼ chip compares like with like: for the month in progress that's
            spending so far vs the previous month up to the same day */}
        <p className="text-sm text-muted-foreground mt-1">
          {summary.isFutureMonth
            ? 'Mes futuro: solo cuotas y gastos ya cargados'
            : isCurrentMonth
              ? <>Hasta hoy {fmt(summary.spentToDate)} · en {monthName(previousMonthStart)} a esta altura {fmt(summary.previousSpent)}</>
              : <>En {monthName(previousMonthStart)}: {fmt(summary.previousSpent)}</>}
        </p>

        <StatList>
          <Stat label="Ingresos" value={fmt(summary.income)} />
          {summary.dailyAverage !== null && <Stat label="Promedio por día" value={fmt(summary.dailyAverage)} />}
          {summary.projected !== null && <Stat label="Proyección a fin de mes" value={fmt(summary.projected)} />}
        </StatList>

        {incomeRatio !== null && (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">Gastos sobre ingresos</span>
              <span className="font-semibold text-foreground">{incomeRatio.toFixed(0)}%</span>
            </div>
            <ProgressBar percent={incomeRatio} tone={incomeRatio > 90 ? 'destructive' : incomeRatio > 80 ? 'warning' : 'success'} />
          </div>
        )}
      </Card>

      {/* 2. Ahorro */}
      <Card>
        <CardTitle icon={<PiggyBank className="w-5 h-5 text-primary" />} title="Ahorro" />
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <p className="text-2xl font-bold text-primary font-amount">{fmt(summary.savings)}</p>
          {savingsRate !== null && (
            <p className={`text-sm font-semibold ${savingsRate >= 20 ? 'text-success' : savingsRate >= 10 ? 'text-warning' : 'text-muted-foreground'}`}>
              {savingsRate.toFixed(0)}% de tus ingresos
            </p>
          )}
        </div>

        {goalPercent !== null ? (
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1.5 gap-2">
              <span className="text-muted-foreground">Meta mensual</span>
              <span className="font-semibold text-foreground font-amount whitespace-nowrap">
                {formatCurrency(savingsUsdCents, 'USD', true)} de {formatCurrency(monthlySavingsGoalUSD * 100, 'USD', true)}
              </span>
            </div>
            <ProgressBar percent={goalPercent} tone={goalPercent >= 100 ? 'success' : 'primary'} />
            {goalPercent >= 100 && <p className="text-xs text-success mt-1.5">¡Meta cumplida! 🎉</p>}
          </div>
        ) : (
          <button onClick={() => setIsSettingsOpen(true)} className="mt-3 text-sm text-primary hover:underline">
            Definir una meta de ahorro mensual
          </button>
        )}
      </Card>

      {/* 3. Presupuestos */}
      <Card>
        <CardTitle
          icon={<Target className="w-5 h-5 text-primary" />}
          title="Presupuestos"
          aside={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBudgetManagerOpen(true)}
              className="text-primary border-primary/30 hover:bg-primary/10"
            >
              Configurar
            </Button>
          }
        />
        {budgetProgress.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-2">
            No configuraste presupuestos todavía. Tocá "Configurar" para agregar uno por categoría.
          </p>
        ) : (
          <div className="space-y-3">
            {budgetProgress.map((b) => (
              <div key={b.categoryId}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{b.icon}</span>
                    <span className="font-medium text-foreground truncate">{b.name}</span>
                  </span>
                  <span className="text-sm text-muted-foreground font-amount whitespace-nowrap">
                    {fmtArs(b.spentCents)} de {fmtArs(b.budgetCents)}
                  </span>
                </div>
                <ProgressBar percent={b.percentage} tone={b.percentage > 100 ? 'destructive' : b.percentage > 80 ? 'warning' : 'success'} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 4. Categorías */}
      <Card>
        <CardTitle
          icon={<Tags className="w-5 h-5 text-primary" />}
          title="Categorías"
          aside={
            <div className="flex bg-muted rounded-lg p-1 shrink-0">
              {(Object.keys(PERIOD_LABELS) as CategoryPeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setCategoryPeriod(period)}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                    categoryPeriod === period ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {PERIOD_LABELS[period]}
                </button>
              ))}
            </div>
          }
        />

        {categoryRows.length === 0 ? (
          <p className="text-center text-muted-foreground py-4 text-sm">No hay gastos en este período</p>
        ) : (
          <>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryRows} dataKey="total" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2} stroke="none">
                    {categoryRows.map((c) => (
                      <Cell key={c.categoryId} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v as number)} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <ul className="mt-3 divide-y divide-border">
              {categoryRows.map((c) => (
                <li key={c.categoryId} className="flex items-center gap-3 py-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-foreground">
                      {c.icon} {c.name}
                    </p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      {categoryTotal > 0 ? ((c.total / categoryTotal) * 100).toFixed(0) : 0}% del total
                      {categoryPeriod === 'month' && <ChangeChip percent={c.changePercent} />}
                    </p>
                  </div>
                  <span className="font-semibold text-foreground font-amount whitespace-nowrap">{fmt(c.total)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {categoryPeriod === 'month' && topExpenses.length > 0 && (
          <div className="mt-5">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Mayores gastos del mes</h4>
            <ol className="space-y-2">
              {topExpenses.map((expense, index) => {
                const category = categories.find((c) => c.id === expense.category_id)
                return (
                  <li key={expense.id} className="flex items-center gap-3 p-2.5 bg-muted/30 rounded-xl">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{stripInstallmentSuffix(expense.description)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {category?.name}
                        {expense.is_installment && ` • Cuota ${expense.installment_number}/${expense.total_installments}`}
                      </p>
                    </div>
                    <span className="font-semibold text-foreground whitespace-nowrap font-amount">{fmt(value(expense))}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        )}
      </Card>

      {/* 5. Cuotas */}
      <Card>
        <CardTitle
          icon={<CreditCard className="w-5 h-5 text-primary" />}
          title="Cuotas"
          aside={activePlans.length > 0 && <span className="text-sm text-muted-foreground shrink-0">{activePlans.length} activas</span>}
        />
        {activePlans.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tenés cuotas pendientes.</p>
        ) : (
          <>
            <p className="text-2xl font-bold text-foreground font-amount">{fmt(totalDebt)}</p>
            <p className="text-sm text-muted-foreground">pendiente en total, desde hoy</p>

            <StatList>
              {upcomingDebt.map((m) => (
                <Stat key={m.key} label={capitalize(monthName(m.monthStart))} value={fmt(m.amount)} />
              ))}
            </StatList>

            <div className="space-y-3 mt-4">
              {visiblePlans.map((group) => {
                const category = categories.find((c) => c.id === group.categoryId)
                return (
                  <div key={group.groupId} className="p-3 bg-muted/30 rounded-xl">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl shrink-0">{category?.icon || '📦'}</span>
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
                        aria-label="Eliminar todas las cuotas"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <ProgressBar percent={(group.paidCount / group.totalInstallments) * 100} tone="primary" />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm mt-2">
                      <span className="text-muted-foreground whitespace-nowrap">
                        {group.paidCount} de {group.totalInstallments} pagadas
                      </span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        Resta <span className="font-semibold text-foreground font-amount">{fmt(sumValues(pendingInstallments.filter((e) => e.installment_group_id === group.groupId)))}</span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {activePlans.length > PLANS_PREVIEW && (
              <button onClick={() => setShowAllPlans(!showAllPlans)} className="mt-3 w-full text-sm text-primary hover:underline">
                {showAllPlans ? 'Ver menos' : `Ver todas (${activePlans.length})`}
              </button>
            )}
          </>
        )}
      </Card>

      {/* 6. Tendencia */}
      <Card>
        <CardTitle icon={<TrendingUp className="w-5 h-5 text-primary" />} title="Tendencia (6 meses)" />
        <div className="h-48 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} />
              <XAxis dataKey="name" stroke={chartColors.mutedForeground} fontSize={10} tickMargin={5} />
              <YAxis stroke={chartColors.mutedForeground} fontSize={10} width={44} tickFormatter={formatAxisTick} />
              <Tooltip formatter={chartTooltipFormatter} contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '12px', color: chartColors.mutedForeground }} />
              <Bar dataKey="income" name="Ingresos" fill={chartColors.success} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Gastos" fill={chartColors.destructive} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {(inflationData?.latest || purchasingPower) && (
          <div className="mt-4 pt-4 border-t border-border space-y-1.5 text-sm text-muted-foreground">
            {inflationData?.latest && (
              <p>
                Inflación (INDEC): <span className="font-semibold text-warning">{inflationData.latest.valor.toFixed(1)}%</span> en{' '}
                {format(parseExpenseDate(inflationData.latest.fecha.slice(0, 10)), 'MMM yyyy', { locale: es })} ·{' '}
                <span className="font-semibold text-warning">{inflationData.cumulativeSixMonths.toFixed(1)}%</span> en 6 meses
              </p>
            )}
            {purchasingPower && (
              <p>
                Lo que gastabas por mes en {purchasingPower.label} ({fmtArs(purchasingPower.avgOldCents)}) hoy equivale a{' '}
                <span className="font-semibold text-foreground font-amount">{fmtArs(purchasingPower.adjustedCents)}</span>.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteModalOpen(false)} />
          <div className="relative glass-card rounded-2xl p-6 shadow-2xl max-w-sm w-full">
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
