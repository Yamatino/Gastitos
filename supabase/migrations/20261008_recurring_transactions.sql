-- ============================================
-- Recurring transactions ("gastos fijos"): rent, subscriptions, utilities,
-- salary... Each row is a monthly template. Nothing is recorded on its own:
-- every month the app lists the due ones and the user confirms each with one
-- tap (adjusting the amount if needed) or skips it.
--
-- A confirmed month is an ordinary row in `expenses` linked back through
-- recurring_id + recurring_period ('YYYY-MM'). The unique index makes a month
-- impossible to confirm twice, even from two devices at once.
-- ============================================

CREATE TABLE IF NOT EXISTS public.recurring_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
    -- Positive, in cents of `currency`. USD templates are converted at the rate of the day they're confirmed.
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
    transaction_type TEXT NOT NULL DEFAULT 'expense' CHECK (transaction_type IN ('expense', 'income', 'savings')),
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    payment_method TEXT NOT NULL DEFAULT 'debit' CHECK (payment_method IN ('debit', 'credit')),
    is_salary BOOLEAN NOT NULL DEFAULT false,
    -- Clamped to the month's last day for short months (e.g. 31 -> 30 Nov)
    day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    -- First month ('YYYY-MM') it applies to
    start_period TEXT NOT NULL CHECK (start_period ~ '^\d{4}-\d{2}$'),
    -- Months the user chose to skip
    skipped_periods TEXT[] NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_id ON public.recurring_transactions(user_id);

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own recurring transactions" ON public.recurring_transactions;
CREATE POLICY "Users manage their own recurring transactions"
    ON public.recurring_transactions
    FOR ALL
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- Link confirmed months back to their template
ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS recurring_id UUID REFERENCES public.recurring_transactions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS recurring_period TEXT CHECK (recurring_period IS NULL OR recurring_period ~ '^\d{4}-\d{2}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_recurring_period_unique
    ON public.expenses(recurring_id, recurring_period)
    WHERE recurring_id IS NOT NULL;
