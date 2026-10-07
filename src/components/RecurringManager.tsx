import { useState } from 'react'
import { Pause, Pencil, Play, Plus, Repeat, Trash2, X } from 'lucide-react'
import { useDataStore } from '../stores/dataStore'
import { useUserStore } from '../stores/userStore'
import { useToastStore } from '../stores/toastStore'
import type { RecurringInput } from '../lib/api'
import { toPeriod, type RecurringTransaction } from '../lib/recurring'
import { formatAmountInput, formatCurrency, parseAmountInput } from '../lib/utils'
import { sanitizeDescription } from '../lib/validation'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface RecurringManagerProps {
  isOpen: boolean
  onClose: () => void
}

const TYPE_LABELS: Record<RecurringTransaction['transaction_type'], string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  savings: 'Ahorro',
}

/** List, add, edit, pause and delete recurring transactions. */
export function RecurringManager({ isOpen, onClose }: RecurringManagerProps) {
  const { recurring, categories, updateRecurring, removeRecurring } = useDataStore()
  // null = list, 'new' = add form, otherwise the template being edited
  const [editing, setEditing] = useState<RecurringTransaction | 'new' | null>(null)

  if (!isOpen) return null

  const close = () => {
    setEditing(null)
    onClose()
  }

  const handleDelete = async (item: RecurringTransaction) => {
    if (!confirm(`¿Eliminar "${item.description}"? Los meses ya confirmados quedan registrados.`)) return
    try {
      await removeRecurring(item.id)
    } catch {
      // The store already showed the error
    }
  }

  const togglePaused = async (item: RecurringTransaction) => {
    try {
      await updateRecurring(item.id, { active: !item.active })
    } catch {
      // The store already showed the error
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />

      <div className="relative bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">
              {editing === null ? 'Gastos fijos' : editing === 'new' ? 'Nuevo gasto fijo' : 'Editar gasto fijo'}
            </h2>
          </div>
          <button onClick={close} className="p-2 hover:bg-muted rounded-full transition-colors" aria-label="Cerrar">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 max-h-[75vh] overflow-y-auto">
          {editing !== null ? (
            <RecurringForm initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
          ) : (
            <>
              <button
                onClick={() => setEditing('new')}
                className="w-full flex items-center justify-center gap-2 py-3 mb-4 border-2 border-dashed border-primary/30 rounded-xl text-primary hover:bg-primary/10 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Agregar gasto fijo
              </button>

              {recurring.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Alquiler, servicios, suscripciones, sueldo... Cargalos una vez y cada mes te los vamos a mostrar para
                  confirmarlos con un toque.
                </p>
              ) : (
                <ul className="space-y-2">
                  {recurring.map((item) => {
                    const category = categories.find((c) => c.id === item.category_id)
                    return (
                      <li key={item.id} className={`p-3 bg-secondary rounded-xl ${item.active ? '' : 'opacity-60'}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl shrink-0">
                            {item.transaction_type === 'income' ? '📥' : item.transaction_type === 'savings' ? '💎' : category?.icon || '📦'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {item.description}
                              {!item.active && <span className="ml-2 text-xs text-muted-foreground">(pausado)</span>}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatCurrency(item.amount_cents, item.currency, true)} · día {item.day_of_month}
                              {item.transaction_type !== 'expense' ? ` · ${TYPE_LABELS[item.transaction_type]}` : category ? ` · ${category.name}` : ''}
                            </p>
                          </div>
                          <div className="flex shrink-0">
                            <IconButton label="Editar" onClick={() => setEditing(item)}>
                              <Pencil className="w-4 h-4" />
                            </IconButton>
                            <IconButton label={item.active ? 'Pausar' : 'Reanudar'} onClick={() => togglePaused(item)}>
                              {item.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </IconButton>
                            <IconButton label="Eliminar" onClick={() => handleDelete(item)} destructive>
                              <Trash2 className="w-4 h-4" />
                            </IconButton>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function IconButton({ label, onClick, destructive, children }: { label: string; onClick: () => void; destructive?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`p-2 rounded-lg transition-colors ${destructive ? 'text-destructive hover:bg-destructive/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
    >
      {children}
    </button>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="flex gap-2">
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            value === option ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function RecurringForm({ initial, onDone }: { initial: RecurringTransaction | null; onDone: () => void }) {
  const { categories, addRecurring, updateRecurring } = useDataStore()
  const { user } = useUserStore()
  const [type, setType] = useState<RecurringTransaction['transaction_type']>(initial?.transaction_type ?? 'expense')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(initial ? formatAmountInput(String(Math.round(initial.amount_cents / 100))) : '')
  const [currency, setCurrency] = useState<'ARS' | 'USD'>(initial?.currency ?? 'ARS')
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
  const [paymentMethod, setPaymentMethod] = useState<'debit' | 'credit'>(initial?.payment_method ?? 'debit')
  const [isSalary, setIsSalary] = useState(initial?.is_salary ?? false)
  const [day, setDay] = useState(String(initial?.day_of_month ?? new Date().getDate()))
  const [saving, setSaving] = useState(false)

  const isExpense = type === 'expense'
  const dayNumber = parseInt(day)
  const isValid =
    description.trim().length > 0 &&
    parseAmountInput(amount) > 0 &&
    (!isExpense || categoryId !== '') &&
    dayNumber >= 1 &&
    dayNumber <= 31

  const handleSave = async () => {
    if (!isValid || !user) return
    const input: RecurringInput = {
      description: sanitizeDescription(description),
      amount_cents: parseAmountInput(amount) * 100,
      currency: isExpense ? currency : 'ARS',
      transaction_type: type,
      category_id: isExpense ? categoryId : null,
      payment_method: isExpense ? paymentMethod : 'debit',
      is_salary: type === 'income' && isSalary,
      day_of_month: dayNumber,
      start_period: initial?.start_period ?? toPeriod(new Date()),
      skipped_periods: initial?.skipped_periods ?? [],
      active: initial?.active ?? true,
    }
    setSaving(true)
    try {
      if (initial) await updateRecurring(initial.id, input)
      else await addRecurring(user.id, input)
      useToastStore.getState().addToast(initial ? 'Gasto fijo actualizado' : 'Gasto fijo agregado', 'success')
      onDone()
    } catch {
      // The store already showed the error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Segmented
        value={type}
        options={[['expense', 'Gasto'], ['income', 'Ingreso'], ['savings', 'Ahorro']]}
        onChange={setType}
      />

      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="recurring-description">Descripción</label>
        <Input
          id="recurring-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={isExpense ? 'Ej: Alquiler, Netflix, Luz' : type === 'income' ? 'Ej: Sueldo' : 'Ej: Ahorro mensual'}
          className="bg-background"
          autoComplete="off"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="recurring-amount">Monto habitual</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{isExpense && currency === 'USD' ? 'US$' : '$'}</span>
          <Input
            id="recurring-amount"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatAmountInput(e.target.value))}
            placeholder="0"
            className="pl-12 bg-background font-amount"
          />
        </div>
        {isExpense && (
          <div className="mt-2">
            <Segmented value={currency} options={[['ARS', 'ARS ($)'], ['USD', 'USD (US$)']]} onChange={setCurrency} />
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">Lo podés ajustar cada mes al confirmar.</p>
      </div>

      {isExpense && (
        <div>
          <p className="block text-sm font-medium text-foreground mb-2">Categoría</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Categoría">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                role="radio"
                aria-checked={category.id === categoryId}
                onClick={() => setCategoryId(category.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  category.id === categoryId ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-input hover:bg-muted'
                }`}
              >
                <span>{category.icon}</span>
                <span>{category.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isExpense && (
        <div>
          <p className="block text-sm font-medium text-foreground mb-2">Método de pago</p>
          <Segmented value={paymentMethod} options={[['debit', 'Débito'], ['credit', 'Crédito']]} onChange={setPaymentMethod} />
        </div>
      )}

      {type === 'income' && (
        <label className="flex items-center gap-3 p-3 bg-success/10 rounded-xl border border-success/20 cursor-pointer">
          <input type="checkbox" checked={isSalary} onChange={(e) => setIsSalary(e.target.checked)} className="w-5 h-5" />
          <span className="text-sm font-medium text-foreground">Es salario 💰</span>
        </label>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="recurring-day">Día del mes</label>
        <Input
          id="recurring-day"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="w-24 bg-background"
        />
        <p className="text-xs text-muted-foreground mt-1">En meses más cortos se usa el último día.</p>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onDone} className="flex-1 border-border">
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={!isValid || saving} className="flex-1 bg-primary hover:opacity-90">
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
