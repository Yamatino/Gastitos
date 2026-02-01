import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { supabase } from '../services/supabase'
import { Input } from './ui/input'
import { X, Repeat, Trash2, Edit2, Check } from 'lucide-react'
import { formatCurrency } from '../lib/utils'

interface RecurringManagerProps {
  isOpen: boolean
  onClose: () => void
}

export function RecurringManager({ isOpen, onClose }: RecurringManagerProps) {
  const { expenses, categories, setExpenses } = useAppStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen) return null

  // Get unique recurring expenses (group by description + category)
  const recurringMap = new Map()
  expenses
    .filter(e => e.is_recurring)
    .forEach(e => {
      const key = `${e.description}-${e.category_id}`
      if (!recurringMap.has(key) || new Date(e.date) > new Date(recurringMap.get(key).date)) {
        recurringMap.set(key, e)
      }
    })
  
  const recurringExpenses = Array.from(recurringMap.values())

  const handleDelete = async (expense: typeof recurringExpenses[0]) => {
    if (!confirm('¿Eliminar este gasto recurrente? Se dejarán de crear automáticamente.')) return
    
    setIsLoading(true)
    try {
      // Delete all future instances of this recurring expense
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')
      
      await supabase
        .from('expenses')
        .delete()
        .eq('user_id', user.id)
        .eq('description', expense.description)
        .eq('category_id', expense.category_id)
        .eq('is_recurring', true)
        .gte('date', new Date().toISOString().split('T')[0])
      
      // Refresh expenses
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false })
        .limit(50)
      
      if (data) setExpenses(data)
    } catch (err) {
      console.error('Error deleting recurring expense:', err)
      alert('Error al eliminar')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = async (expense: typeof recurringExpenses[0]) => {
    if (!editAmount) return
    
    const amountCents = Math.round(parseFloat(editAmount) * 100)
    const usdAmountCents = Math.round(amountCents / expense.exchange_rate)
    
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')
      
      // Update the template and all future instances
      await supabase
        .from('expenses')
        .update({ 
          amount_cents: amountCents,
          usd_amount_cents: usdAmountCents
        })
        .eq('user_id', user.id)
        .eq('description', expense.description)
        .eq('category_id', expense.category_id)
        .eq('is_recurring', true)
        .gte('date', new Date().toISOString().split('T')[0])
      
      setEditingId(null)
      setEditAmount('')
      
      // Refresh
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false })
        .limit(50)
      
      if (data) setExpenses(data)
    } catch (err) {
      console.error('Error updating recurring expense:', err)
      alert('Error al actualizar')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-violet-600" />
            <h2 className="text-xl font-bold text-gray-900">Gastos Recurrentes</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-gray-500 mb-4">
            Estos gastos se crearán automáticamente cada mes. Puedes editar el monto antes de que se cree el próximo.
          </p>

          <div className="space-y-3">
            {recurringExpenses.map((expense) => {
              const category = categories.find(c => c.id === expense.category_id)
              const isEditing = editingId === expense.id
              
              return (
                <div key={expense.id} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{category?.icon || '📦'}</span>
                      <span className="font-medium text-gray-900">{expense.description}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {!isEditing ? (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(expense.id)
                              setEditAmount((expense.amount_cents / 100).toFixed(2))
                            }}
                            className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(expense)}
                            disabled={isLoading}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleEdit(expense)}
                          disabled={isLoading}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="flex-1"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {category?.name}
                      </span>
                      <span className="font-semibold text-violet-600">
                        {formatCurrency(expense.amount_cents, 'ARS')}
                      </span>
                    </div>
                  )}
                  
                  <div className="mt-2 text-xs text-gray-400">
                    Último: {new Date(expense.date).toLocaleDateString('es-AR')}
                  </div>
                </div>
              )
            })}
          </div>

          {recurringExpenses.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Repeat className="w-12 h-12 mx-auto mb-2 text-violet-300" />
              <p>No hay gastos recurrentes</p>
              <p className="text-sm mt-1">Marca un gasto como "recurrente" al crearlo</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
