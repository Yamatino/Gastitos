import { useState } from 'react'
import { supabase } from '../services/supabase'
import type { Category } from '../services/supabase'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, CreditCard, Wallet, TrendingUp, PiggyBank, ChevronDown } from 'lucide-react'

type TransactionType = 'expense' | 'income' | 'savings'

// Helper function to format number with dots as thousand separators
const formatNumberWithDots = (value: string): string => {
  const cleanValue = value.replace(/[^\d.]/g, '')
  const parts = cleanValue.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return parts.join('.')
}

// Helper to get raw numeric value for calculations
const getRawNumber = (formattedValue: string): number => {
  return parseFloat(formattedValue.replace(/\./g, '').replace(',', '.')) || 0
}

interface AddTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  categories: Category[]
  exchangeRate: number
}

export function AddTransactionModal({ isOpen, onClose, onSuccess, categories, exchangeRate }: AddTransactionModalProps) {
  const [activeTab, setActiveTab] = useState<TransactionType>('expense')
  
  // Common fields
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
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS')
  
  // Expense-specific fields
  const [paymentMethod, setPaymentMethod] = useState<'debit' | 'credit'>('debit')
  const [installments, setInstallments] = useState(1)
  const [isRecurring, setIsRecurring] = useState(false)
  
  // Income-specific fields
  const [countForNextMonth, setCountForNextMonth] = useState(false)

  if (!isOpen) return null

  const handleTabChange = (tab: TransactionType) => {
    setActiveTab(tab)
    setCategoryId('') // Reset category when switching tabs
    setShowCategoryDropdown(false)
  }

  const resetForm = () => {
    setAmount('')
    setDescription('')
    setCategoryId('')
    setPaymentMethod('debit')
    setInstallments(1)
    setIsRecurring(false)
    setCountForNextMonth(false)
    setCurrency('ARS')
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    setSelectedDate(`${year}-${month}-${day}`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !description || !categoryId) return

    setIsLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user')

      const rawAmount = getRawNumber(amount)

      if (activeTab === 'expense') {
        // Handle expense
        let amountCents: number
        let usdAmountCents: number
        let originalAmountCents: number | undefined

        if (currency === 'USD') {
          originalAmountCents = Math.round(rawAmount * 100)
          amountCents = Math.round(originalAmountCents * exchangeRate)
          usdAmountCents = originalAmountCents
        } else {
          amountCents = Math.round(rawAmount * 100)
          usdAmountCents = Math.round(amountCents / exchangeRate)
          originalAmountCents = undefined
        }

        if (paymentMethod === 'credit' && installments > 1) {
          // Create multiple installment records
          const installmentGroupId = crypto.randomUUID()
          const installmentAmount = Math.floor(amountCents / installments)
          const remainder = amountCents % installments
          const baseDate = new Date(selectedDate + 'T12:00:00')
          
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
      } else {
        // Handle income or savings
        const amountCents = Math.round(rawAmount * 100)
        const usdAmountCents = Math.round(amountCents / exchangeRate)
        const isSavings = activeTab === 'savings'

        const { error } = await supabase.from('expenses').insert({
          user_id: user.id,
          description: isSavings ? `[Ahorro] ${description}` : description,
          amount_cents: isSavings ? amountCents : -amountCents,
          currency: 'ARS',
          exchange_rate: exchangeRate,
          usd_amount_cents: isSavings ? usdAmountCents : -usdAmountCents,
          category_id: categoryId,
          payment_method: 'debit',
          is_installment: false,
          date: selectedDate,
          status: 'paid',
          is_recurring: false,
        })
        if (error) throw error
      }

      resetForm()
      onSuccess()
      onClose()
    } catch (err) {
      console.error('Error adding transaction:', err)
      alert('Error al guardar la transacción')
    } finally {
      setIsLoading(false)
    }
  }

  const getFilteredCategories = () => {
    if (activeTab === 'expense') {
      return categories.filter(c => c.type === 'expense')
    } else if (activeTab === 'income') {
      return categories.filter(c => c.type === 'income')
    } else {
      return categories.filter(c => c.type === 'savings')
    }
  }

  const selectedCategory = categories.find(c => c.id === categoryId)
  const filteredCategories = getFilteredCategories()

  const getTabIcon = (tab: TransactionType) => {
    switch (tab) {
      case 'expense': return <Wallet className="w-4 h-4" />
      case 'income': return <TrendingUp className="w-4 h-4" />
      case 'savings': return <PiggyBank className="w-4 h-4" />
    }
  }

  const getTabLabel = (tab: TransactionType) => {
    switch (tab) {
      case 'expense': return 'Gasto'
      case 'income': return 'Ingreso'
      case 'savings': return 'Ahorro'
    }
  }

  const getSubmitButtonText = () => {
    if (isLoading) return 'Guardando...'
    switch (activeTab) {
      case 'expense': return '💾 Guardar Gasto'
      case 'income': return '💾 Guardar Ingreso'
      case 'savings': return '💾 Guardar Ahorro'
    }
  }

  const getSubmitButtonClass = () => {
    switch (activeTab) {
      case 'expense':
        return 'bg-primary hover:opacity-90 text-primary-foreground glow-primary'
      case 'income':
        return 'bg-success hover:opacity-90 text-white glow-success'
      case 'savings':
        return 'bg-primary hover:opacity-90 text-white glow-primary'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-border max-h-[90vh]">
        {/* Header with Tabs */}
        <div className="border-b border-border">
          <div className="flex items-center justify-between p-4 pb-2">
            <h2 className="text-xl font-bold text-foreground">Nueva Transacción</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          
          {/* Tab Navigation */}
          <div className="flex px-4 pb-2 gap-1">
            {(['expense', 'income', 'savings'] as TransactionType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-t-lg text-sm font-medium transition-all ${
                  activeTab === tab
                    ? tab === 'expense'
                      ? 'bg-primary text-primary-foreground'
                      : tab === 'income'
                      ? 'bg-success text-white'
                      : 'bg-primary text-white'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {getTabIcon(tab)}
                {getTabLabel(tab)}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Monto ({activeTab === 'expense' ? currency : 'ARS'})
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">
                {activeTab === 'expense' && currency === 'USD' ? 'US$' : '$'}
              </span>
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
            
            {/* Currency Toggle (only for expenses) */}
            {activeTab === 'expense' && (
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
            )}
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
              placeholder={activeTab === 'expense' ? 'Ej: Cena con amigos' : activeTab === 'income' ? 'Ej: Sueldo mensual' : 'Ej: Ahorro de emergencia'}
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

          {/* Count for Next Month (only for income) */}
          {activeTab === 'income' && (
            <div className="flex items-center gap-3 p-3 bg-success/10 rounded-xl border border-success/20">
              <input
                type="checkbox"
                id="countForNextMonth"
                checked={countForNextMonth}
                onChange={(e) => {
                  const checked = e.target.checked
                  setCountForNextMonth(checked)
                  if (checked) {
                    const today = new Date()
                    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
                    const year = nextMonth.getFullYear()
                    const month = String(nextMonth.getMonth() + 1).padStart(2, '0')
                    setSelectedDate(`${year}-${month}-01`)
                  } else {
                    const today = new Date()
                    const year = today.getFullYear()
                    const month = String(today.getMonth() + 1).padStart(2, '0')
                    const day = String(today.getDate()).padStart(2, '0')
                    setSelectedDate(`${year}-${month}-${day}`)
                  }
                }}
                className="w-5 h-5 text-success rounded focus:ring-success bg-background border-input"
              />
              <label htmlFor="countForNextMonth" className="text-sm font-medium text-foreground cursor-pointer flex-1">
                Contar para el mes siguiente (1ro del próximo mes)
              </label>
            </div>
          )}

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
                  {filteredCategories.map((category) => (
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

          {/* Payment Method (only for expenses) */}
          {activeTab === 'expense' && (
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
          )}

          {/* Installments (only for credit expenses) */}
          {activeTab === 'expense' && paymentMethod === 'credit' && (
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

          {/* Recurring Expense (only for expenses) */}
          {activeTab === 'expense' && (
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
          )}

          {/* Submit Button */}
          <div className="pt-4">
            <Button
              type="submit"
              disabled={isLoading || !amount || !description || !categoryId}
              className={`w-full py-3 rounded-xl font-semibold text-lg ${getSubmitButtonClass()}`}
            >
              {getSubmitButtonText()}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
