import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useUserStore } from '../stores/userStore'
import { useDataStore } from '../stores/dataStore'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, CreditCard, Wallet, TrendingUp, PiggyBank, ChevronDown } from 'lucide-react'
import type { Category, Expense } from '../services/supabase'
import { sanitizeDescription } from '../lib/validation'
import { useToastStore } from '../stores/toastStore'

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

// PostgreSQL integer column limit
const MAX_INT = 2147483647
const isOutOfIntRange = (cents: number): boolean => cents > MAX_INT || cents < -MAX_INT

interface AddTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  categories: Category[]
  editingExpense?: Expense | null
}

export function AddTransactionModal({ isOpen, onClose, onSuccess, categories, editingExpense = null }: AddTransactionModalProps) {
  const { user, exchangeRate } = useUserStore()
  const { addExpense, addInstallments, updateExpense } = useDataStore()
  const isEditMode = !!editingExpense

  const [activeTab, setActiveTab] = useState<TransactionType>('expense')
  
  // Common fields
  const [amount, setAmount] = useState('')
  const [rawDescription, setDescription] = useState('')
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
  
  // Income-specific fields
  const [isSalary, setIsSalary] = useState(false)
  const [countForNextMonth, setCountForNextMonth] = useState(false)

  const resetForm = () => {
    setActiveTab('expense')
    setAmount('')
    setDescription('')
    setCategoryId('')
    setPaymentMethod('debit')
    setInstallments(1)
    setIsSalary(false)
    setCountForNextMonth(false)
    setCurrency('ARS')
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    setSelectedDate(`${year}-${month}-${day}`)
  }

  // Populate the form when opening in edit mode, or clear it when opening fresh
  useEffect(() => {
    if (!isOpen) return

    if (editingExpense) {
      const originalCents = editingExpense.original_currency === 'USD' && editingExpense.original_amount_cents != null
        ? editingExpense.original_amount_cents
        : Math.abs(editingExpense.amount_cents)

      setActiveTab(editingExpense.transaction_type)
      setAmount(formatNumberWithDots(String(Math.round(originalCents / 100))))
      setDescription(editingExpense.description)
      setCategoryId(editingExpense.category_id || '')
      setSelectedDate(editingExpense.date)
      setCurrency(editingExpense.original_currency === 'USD' ? 'USD' : 'ARS')
      setPaymentMethod(editingExpense.payment_method)
      setInstallments(1)
      setIsSalary(editingExpense.is_salary)
      setCountForNextMonth(false)
      setShowCategoryDropdown(false)
    } else {
      resetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingExpense])

  if (!isOpen) return null

  const handleTabChange = (tab: TransactionType) => {
    if (isEditMode) return
    setActiveTab(tab)
    setCategoryId('')
    setShowCategoryDropdown(false)
    // Reset tab-specific fields
    if (tab === 'income') {
      setIsSalary(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validation (field-specific so it's clear what's missing)
    if (!amount) {
      useToastStore.getState().addToast('Por favor ingresá un monto')
      return
    }

    if (!rawDescription) {
      useToastStore.getState().addToast('Por favor ingresá una descripción')
      return
    }

    if (activeTab === 'expense' && !categoryId) {
      useToastStore.getState().addToast('Por favor selecciona una categoría')
      return
    }

    if (!user) {
      useToastStore.getState().addToast('Error: Usuario no autenticado')
      return
    }

    setIsLoading(true)

    try {
      const rawAmount = getRawNumber(amount)
      const description = sanitizeDescription(rawDescription)

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

        if (isOutOfIntRange(amountCents)) {
          useToastStore.getState().addToast('El monto es demasiado grande. El máximo permitido es aproximadamente $21,474,836 ARS')
          setIsLoading(false)
          return
        }
        if (isOutOfIntRange(usdAmountCents)) {
          useToastStore.getState().addToast('El monto es demasiado grande. El máximo permitido es aproximadamente $21,474,836 USD')
          setIsLoading(false)
          return
        }

        if (isEditMode && editingExpense) {
          // Editing never touches installment plans (grouped rows aren't editable)
          await updateExpense(editingExpense.id, {
            description,
            amount_cents: amountCents,
            currency: 'ARS',
            exchange_rate: exchangeRate,
            usd_amount_cents: usdAmountCents,
            original_currency: currency === 'USD' ? 'USD' : null,
            original_amount_cents: originalAmountCents ?? null,
            category_id: categoryId || null,
            payment_method: paymentMethod,
            date: selectedDate,
          })
        } else if (paymentMethod === 'credit' && installments > 1) {
          // Use stored procedure for installments
          const savedBillingDay = localStorage.getItem('defaultBillingDay')
          const billingDayFromSettings = savedBillingDay ? parseInt(savedBillingDay) : 10

          await addInstallments({
            userId: user.id,
            description,
            amountCents,
            currency: 'ARS',
            exchangeRate,
            usdAmountCents,
            categoryId: categoryId || null,
            installmentCount: installments,
            baseDate: selectedDate,
            billingDay: billingDayFromSettings
          })
        } else {
          // Single expense
          await addExpense({
            user_id: user.id,
            description,
            amount_cents: amountCents,
            currency: 'ARS',
            exchange_rate: exchangeRate,
            usd_amount_cents: usdAmountCents,
            original_currency: currency === 'USD' ? 'USD' : undefined,
            original_amount_cents: originalAmountCents,
            category_id: categoryId || null,
            payment_method: paymentMethod,
            date: selectedDate,
            transaction_type: 'expense',
            is_installment: false,
            status: 'paid',
            installment_group_id: null,
            installment_number: null,
            total_installments: null,
            installment_amount_cents: null,
            is_salary: false
          })
        }
      } else if (activeTab === 'income') {
        // Handle income
        const amountCents = Math.round(rawAmount * 100)
        const usdAmountCents = Math.round(amountCents / exchangeRate)

        if (isOutOfIntRange(amountCents)) {
          useToastStore.getState().addToast('El monto es demasiado grande. El máximo permitido es aproximadamente $21,474,836 ARS')
          setIsLoading(false)
          return
        }
        if (isOutOfIntRange(usdAmountCents)) {
          useToastStore.getState().addToast('El monto es demasiado grande. El máximo permitido es aproximadamente $21,474,836 USD')
          setIsLoading(false)
          return
        }

        if (isEditMode && editingExpense) {
          await updateExpense(editingExpense.id, {
            description,
            amount_cents: -amountCents, // Negative for income
            usd_amount_cents: -usdAmountCents,
            date: selectedDate,
            is_salary: isSalary,
          })
        } else {
          await addExpense({
            user_id: user.id,
            description,
            amount_cents: -amountCents, // Negative for income
            currency: 'ARS',
            exchange_rate: exchangeRate,
            usd_amount_cents: -usdAmountCents,
            category_id: null, // No category for income
            payment_method: 'debit',
            date: selectedDate,
            transaction_type: 'income',
            is_salary: isSalary,
            is_installment: false,
            status: 'paid',
            installment_group_id: null,
            installment_number: null,
            total_installments: null,
            installment_amount_cents: null
          })
        }
      } else {
        // Handle savings
        const amountCents = Math.round(rawAmount * 100)
        const usdAmountCents = Math.round(amountCents / exchangeRate)

        if (isOutOfIntRange(amountCents)) {
          useToastStore.getState().addToast('El monto es demasiado grande. El máximo permitido es aproximadamente $21,474,836 ARS')
          setIsLoading(false)
          return
        }
        if (isOutOfIntRange(usdAmountCents)) {
          useToastStore.getState().addToast('El monto es demasiado grande. El máximo permitido es aproximadamente $21,474,836 USD')
          setIsLoading(false)
          return
        }

        if (isEditMode && editingExpense) {
          await updateExpense(editingExpense.id, {
            description,
            amount_cents: amountCents,
            usd_amount_cents: usdAmountCents,
            date: selectedDate,
          })
        } else {
          await addExpense({
            user_id: user.id,
            description,
            amount_cents: amountCents,
            currency: 'ARS',
            exchange_rate: exchangeRate,
            usd_amount_cents: usdAmountCents,
            category_id: null, // No category for savings
            payment_method: 'debit',
            date: selectedDate,
            transaction_type: 'savings',
            is_installment: false,
            status: 'paid',
            installment_group_id: null,
            installment_number: null,
            total_installments: null,
            installment_amount_cents: null,
            is_salary: false
          })
        }
      }

      resetForm()
      onSuccess()
      onClose()
    } catch (err) {
      console.error('Error saving transaction:', err)
      // Error is already shown via alert in the store
    } finally {
      setIsLoading(false)
    }
  }

  const selectedCategory = categories.find(c => c.id === categoryId)

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
    if (isEditMode) return '💾 Guardar Cambios'
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

  // Animation variants
  const contentVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative glass-card w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-border max-h-[90vh]"
      >
        {/* Header with Tabs */}
        <div className="border-b border-border">
          <div className="flex items-center justify-between p-4 pb-2">
            <h2 className="text-xl font-bold text-foreground">{isEditMode ? 'Editar Transacción' : 'Nueva Transacción'}</h2>
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
                disabled={isEditMode && activeTab !== tab}
                title={isEditMode && activeTab !== tab ? 'El tipo no se puede cambiar al editar' : undefined}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-t-lg text-sm font-medium transition-all ${
                  activeTab === tab
                    ? tab === 'expense'
                      ? 'bg-primary text-primary-foreground'
                      : tab === 'income'
                      ? 'bg-success text-white'
                      : 'bg-primary text-white'
                    : isEditMode
                    ? 'text-muted-foreground/40 cursor-not-allowed'
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
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
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
                    inputMode="numeric"
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
                  value={rawDescription}
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

              {/* Income-specific: Is Salary checkbox */}
              {activeTab === 'income' && (
                <div className="flex items-center gap-3 p-3 bg-success/10 rounded-xl border border-success/20">
                  <input
                    type="checkbox"
                    id="isSalary"
                    checked={isSalary}
                    onChange={(e) => setIsSalary(e.target.checked)}
                    className="w-5 h-5 text-success rounded focus:ring-success bg-background border-input"
                  />
                  <label htmlFor="isSalary" className="text-sm font-medium text-foreground cursor-pointer flex-1">
                    Es salario 💰
                  </label>
                </div>
              )}

              {/* Income-specific: Count for Next Month */}
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

              {/* Category (only for expenses) */}
              {activeTab === 'expense' && (
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
                        {categories.map((category) => (
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
              )}

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

              {/* Installments (only for credit expenses, not available when editing) */}
              {activeTab === 'expense' && paymentMethod === 'credit' && !isEditMode && (
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


            </motion.div>
          </AnimatePresence>

          {/* Submit Button */}
          <div className="pt-4">
            <Button
              type="submit"
              disabled={isLoading || !amount || !rawDescription || (activeTab === 'expense' && !categoryId)}
              className={`w-full py-3 rounded-xl font-semibold text-lg ${getSubmitButtonClass()}`}
            >
              {getSubmitButtonText()}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
