import { useState } from 'react'
import { supabase } from '../services/supabase'
import type { Category } from '../services/supabase'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, CreditCard, Wallet, ChevronDown } from 'lucide-react'

// Helper function to format number with dots as thousand separators
const formatNumberWithDots = (value: string): string => {
  // Remove all non-digit and non-dot characters
  const cleanValue = value.replace(/[^\d.]/g, '')
  // Split by decimal point
  const parts = cleanValue.split('.')
  // Format integer part with dots
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return parts.join('.')
}

// Helper to get raw numeric value for calculations
const getRawNumber = (formattedValue: string): number => {
  return parseFloat(formattedValue.replace(/\./g, '').replace(',', '.')) || 0
}

interface AddExpenseModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  categories: Category[]
  exchangeRate: number
}

export function AddExpenseModal({ isOpen, onClose, onSuccess, categories, exchangeRate }: AddExpenseModalProps) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'debit' | 'credit'>('debit')
  const [installments, setInstallments] = useState(1)
  const [isRecurring, setIsRecurring] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !description || !categoryId) return

    setIsLoading(true)

    try {
      let amountCents: number
      let usdAmountCents: number
      let originalAmountCents: number | undefined

      const rawAmount = getRawNumber(amount)

      if (currency === 'USD') {
        // User entered amount in USD
        originalAmountCents = Math.round(rawAmount * 100)
        amountCents = Math.round(originalAmountCents * exchangeRate)
        usdAmountCents = originalAmountCents
      } else {
        // User entered amount in ARS
        amountCents = Math.round(rawAmount * 100)
        usdAmountCents = Math.round(amountCents / exchangeRate)
        originalAmountCents = undefined // Not needed for ARS
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')

      if (paymentMethod === 'credit' && installments > 1) {
        // Create multiple installment records
        const installmentGroupId = crypto.randomUUID()
        const installmentAmount = Math.floor(amountCents / installments)
        const remainder = amountCents % installments
        const baseDate = new Date(selectedDate + 'T12:00:00')
        
        // Get billing day from settings (localStorage)
        const savedBillingDay = localStorage.getItem('defaultBillingDay')
        const billingDayFromSettings = savedBillingDay ? parseInt(savedBillingDay) : 10

        const expensesToInsert = []
        for (let i = 0; i < installments; i++) {
          const installmentDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, billingDayFromSettings)

          const currentInstallmentAmount = i === 0 ? installmentAmount + remainder : installmentAmount
          const currentUsdAmount = Math.round(currentInstallmentAmount / exchangeRate)

          expensesToInsert.push({
            user_id: user.id,
            description: `${description} (${i + 1}/${installments})`,
            amount_cents: currentInstallmentAmount,
            currency: 'ARS',
            exchange_rate: exchangeRate,
            usd_amount_cents: currentUsdAmount,
            original_currency: currency === 'USD' ? 'USD' : undefined,
            original_amount_cents: currency === 'USD' ? Math.round(currentInstallmentAmount / exchangeRate) : undefined,
            category_id: categoryId,
            payment_method: 'credit',
            is_installment: true,
            installment_group_id: installmentGroupId,
            installment_number: i + 1,
            total_installments: installments,
            installment_amount_cents: currentInstallmentAmount,
            date: (() => {
            const year = installmentDate.getFullYear()
            const month = String(installmentDate.getMonth() + 1).padStart(2, '0')
            const day = String(installmentDate.getDate()).padStart(2, '0')
            return `${year}-${month}-${day}`
          })(),
            status: i === 0 ? 'paid' : 'pending',
          })
        }

        const { error } = await supabase.from('expenses').insert(expensesToInsert)
        if (error) throw error
      } else {
        // Single expense
        const { error } = await supabase.from('expenses').insert({
          user_id: user.id,
          description,
          amount_cents: amountCents,
          currency: 'ARS',
          exchange_rate: exchangeRate,
          usd_amount_cents: usdAmountCents,
          original_currency: currency === 'USD' ? 'USD' : undefined,
          original_amount_cents: originalAmountCents,
          category_id: categoryId,
          payment_method: paymentMethod,
          is_installment: false,
          is_recurring: isRecurring,
          date: selectedDate,
          status: 'paid',
        })
        if (error) throw error
      }

      // Reset form
      setAmount('')
      setDescription('')
      setCategoryId('')
      setPaymentMethod('debit')
      setInstallments(1)
      setIsRecurring(false)
      setCurrency('ARS')
      
      // Reset date to today
      const d = new Date()
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      setSelectedDate(`${year}-${month}-${day}`)
      
      onSuccess()
      onClose()
    } catch (err) {
      console.error('Error adding expense:', err)
      alert('Error al guardar el gasto')
    } finally {
      setIsLoading(false)
    }
  }

  const selectedCategory = categories.find(c => c.id === categoryId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-border max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Nuevo Gasto</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Monto ({currency})
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">{currency === 'ARS' ? '$' : 'US$'}</span>
              <Input
                type="text"
                value={amount}
                onChange={(e) => {
                  const rawValue = e.target.value.replace(/[^\d]/g, '')
                  const formattedValue = formatNumberWithDots(rawValue)
                  setAmount(formattedValue)
                }}
                placeholder="0"
                className="pl-12 text-lg font-mono-amount bg-background"
                required
              />
            </div>
            {/* Currency Toggle */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setCurrency('ARS')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  currency === 'ARS'
                    ? 'bg-primary text-primary-foreground glow-primary'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                ARS ($)
              </button>
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  currency === 'USD'
                    ? 'bg-primary text-primary-foreground glow-primary'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                USD (US$)
              </button>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Descripción
            </label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Cena con amigos"
              className="bg-background"
              required
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Fecha
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-background"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Categoría
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 border border-input rounded-md bg-background text-left text-foreground"
              >
                <span className={selectedCategory ? 'text-foreground' : 'text-muted-foreground'}>
                  {selectedCategory ? selectedCategory.name : 'Seleccionar categoría'}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              
              {showCategoryDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                  {categories.filter(c => c.type === 'expense').map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setCategoryId(category.id)
                        setShowCategoryDropdown(false)
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-2 text-foreground"
                    >
                      <span>{category.icon}</span>
                      <span>{category.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Método de pago
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('debit')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${
                  paymentMethod === 'debit'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50 text-muted-foreground'
                }`}
              >
                <Wallet className="w-4 h-4" />
                Débito
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('credit')}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all ${
                  paymentMethod === 'credit'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50 text-muted-foreground'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                Crédito
              </button>
            </div>
          </div>

          {/* Installments (only for credit) */}
          {paymentMethod === 'credit' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Cantidad de cuotas
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="24"
                  value={installments}
                  onChange={(e) => setInstallments(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <span className="text-lg font-semibold text-primary w-12 text-center">
                  {installments}
                </span>
              </div>
              {installments > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Se dividirá en {installments} pagos de ${(getRawNumber(amount || '0') / installments).toFixed(2)} ARS cada uno
                </p>
              )}
            </div>
          )}

          {/* Recurring Expense */}
          <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl border border-primary/20">
            <input
              type="checkbox"
              id="isRecurring"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="w-5 h-5 text-primary rounded focus:ring-primary bg-background border-input"
            />
            <label htmlFor="isRecurring" className="text-sm font-medium text-foreground cursor-pointer">
              Gasto recurrente mensual
            </label>
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <Button
              type="submit"
              disabled={isLoading || !amount || !description || !categoryId}
              className="w-full bg-primary hover:opacity-90 text-primary-foreground py-3 rounded-xl font-semibold text-lg glow-primary"
            >
              {isLoading ? 'Guardando...' : '💾 Guardar Gasto'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
