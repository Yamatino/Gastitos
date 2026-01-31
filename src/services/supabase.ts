import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Expense = {
  id: string
  user_id: string
  description: string
  amount_cents: number
  currency: string
  exchange_rate: number
  usd_amount_cents: number
  category_id: string
  payment_method: 'debit' | 'credit'
  is_installment: boolean
  installment_group_id: string | null
  installment_number: number | null
  total_installments: number | null
  installment_amount_cents: number | null
  date: string
  status: 'paid' | 'pending'
  is_recurring: boolean
  recurring_parent_id: string | null
  created_at: string
}

export type Category = {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  is_default: boolean
  created_at: string
}
