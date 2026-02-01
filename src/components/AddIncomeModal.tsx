import { useState } from 'react'
import { supabase } from '../services/supabase'
import type { Category } from '../services/supabase'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, TrendingUp, ChevronDown } from 'lucide-react'

// Helper function to format number with dots as thousand separators
const formatNumberWithDots = (value: string): string => {
  const cleanValue = value.replace(/[^\d.]/g, '')
  const parts = cleanValue.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return parts.join('.')
}

const getRawNumber = (formattedValue: string): number => {
  return parseFloat(formattedValue.replace(/\./g, '').replace(',', '.')) || 0
}

interface AddIncomeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  categories: Category[]
  exchangeRate: number
}

export function AddIncomeModal({ isOpen, onClose, onSuccess, categories, exchangeRate }: AddIncomeModalProps) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })

  // Filter only income categories
  const incomeCategories = categories.filter(c => c.type === 'income')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !description || !categoryId) return

    setIsLoading(true)

    try {
      const amountCents = Math.round(getRawNumber(amount) * 100)
      const usdAmountCents = Math.round(amountCents / exchangeRate)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')

      // Store income as negative expense (or we could create a separate incomes table)
      // For now, using negative amount to distinguish income from expenses
      const { error } = await supabase.from('expenses').insert({
        user_id: user.id,
        description,
        amount_cents: -amountCents, // Negative for income
        currency: 'ARS',
        exchange_rate: exchangeRate,
        usd_amount_cents: -usdAmountCents, // Negative for income
        category_id: categoryId,
        payment_method: 'debit',
        is_installment: false,
        date: selectedDate,
        status: 'paid',
      })
      if (error) throw error

      // Reset form
      setAmount('')
      setDescription('')
      setCategoryId('')
      // Reset date to today
      const today = new Date()
      setSelectedDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
      
      onSuccess()
      onClose()
    } catch (err) {
      console.error('Error adding income:', err)
      alert('Error al guardar el ingreso')
    } finally {
      setIsLoading(false)
    }
  }

  const selectedCategory = categories.find(c => c.id === categoryId)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h2 className="text-xl font-bold text-gray-900">Registrar Ingreso</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto (ARS)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">$</span>
              <Input
                type="text"
                value={amount}
                onChange={(e) => {
                  const rawValue = e.target.value.replace(/[^\d]/g, '')
                  const formattedValue = formatNumberWithDots(rawValue)
                  setAmount(formattedValue)
                }}
                placeholder="0"
                className="pl-8 text-lg font-mono"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Sueldo mensual"
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Categoría
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 border border-input rounded-md bg-white text-left"
              >
                <span className={selectedCategory ? 'text-gray-900' : 'text-gray-400'}>
                  {selectedCategory ? selectedCategory.name : 'Seleccionar categoría'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              
              {showCategoryDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                  {incomeCategories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setCategoryId(category.id)
                        setShowCategoryDropdown(false)
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-emerald-50 flex items-center gap-2"
                    >
                      <span>{category.icon}</span>
                      <span>{category.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              disabled={isLoading || !amount || !description || !categoryId}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-semibold text-lg"
            >
              {isLoading ? 'Guardando...' : '💰 Guardar Ingreso'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
