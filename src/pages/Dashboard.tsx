import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { supabase } from '../services/supabase'
import { formatCurrency } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Plus, CreditCard, Wallet, TrendingUp, ArrowRightLeft, Settings } from 'lucide-react'
import { AddExpenseModal } from '../components/AddExpenseModal'
import { CategoryManager } from '../components/CategoryManager'
import { AddIncomeModal } from '../components/AddIncomeModal'

export function Dashboard() {
  const { expenses, setExpenses, categories, setCategories, showUsd, toggleShowUsd, exchangeRate } = useAppStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false)
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchExpenses()
    fetchCategories()
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

  const fetchExchangeRate = async () => {
    try {
      // Fetch from Banco Nación API (or use a mock for now)
      // In production, replace with actual API call
      // For now, we'll use a default rate
      // const response = await fetch('https://api.bcra.gob.ar/estadisticas/v1/principalesvariables')
      // const data = await response.json()
    } catch (err) {
      console.error('Error fetching exchange rate:', err)
    }
  }

  // Calculate totals
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  
  const monthlyTransactions = expenses.filter(expense => {
    const expenseDate = new Date(expense.date)
    return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear
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

  const pendingCuotas = expenses.filter(e => 
    e.is_installment && 
    e.status === 'pending' &&
    new Date(e.date) <= new Date()
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-violet-600">Cargando...</div>
      </div>
    )
  }

  return (
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
          <div className="text-4xl font-bold text-violet-600 mb-1">
            {showUsd ? formatCurrency(balanceUsd, 'USD') : formatCurrency(balanceArs, 'ARS')}
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
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => setIsIncomeModalOpen(true)}
          variant="outline"
          className="bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 py-3"
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Agregar Ingreso
        </Button>
        <Button
          onClick={() => setIsCategoryManagerOpen(true)}
          variant="outline"
          className="bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 py-3"
        >
          <Settings className="w-4 h-4 mr-2" />
          Categorías
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
            {expenses.slice(0, 5).map((expense) => (
              <div key={expense.id} className="p-4 flex items-center justify-between hover:bg-violet-50/50">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    expense.payment_method === 'credit' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {expense.payment_method === 'credit' ? <CreditCard className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{expense.description}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(expense.date).toLocaleDateString('es-AR')}
                      {expense.is_installment && ` • Cuota ${expense.installment_number}/${expense.total_installments}`}
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

      {/* Category Manager */}
      <CategoryManager
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
      />
    </div>
  )
}
