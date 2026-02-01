import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, Plus, Target, Trash2, TrendingUp } from 'lucide-react'
import { formatCurrency } from '../lib/utils'

interface BudgetManagerProps {
  isOpen: boolean
  onClose: () => void
}

export function BudgetManager({ isOpen, onClose }: BudgetManagerProps) {
  const { categories, budgets, setBudget, removeBudget, expenses } = useAppStore()
  const [selectedCategory, setSelectedCategory] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  if (!isOpen) return null

  // Calculate current spending per category for this month
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  
  const categorySpending = new Map<string, number>()
  expenses
    .filter(e => {
      const date = new Date(e.date)
      return date.getMonth() === currentMonth && 
             date.getFullYear() === currentYear && 
             e.amount_cents > 0
    })
    .forEach(e => {
      const current = categorySpending.get(e.category_id) || 0
      categorySpending.set(e.category_id, current + e.amount_cents)
    })

  const handleAddBudget = () => {
    if (!selectedCategory || !budgetAmount) return
    
    const amountCents = Math.round(parseFloat(budgetAmount) * 100)
    setBudget(selectedCategory, amountCents)
    
    setSelectedCategory('')
    setBudgetAmount('')
    setIsAdding(false)
  }

  const getProgress = (categoryId: string, budgetAmount: number) => {
    const spent = categorySpending.get(categoryId) || 0
    const percentage = Math.min((spent / budgetAmount) * 100, 100)
    return { spent, percentage, remaining: budgetAmount - spent }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-violet-600" />
            <h2 className="text-xl font-bold text-gray-900">Presupuestos</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {/* Add New Budget Button */}
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full flex items-center justify-center gap-2 py-3 mb-4 border-2 border-dashed border-violet-300 rounded-xl text-violet-600 hover:bg-violet-50 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Agregar presupuesto
            </button>
          ) : (
            <div className="mb-4 p-4 bg-violet-50 rounded-xl space-y-3">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
              >
                <option value="">Seleccionar categoría</option>
                {categories
                  .filter(c => !budgets[c.id])
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
              </select>
              
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">$</span>
                <Input
                  type="number"
                  step="0.01"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  placeholder="Monto mensual"
                  className="pl-8 bg-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAdding(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleAddBudget}
                  disabled={!selectedCategory || !budgetAmount}
                  className="flex-1 bg-violet-600 hover:bg-violet-700"
                >
                  Agregar
                </Button>
              </div>
            </div>
          )}

          {/* Budget List */}
          <div className="space-y-4">
            {Object.entries(budgets).map(([categoryId, budgetAmount]) => {
              const category = categories.find(c => c.id === categoryId)
              if (!category) return null
              
              const { spent, percentage, remaining } = getProgress(categoryId, budgetAmount)
              const isOverBudget = spent > budgetAmount
              
              return (
                <div key={categoryId} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{category.icon}</span>
                      <span className="font-medium text-gray-900">{category.name}</span>
                    </div>
                    <button
                      onClick={() => removeBudget(categoryId)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mb-2">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          isOverBudget ? 'bg-red-500' : percentage > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Numbers */}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      Gastado: <span className="font-semibold">{formatCurrency(spent, 'ARS')}</span>
                    </span>
                    <span className="text-gray-600">
                      Presupuesto: <span className="font-semibold">{formatCurrency(budgetAmount, 'ARS')}</span>
                    </span>
                  </div>
                  
                  {isOverBudget && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-red-600 font-medium">
                      <TrendingUp className="w-3 h-3" />
                      Excedido por {formatCurrency(Math.abs(remaining), 'ARS')}
                    </div>
                  )}
                  
                  {!isOverBudget && percentage > 80 && (
                    <div className="mt-2 text-xs text-amber-600 font-medium">
                      ⚠️ Cerca del límite ({percentage.toFixed(0)}%)
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {Object.keys(budgets).length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Target className="w-12 h-12 mx-auto mb-2 text-violet-300" />
              <p>No hay presupuestos configurados</p>
              <p className="text-sm mt-1">Agrega un presupuesto para controlar tus gastos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
