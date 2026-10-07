import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Repeat } from 'lucide-react'
import { useDataStore } from '../stores/dataStore'
import { useUserStore } from '../stores/userStore'
import { useToastStore } from '../stores/toastStore'
import { fetchExchangeRate } from '../lib/api'
import { parseExpenseDate } from '../lib/dateBuckets'
import { getPendingRecurring, type PendingRecurring } from '../lib/recurring'
import { formatAmountInput, parseAmountInput } from '../lib/utils'
import type { Category } from '../services/supabase'
import { Button } from './ui/button'

// Rows shown before "Ver todos"
const PREVIEW_COUNT = 3

/**
 * Recurring transactions due this month (and missed recent months), each
 * confirmed with one tap. Hidden when nothing is pending.
 */
export function RecurringPendingCard({ onManage }: { onManage: () => void }) {
  const { recurring, expenses, categories } = useDataStore()
  const [showAll, setShowAll] = useState(false)

  const pending = getPendingRecurring(recurring, expenses)
  if (pending.length === 0) return null

  const visible = showAll ? pending : pending.slice(0, PREVIEW_COUNT)

  return (
    <section className="glass-card rounded-2xl p-4 border border-primary/30" aria-label="Pendientes de confirmar">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Por confirmar</h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary">{pending.length}</span>
        </div>
        <button onClick={onManage} className="text-sm text-primary hover:underline">
          Gestionar
        </button>
      </div>

      <div className="divide-y divide-border">
        {visible.map((p) => (
          <PendingRow
            key={`${p.recurring.id}:${p.period}`}
            pending={p}
            category={categories.find((c) => c.id === p.recurring.category_id)}
          />
        ))}
      </div>

      {pending.length > PREVIEW_COUNT && (
        <button onClick={() => setShowAll(!showAll)} className="mt-2 w-full text-sm text-primary hover:underline">
          {showAll ? 'Ver menos' : `Ver todos (${pending.length})`}
        </button>
      )}
    </section>
  )
}

function PendingRow({ pending, category }: { pending: PendingRecurring; category?: Category }) {
  const { recurring, dueDate, isOverdue } = pending
  const { confirmRecurring, skipRecurring } = useDataStore()
  const { user, exchangeRate, exchangeRateAvailable, setExchangeRate } = useUserStore()
  // Starts at the template amount; editable for bills that change month to month
  const [amount, setAmount] = useState(() => formatAmountInput(String(Math.round(recurring.amount_cents / 100))))
  const [busy, setBusy] = useState(false)

  const isIncome = recurring.transaction_type === 'income'
  const icon = isIncome ? (recurring.is_salary ? '💰' : '📥') : recurring.transaction_type === 'savings' ? '💎' : category?.icon || '📦'
  const dueLabel = format(parseExpenseDate(dueDate), 'd MMM', { locale: es })

  const handleConfirm = async () => {
    if (!user) return
    const amountCents = parseAmountInput(amount) * 100
    if (amountCents <= 0) return
    setBusy(true)
    try {
      // The rate is stored on the transaction, so don't record one with the placeholder
      let rate = exchangeRate
      if (!exchangeRateAvailable) {
        const fresh = await fetchExchangeRate()
        if (fresh === null) {
          useToastStore.getState().addToast('No se pudo obtener la cotización del dólar. Revisá tu conexión e intentá de nuevo.')
          return
        }
        setExchangeRate(fresh)
        rate = fresh
      }
      await confirmRecurring(pending, amountCents, rate, user.id)
      useToastStore.getState().addToast(`${recurring.description} registrado`, 'success')
    } catch {
      // The store already showed the error
    } finally {
      setBusy(false)
    }
  }

  const handleSkip = async () => {
    setBusy(true)
    try {
      await skipRecurring(pending)
    } catch {
      // The store already showed the error
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-3">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 shrink-0 rounded-full bg-muted flex items-center justify-center">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{recurring.description}</p>
          <p className={`text-xs ${isOverdue ? 'text-warning' : 'text-muted-foreground'}`}>
            {isOverdue ? 'Venció' : 'Vence'} el {dueLabel}
            {isIncome && ' · Ingreso'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {recurring.currency === 'USD' ? 'US$' : '$'}
          </span>
          <input
            type="text"
            inputMode="numeric"
            aria-label={`Monto de ${recurring.description}`}
            value={amount}
            onChange={(e) => setAmount(formatAmountInput(e.target.value))}
            className={`w-full ${recurring.currency === 'USD' ? 'pl-11' : 'pl-7'} pr-3 py-1.5 bg-background border border-input rounded-lg text-sm font-amount text-foreground focus:outline-none focus:ring-2 focus:ring-primary`}
          />
        </div>
        <Button size="sm" onClick={handleConfirm} disabled={busy || parseAmountInput(amount) <= 0} className="bg-primary hover:opacity-90 shrink-0">
          Confirmar
        </Button>
        <Button size="sm" variant="ghost" onClick={handleSkip} disabled={busy} className="text-muted-foreground shrink-0 px-2">
          Omitir
        </Button>
      </div>
    </div>
  )
}
