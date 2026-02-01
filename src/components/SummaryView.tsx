import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { formatCurrency } from '../lib/utils'
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line
} from 'recharts'
import { CreditCard, TrendingUp, Calendar, DollarSign } from 'lucide-react'

export function SummaryView() {
  const { expenses, categories, exchangeRate, showUsd } = useAppStore()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(false)
  }, [expenses])

  if (isLoading) {
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
      const date = new Date(e.date)
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
      const date = new Date(e.date)
      return date.getMonth() === month && date.getFullYear() === year && e.amount_cents > 0
    })
    
    const monthIncome = expenses.filter(e => {
      const date = new Date(e.date)
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
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const currentDay = currentDate.getDate()
  const daysRemaining = daysInMonth - currentDay
  
  const currentMonthExpenses = expenses
    .filter(e => {
      const date = new Date(e.date)
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear && e.amount_cents > 0
    })
    .reduce((sum, e) => sum + e.amount_cents, 0)
  
  const dailyAverage = currentDay > 0 ? currentMonthExpenses / currentDay : 0
  const projectedMonthly = dailyAverage * daysInMonth

  // Next payment dates
  const nextPayments = allPendingInstallments
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3)

  return (
    <div className="space-y-6 pb-20">
      {/* Total Debt Card */}
      <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-6 h-6" />
          <h2 className="text-lg font-semibold">Deuda Total Pendiente</h2>
        </div>
        <div className="text-3xl font-bold mb-3">
          {showUsd ? formatCurrency(totalDebtUsd, 'USD') : formatCurrency(totalDebt, 'ARS')}
        </div>
        <div className="flex gap-4 text-sm">
          <div className="bg-white/20 rounded-lg px-3 py-2">
            <span className="opacity-80">Este mes:</span>
            <span className="font-semibold ml-1">
              {showUsd ? formatCurrency(thisMonthDebt * (exchangeRate / 100) / 100, 'USD') : formatCurrency(thisMonthDebt, 'ARS')}
            </span>
          </div>
          <div className="bg-white/20 rounded-lg px-3 py-2">
            <span className="opacity-80">Próximos meses:</span>
            <span className="font-semibold ml-1">
              {showUsd ? formatCurrency(nextMonthsDebt * (exchangeRate / 100) / 100, 'USD') : formatCurrency(nextMonthsDebt, 'ARS')}
            </span>
          </div>
        </div>
      </div>

      {/* Monthly Comparison Chart */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-violet-100">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Ingresos vs Gastos (Últimos 6 meses)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last6Months}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip 
                formatter={(value) => formatCurrency((value as number) * 100, 'ARS')}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              />
              <Legend />
              <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Categories & Daily Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categories Pie Chart */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-violet-100">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Gastos por Categoría</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topCategories}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
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
        </div>

        {/* Average Metrics */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-violet-100">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Métricas del Mes</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-violet-50 rounded-xl">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-violet-600" />
                <span className="text-gray-700">Gasto promedio diario</span>
              </div>
              <span className="font-bold text-violet-600">
                {formatCurrency(dailyAverage, 'ARS')}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-amber-50 rounded-xl">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-amber-600" />
                <span className="text-gray-700">Proyección mensual</span>
              </div>
              <span className="font-bold text-amber-600">
                {formatCurrency(projectedMonthly, 'ARS')}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-blue-600" />
                <span className="text-gray-700">Días restantes</span>
              </div>
              <span className="font-bold text-blue-600">{daysRemaining} días</span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Spending Trend */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-violet-100">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Tendencia de Gastos (Últimos 30 días)</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last30Days}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" stroke="#6b7280" fontSize={10} />
              <YAxis stroke="#6b7280" fontSize={10} />
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

      {/* Next Payments */}
      {nextPayments.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-violet-100">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Próximos Vencimientos</h3>
          <div className="space-y-3">
            {nextPayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-violet-600" />
                  <div>
                    <p className="font-medium text-gray-900">{payment.description}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(payment.date).toLocaleDateString('es-AR', { 
                        weekday: 'long', 
                        day: 'numeric', 
                        month: 'long' 
                      })}
                    </p>
                  </div>
                </div>
                <span className="font-semibold text-violet-600">
                  {showUsd 
                    ? formatCurrency(payment.usd_amount_cents || 0, 'USD') 
                    : formatCurrency(payment.amount_cents, 'ARS')
                  }
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
