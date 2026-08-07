import { useState, useEffect } from 'react'
import { useUserStore } from '../stores/userStore'
import { useDataStore } from '../stores/dataStore'
import { formatCurrency } from '../lib/utils'
import { supabase } from '../services/supabase'
import type { Expense } from '../services/supabase'
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts'
import { CreditCard, TrendingUp, Trash2, Package, CalendarDays, PiggyBank } from 'lucide-react'
import { fetchInflationData, type ProcessedInflation } from '../services/inflation'
import { useToastStore } from '../stores/toastStore'

export function SummaryView() {
  const { exchangeRate, showUsd } = useUserStore()
  const { expenses, categories } = useDataStore()
  const [isLoading, setIsLoading] = useState(true)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null)
  const [inflationData, setInflationData] = useState<ProcessedInflation | null>(null)
  const [isLoadingInflation, setIsLoadingInflation] = useState(true)

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

  if (isLoading || isLoadingInflation) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-violet-600">Cargando resumen...</div>
      </div>
    )
  }

  // Calculate all metrics
  const currentDate = new Date()
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()

  // Total debt (all pending installments)
  const allPendingInstallments = expenses.filter(e => 
    e.is_installment && e.status === 'pending'
  )
  const totalDebt = allPendingInstallments.reduce((sum, e) => sum + e.amount_cents, 0)
  const totalDebtUsd = allPendingInstallments.reduce((sum, e) => sum + (e.usd_amount_cents || 0), 0)

  // This month vs next months debt
  const thisMonthDebt = allPendingInstallments
    .filter(e => {
      const date = new Date(e.date + 'T12:00:00')
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear
    })
    .reduce((sum, e) => sum + e.amount_cents, 0)
  
  const nextMonthsDebt = totalDebt - thisMonthDebt

  // Monthly data for last 6 months
  const last6Months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1)
    const monthName = d.toLocaleDateString('es-AR', { month: 'short' })
    const month = d.getMonth()
    const year = d.getFullYear()
    
    const monthExpenses = expenses.filter(e => {
      const date = new Date(e.date + 'T12:00:00')
      return date.getMonth() === month && date.getFullYear() === year && e.amount_cents > 0
    })
    
    const monthIncome = expenses.filter(e => {
      const date = new Date(e.date + 'T12:00:00')
      return date.getMonth() === month && date.getFullYear() === year && e.amount_cents < 0
    })
    
    last6Months.push({
      name: monthName,
      income: monthIncome.reduce((sum, e) => sum + Math.abs(e.amount_cents), 0) / 100,
      expenses: monthExpenses.reduce((sum, e) => sum + e.amount_cents, 0) / 100,
    })
  }

  // Top categories
  const categoryTotals = new Map()
  expenses
    .filter(e => e.amount_cents > 0)
    .forEach(e => {
      const cat = categories.find(c => c.id === e.category_id)
      if (cat) {
        const current = categoryTotals.get(cat.id) || { ...cat, total: 0 }
        current.total += e.amount_cents
        categoryTotals.set(cat.id, current)
      }
    })
  
  const topCategories = Array.from(categoryTotals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(c => ({
      name: c.name,
      value: c.total / 100,
      color: c.color,
      icon: c.icon,
    }))

  // Daily spending for last 30 days
  const last30Days = []
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    
    const dayExpenses = expenses
      .filter(e => e.date === dateStr && e.amount_cents > 0)
      .reduce((sum, e) => sum + e.amount_cents, 0)
    
    last30Days.push({
      day: d.getDate(),
      amount: dayExpenses / 100,
    })
  }

  // Average metrics
  const currentDay = currentDate.getDate()
  
  const currentMonthExpenses = expenses
    .filter(e => {
      const date = new Date(e.date + 'T12:00:00')
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear && e.amount_cents > 0
    })
    .reduce((sum, e) => sum + e.amount_cents, 0)
  
  const dailyAverage = currentDay > 0 ? currentMonthExpenses / currentDay : 0

  // Group all active installments by group_id
  const allInstallments = expenses.filter(e => e.is_installment)
  const groupedInstallments = new Map()
  
  allInstallments.forEach(e => {
    if (!groupedInstallments.has(e.installment_group_id)) {
      groupedInstallments.set(e.installment_group_id, [])
    }
    groupedInstallments.get(e.installment_group_id).push(e)
  })
  
  // Create summary for each installment group
  const activeInstallmentGroups = Array.from(groupedInstallments.entries()).map(([groupId, items]) => {
    const sorted = items.sort((a: Expense, b: Expense) => (a.installment_number || 0) - (b.installment_number || 0))
    const first = sorted[0]
    const totalInstallments = first.total_installments || sorted.length
    
    // Calculate paid count based on status OR if the installment date has passed
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const paidCount = sorted.filter((e: Expense) => {
      if (e.status === 'paid') return true
      const installmentDate = new Date(e.date + 'T12:00:00')
      return installmentDate < today
    }).length
    
    const firstPending = sorted.find((e: Expense) => e.status === 'pending')
    const currentNumber = firstPending?.installment_number || (paidCount + 1)
    const totalAmount = sorted.reduce((sum: number, e: Expense) => sum + e.amount_cents, 0)
    const remainingAmount = sorted
      .filter((e: Expense) => e.status === 'pending')
      .reduce((sum: number, e: Expense) => sum + e.amount_cents, 0)
    
    return {
      groupId,
      description: first.description.replace(/\s*\(\d+\/\d+\)$/, ''),
      currentNumber,
      totalInstallments,
      paidCount,
      remainingCount: totalInstallments - paidCount,
      totalAmount,
      remainingAmount,
      categoryId: first.category_id,
    }
  }).filter(g => g.remainingCount > 0) // Only show active ones

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')
      
      await supabase
        .from('expenses')
        .delete()
        .eq('installment_group_id', groupToDelete)
        .eq('user_id', user.id)
      
      // Refresh page
      window.location.reload()
    } catch (err) {
      console.error('Error deleting group:', err)
      useToastStore.getState().addToast('Error al eliminar el grupo de cuotas')
    }
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Total Debt Card (Cuotas) */}
      <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-6 h-6" />
          <h2 className="text-lg font-semibold">Deuda Total Pendiente (Cuotas)</h2>
        </div>
        <div className="text-3xl font-bold mb-3">
          {showUsd ? formatCurrency(totalDebtUsd, 'USD') : formatCurrency(totalDebt, 'ARS')}
        </div>
        <div className="flex gap-4 text-sm">
          <div className="bg-white/20 rounded-lg px-3 py-2">
            <span className="opacity-80">Este mes:</span>
            <span className="font-semibold ml-1">
              {showUsd ? formatCurrency(thisMonthDebt / exchangeRate, 'USD') : formatCurrency(thisMonthDebt, 'ARS')}
            </span>
          </div>
          <div className="bg-white/20 rounded-lg px-3 py-2">
            <span className="opacity-80">Próximos meses:</span>
            <span className="font-semibold ml-1">
              {showUsd ? formatCurrency(nextMonthsDebt / exchangeRate, 'USD') : formatCurrency(nextMonthsDebt, 'ARS')}
            </span>
          </div>
        </div>
      </div>

      {/* Inflation Card */}
      {inflationData?.latest && (
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 sm:p-6 text-white">
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-white/20 p-2 rounded-lg">
              <span className="text-xl">📈</span>
            </div>
            <h2 className="text-base sm:text-lg font-semibold">Inflación Oficial</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <div className="text-2xl sm:text-3xl font-bold">
                {inflationData.latest.valor.toFixed(1)}%
              </div>
              <p className="text-xs sm:text-sm opacity-90 mt-1">
                {new Date(inflationData.latest.fecha).toLocaleDateString('es-AR', { 
                  month: 'short', 
                  year: 'numeric' 
                })}
              </p>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold">
                {inflationData.cumulativeSixMonths.toFixed(1)}%
              </div>
              <p className="text-xs sm:text-sm opacity-90 mt-1">
                Acumulado 6 meses
              </p>
            </div>
          </div>
          
          <p className="text-xs opacity-70 mt-3">
            Fuente: INDEC vía ArgentinaDatos
          </p>
        </div>
      )}

      {/* Savings Rate and 3-Month Debt Cards */}
      {(() => {
        // Calculate current month totals
        const currentDate = new Date()
        const currentMonth = currentDate.getMonth()
        const currentYear = currentDate.getFullYear()
        
        const currentMonthData = last6Months[last6Months.length - 1]
        const totalIncome = (currentMonthData?.income || 0) * 100
        const totalSavings = expenses
          .filter(e => {
            const date = new Date(e.date + 'T12:00:00')
            return date.getMonth() === currentMonth && 
                   date.getFullYear() === currentYear && 
                   e.transaction_type === 'savings'
          })
          .reduce((sum, e) => sum + Math.abs(e.amount_cents), 0)
        
        const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0
        
        // Calculate 3-month debt
        const pendingInstallments = expenses.filter(e => 
          e.is_installment && e.status === 'pending'
        )
        
        let month1Debt = 0, month2Debt = 0, month3Debt = 0
        
        pendingInstallments.forEach(e => {
          const date = new Date(e.date + 'T12:00:00')
          const month = date.getMonth()
          const year = date.getFullYear()
          
          if (year === currentYear && month === currentMonth) {
            month1Debt += e.amount_cents
          } else if ((year === currentYear && month === currentMonth + 1) || 
                     (year === currentYear + 1 && currentMonth === 11 && month === 0)) {
            month2Debt += e.amount_cents
          } else if ((year === currentYear && month === currentMonth + 2) || 
                     (year === currentYear + 1 && currentMonth === 10 && month === 0) ||
                     (year === currentYear + 1 && currentMonth === 11 && month === 1)) {
            month3Debt += e.amount_cents
          }
        })
        
        const total3MonthDebt = month1Debt + month2Debt + month3Debt
        const total3MonthDebtUsd = total3MonthDebt / exchangeRate
        
        const monthNames = [
          new Date(currentYear, currentMonth).toLocaleDateString('es-AR', { month: 'short' }),
          new Date(currentYear, currentMonth + 1).toLocaleDateString('es-AR', { month: 'short' }),
          new Date(currentYear, currentMonth + 2).toLocaleDateString('es-AR', { month: 'short' })
        ]
        
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Savings Rate Card */}
            <div className={`rounded-2xl p-6 text-white ${
              savingsRate >= 20 ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' :
              savingsRate >= 10 ? 'bg-gradient-to-br from-amber-500 to-orange-500' :
              'bg-gradient-to-br from-red-500 to-red-600'
            }`}>
              <div className="flex items-center gap-2 mb-4">
                <PiggyBank className="w-6 h-6" />
                <h2 className="text-lg font-semibold">Tasa de Ahorro</h2>
              </div>
              <div className="text-3xl font-bold mb-2">
                {savingsRate.toFixed(1)}%
              </div>
              <div className="bg-white/20 rounded-lg px-3 py-2 text-sm">
                <span className="opacity-80">
                  {savingsRate >= 20 ? '¡Excelente! Estás ahorrando muy bien' :
                   savingsRate >= 10 ? 'Bien, pero podrías ahorrar más' :
                   'Alerta: Ahorro muy bajo'}
                </span>
              </div>
            </div>

            {/* Upcoming 3 Month Debt Card */}
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="w-6 h-6" />
                <h2 className="text-lg font-semibold">Deuda Próximos 3 Meses</h2>
              </div>
              <div className="text-3xl font-bold mb-3">
                {showUsd ? formatCurrency(total3MonthDebtUsd, 'USD') : formatCurrency(total3MonthDebt, 'ARS')}
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <div className="bg-white/20 rounded-lg px-3 py-1 flex justify-between">
                  <span className="opacity-80">{monthNames[0]}:</span>
                  <span className="font-semibold">
                    {showUsd ? formatCurrency(month1Debt / exchangeRate, 'USD') : formatCurrency(month1Debt, 'ARS')}
                  </span>
                </div>
                <div className="bg-white/20 rounded-lg px-3 py-1 flex justify-between">
                  <span className="opacity-80">{monthNames[1]}:</span>
                  <span className="font-semibold">
                    {showUsd ? formatCurrency(month2Debt / exchangeRate, 'USD') : formatCurrency(month2Debt, 'ARS')}
                  </span>
                </div>
                <div className="bg-white/20 rounded-lg px-3 py-1 flex justify-between">
                  <span className="opacity-80">{monthNames[2]}:</span>
                  <span className="font-semibold">
                    {showUsd ? formatCurrency(month3Debt / exchangeRate, 'USD') : formatCurrency(month3Debt, 'ARS')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Monthly Comparison Chart */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-violet-100">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Ingresos vs Gastos (Últimos 6 meses)</h3>
        <div className="h-48 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last6Months} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickMargin={5} />
              <YAxis stroke="#6b7280" fontSize={10} width={40} />
              <Tooltip 
                formatter={(value) => formatCurrency((value as number) * 100, 'ARS')}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Categories & Financial Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Categories Pie Chart */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg border border-violet-100">
          <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-4">Gastos por Categoría</h3>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topCategories}
                  cx="50%"
                  cy="45%"
                  labelLine={false}
                  label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={60}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {topCategories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency((value as number) * 100, 'ARS')} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Category legend for mobile */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:hidden">
            {topCategories.map((cat, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></span>
                <span className="text-gray-600 truncate">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Insights */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg border border-violet-100">
          <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-4">Estado Financiero</h3>
          
          {/* Status Indicator */}
          <div className="mb-6">
            {(() => {
              const totalIncome = last6Months[5]?.income * 100 || 0
              const totalExpenses = last6Months[5]?.expenses * 100 || 0
              const ratio = totalIncome > 0 ? totalExpenses / totalIncome : 0
              
              let status: 'good' | 'warning' | 'danger' = 'good'
              let message = ''
              let icon = '🟢'
              
              if (ratio > 0.9) {
                status = 'danger'
                message = 'Alerta: Gastos superan el 90% de tus ingresos'
                icon = '🔴'
              } else if (ratio > 0.8) {
                status = 'warning'
                message = 'Atención: Gastos elevados'
                icon = '🟡'
              } else {
                status = 'good'
                message = 'Todo bien: Gastos bajo control'
                icon = '🟢'
              }
              
              return (
                <div className={`p-4 rounded-xl ${
                  status === 'good' ? 'bg-emerald-50 border border-emerald-200' :
                  status === 'warning' ? 'bg-amber-50 border border-amber-200' :
                  'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{icon}</span>
                    <div>
                      <p className={`font-semibold ${
                        status === 'good' ? 'text-emerald-700' :
                        status === 'warning' ? 'text-amber-700' :
                        'text-red-700'
                      }`}>
                        {message}
                      </p>
                      <p className="text-sm text-gray-600">
                        Estás usando el {(ratio * 100).toFixed(0)}% de tus ingresos
                      </p>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
          
          {/* Month-over-Month Comparison */}
          {last6Months.length >= 2 && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-700">Comparación vs Mes Anterior</h4>
              {(() => {
                const current = last6Months[last6Months.length - 1]
                const previous = last6Months[last6Months.length - 2]
                const expenseChange = previous.expenses > 0 
                  ? ((current.expenses - previous.expenses) / previous.expenses) * 100 
                  : 0
                
                return (
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Variación de gastos</span>
                    <span className={`font-semibold ${
                      expenseChange > 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}>
                      {expenseChange > 0 ? '↑' : '↓'} {Math.abs(expenseChange).toFixed(1)}%
                    </span>
                  </div>
                )
              })()}
            </div>
          )}
          
          {/* Daily Average */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between p-4 bg-violet-50 rounded-xl">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-violet-600" />
                <span className="text-gray-700">Gasto promedio diario</span>
              </div>
              <span className="font-bold text-violet-600">
                {formatCurrency(dailyAverage, 'ARS')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Purchasing Power Impact */}
      {inflationData && inflationData.cumulativeSixMonths > 0 && (() => {
        // Get expenses from 6 months ago
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
        
        const oldExpenses = expenses.filter(e => {
          const date = new Date(e.date + 'T12:00:00')
          return date.getMonth() === sixMonthsAgo.getMonth() && 
                 date.getFullYear() === sixMonthsAgo.getFullYear() &&
                 e.amount_cents > 0
        })
        
        const cumulativeInflation = inflationData.cumulativeSixMonths
        
        return (
          <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg border border-violet-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-amber-100 p-2 rounded-lg">
                <span className="text-xl">💸</span>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-700">Impacto en tu Poder Adquisitivo</h3>
            </div>
            
            <div className="space-y-4">
              {oldExpenses.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No hay gastos registrados de hace 6 meses para comparar
                </p>
              ) : (() => {
                const oldTotal = oldExpenses.reduce((sum, e) => sum + e.amount_cents, 0)
                const adjustedTotal = oldTotal * (1 + cumulativeInflation / 100)
                
                return (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm text-gray-600">Gastos de {sixMonthsAgo.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</p>
                        <p className="text-xs text-gray-400">Sin ajustar</p>
                      </div>
                      <span className="text-xl font-bold text-gray-900">
                        {showUsd ? formatCurrency(oldTotal / exchangeRate, 'USD') : formatCurrency(oldTotal, 'ARS')}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center p-4 bg-amber-50 rounded-xl border border-amber-200">
                      <div>
                        <p className="text-sm text-amber-900">Equivalente hoy</p>
                        <p className="text-xs text-amber-700">Ajustado por inflación ({cumulativeInflation.toFixed(1)}%)</p>
                      </div>
                      <span className="text-xl font-bold text-amber-700">
                        {showUsd ? formatCurrency(adjustedTotal / exchangeRate, 'USD') : formatCurrency(adjustedTotal, 'ARS')}
                      </span>
                    </div>
                    
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <p className="text-sm text-red-700">
                        <span className="font-bold">Pérdida de poder adquisitivo:</span> Tus gastos de hace 6 meses equivalen a {((adjustedTotal / oldTotal - 1) * 100).toFixed(1)}% más hoy
                      </p>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )
      })()}

      {/* Daily Spending Trend */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg border border-violet-100">
        <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-4">Tendencia de Gastos (Últimos 30 días)</h3>
        <div className="h-40 sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last30Days} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" stroke="#6b7280" fontSize={9} interval={4} tickMargin={5} />
              <YAxis stroke="#6b7280" fontSize={10} width={40} />
              <Tooltip 
                formatter={(value) => formatCurrency((value as number) * 100, 'ARS')}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              />
              <Line 
                type="monotone" 
                dataKey="amount" 
                stroke="#8b5cf6" 
                strokeWidth={2}
                dot={{ fill: '#8b5cf6', strokeWidth: 0, r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top 5 Expenses */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg border border-violet-100">
        <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-4">Top 5 Gastos del Mes</h3>
        <div className="space-y-3">
          {expenses
            .filter(e => {
              const date = new Date(e.date + 'T12:00:00')
              return date.getMonth() === currentMonth && 
                     date.getFullYear() === currentYear && 
                     e.amount_cents > 0
            })
            .sort((a, b) => b.amount_cents - a.amount_cents)
            .slice(0, 5)
            .map((expense, index) => {
              const category = categories.find(c => c.id === expense.category_id)
              return (
                <div key={expense.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-gray-900">{expense.description}</p>
                      <p className="text-xs text-gray-500">{category?.name}</p>
                    </div>
                  </div>
                  <span className="font-semibold text-violet-600">
                    {showUsd 
                      ? formatCurrency(expense.usd_amount_cents || 0, 'USD') 
                      : formatCurrency(expense.amount_cents, 'ARS')
                    }
                  </span>
                </div>
              )
            })}
          
          {expenses.filter(e => {
            const date = new Date(e.date + 'T12:00:00')
            return date.getMonth() === currentMonth && 
                   date.getFullYear() === currentYear && 
                   e.amount_cents > 0
          }).length === 0 && (
            <p className="text-center text-gray-500 py-4">
              No hay gastos registrados este mes
            </p>
          )}
        </div>
      </div>

      {/* All Active Installments */}
      {activeInstallmentGroups.length > 0 && (
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg border border-violet-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-violet-600" />
              <h3 className="text-lg font-semibold text-gray-700">Cuotas en Progreso</h3>
            </div>
            <span className="text-sm text-gray-500">{activeInstallmentGroups.length} activas</span>
          </div>
          
          <div className="space-y-4">
            {activeInstallmentGroups.map((group) => {
              const category = categories.find(c => c.id === group.categoryId)
              const progressPercent = (group.paidCount / group.totalInstallments) * 100
              
              return (
                <div key={group.groupId} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{category?.icon || '📦'}</span>
                      <div>
                        <p className="font-medium text-gray-900">{group.description}</p>
                        <p className="text-sm text-violet-600 font-semibold">
                          Cuota {group.currentNumber} / {group.totalInstallments}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setGroupToDelete(group.groupId)
                        setDeleteModalOpen(true)
                      }}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar todas las cuotas"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Progress bar */}
                  <div className="mb-2">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-violet-500 rounded-full transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {group.paidCount} pagadas • {group.remainingCount} restantes
                    </span>
                    <span className="font-semibold text-gray-900">
                      {showUsd 
                        ? formatCurrency(group.remainingAmount / exchangeRate, 'USD')
                        : formatCurrency(group.remainingAmount, 'ARS')
                      } restantes
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
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteModalOpen(false)} />
          <div className="relative bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Eliminar todas las cuotas</h3>
            <p className="text-gray-600 mb-4">
              ¿Estás seguro de que quieres eliminar TODAS las cuotas de este pago? 
              Se eliminarán las cuotas pagadas y pendientes de todos los meses.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteGroup}
                className="flex-1 py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg"
              >
                <Trash2 className="w-4 h-4 inline mr-2" />
                Eliminar todo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
