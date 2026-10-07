import { useState } from 'react'
import { useUserStore } from '../stores/userStore'
import { useDataStore } from '../stores/dataStore'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, Plus, Target, Trash2, TrendingUp } from 'lucide-react'
import { formatCurrency } from '../lib/utils'
import { getCurrentMonthExpenseByCategory } from '../lib/categoryAggregation'

interface BudgetManagerProps {
  isOpen: boolean
  onClose: () => void
}

export function BudgetManager({ isOpen, onClose }: BudgetManagerProps) {
  const { budgets, setBudget, removeBudget } = useUserStore()
  const { categories, expenses } = useDataStore()
  const [selectedCategory, setSelectedCategory] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  if (!isOpen) return null

  // Current-month, expense-only spending per category (excludes savings transfers)
  const categorySpending = getCurrentMonthExpenseByCategory(expenses, categories)

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
      
      <div className="relative bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Presupuestos</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {/* Add New Budget Button */}
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full flex items-center justify-center gap-2 py-3 mb-4 border-2 border-dashed border-primary/30 rounded-xl text-primary hover:bg-primary/10 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Agregar presupuesto
            </button>
          ) : (
            <div className="mb-4 p-4 bg-secondary rounded-xl space-y-3">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground"
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
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">$</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  placeholder="Monto mensual"
                  className="pl-8 bg-background"
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
                  className="flex-1"
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
                <div key={categoryId} className="p-4 bg-secondary rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{category.icon}</span>
                      <span className="font-medium text-foreground">{category.name}</span>
                    </div>
                    <button
                      onClick={() => removeBudget(categoryId)}
                      className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mb-2">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          isOverBudget ? 'bg-destructive' : percentage > 80 ? 'bg-warning' : 'bg-success'
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Numbers */}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Gastado: <span className="font-semibold text-foreground font-amount">{formatCurrency(spent, 'ARS')}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Presupuesto: <span className="font-semibold text-foreground font-amount">{formatCurrency(budgetAmount, 'ARS')}</span>
                    </span>
                  </div>
                  
                  {isOverBudget && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-destructive font-medium">
                      <TrendingUp className="w-3 h-3" />
                      Excedido por {formatCurrency(Math.abs(remaining), 'ARS')}
                    </div>
                  )}
                  
                  {!isOverBudget && percentage > 80 && (
                    <div className="mt-2 text-xs text-warning font-medium">
                      ⚠️ Cerca del límite ({percentage.toFixed(0)}%)
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {Object.keys(budgets).length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-2 text-primary/30" />
              <p>No hay presupuestos configurados</p>
              <p className="text-sm mt-1">Agrega un presupuesto para controlar tus gastos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
