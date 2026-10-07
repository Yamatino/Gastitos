-- ============================================
-- Settings that follow the user across devices.
--
-- Budgets, the monthly savings goal and the card billing day used to live
-- only in the browser's localStorage, so they were missing on other devices
-- and lost whenever site data was cleared. One row per user; the app creates
-- it on first login (uploading that device's current values) and keeps it
-- updated. Display preferences (theme, USD toggle, hidden totals) stay
-- per-device on purpose.
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    -- category_id -> monthly budget in ARS cents
    budgets JSONB NOT NULL DEFAULT '{}'::jsonb,
    monthly_savings_goal_usd NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (monthly_savings_goal_usd >= 0),
    billing_day INTEGER NOT NULL DEFAULT 10 CHECK (billing_day BETWEEN 1 AND 28),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own settings" ON public.user_settings;
CREATE POLICY "Users manage their own settings"
    ON public.user_settings
    FOR ALL
    TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);
