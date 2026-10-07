-- ============================================
-- Fix: amounts were capped at ~$21.474.836 ARS.
--
-- The *_cents columns were INTEGER (max 2.147.483.647 cents). With inflation a
-- salary, a car or a year of rent can already exceed that, and the insert
-- fails with "integer out of range". BIGINT raises the limit far beyond
-- anything realistic; PostgREST still returns these as JSON numbers.
--
-- create_installments is recreated with BIGINT parameters too, otherwise
-- installment plans would keep the old cap. It's dropped first (old INTEGER
-- signature) so PostgREST doesn't end up with two ambiguous overloads.
-- This version supersedes 20260906_fix_installment_array_subscript.sql.
-- ============================================

ALTER TABLE expenses
    ALTER COLUMN amount_cents TYPE BIGINT,
    ALTER COLUMN usd_amount_cents TYPE BIGINT,
    ALTER COLUMN installment_amount_cents TYPE BIGINT,
    ALTER COLUMN original_amount_cents TYPE BIGINT;

DROP FUNCTION IF EXISTS create_installments(UUID, TEXT, INTEGER, TEXT, NUMERIC, INTEGER, UUID, INTEGER, DATE, INTEGER);
DROP FUNCTION IF EXISTS create_installments(UUID, TEXT, BIGINT, TEXT, NUMERIC, BIGINT, UUID, INTEGER, DATE, INTEGER);

CREATE FUNCTION create_installments(
    p_user_id UUID,
    p_description TEXT,
    p_amount_cents BIGINT,
    p_currency TEXT,
    p_exchange_rate NUMERIC,
    p_usd_amount_cents BIGINT,
    p_category_id UUID,
    p_installment_count INTEGER,
    p_base_date DATE,
    p_billing_day INTEGER
)
RETURNS UUID[]
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_installment_group_id UUID := gen_random_uuid();
    v_installment_amount BIGINT;
    v_remainder BIGINT;
    v_current_amount BIGINT;
    v_installment_date DATE;
    v_installment_ids UUID[] := '{}';
    v_new_id UUID;
    v_base_month_index INTEGER; -- 0-based month of the base date, for safe arithmetic
    v_target_year INTEGER;
    v_target_month INTEGER;
    v_i INTEGER;
BEGIN
    -- Calculate base installment amount
    v_installment_amount := p_amount_cents / p_installment_count;
    v_remainder := p_amount_cents % p_installment_count;

    -- 0-based month index of the base date (e.g. January = 0)
    v_base_month_index := EXTRACT(MONTH FROM p_base_date)::INTEGER - 1;

    -- Create all installments in a single transaction
    FOR v_i IN 0..p_installment_count-1 LOOP
        -- First installment gets the remainder
        IF v_i = 0 THEN
            v_current_amount := v_installment_amount + v_remainder;
        ELSE
            v_current_amount := v_installment_amount;
        END IF;

        -- Compute target year/month with integer arithmetic so MAKE_DATE
        -- always gets a valid month (1-12)
        v_target_year := EXTRACT(YEAR FROM p_base_date)::INTEGER + (v_base_month_index + v_i) / 12;
        v_target_month := (v_base_month_index + v_i) % 12 + 1;

        v_installment_date := MAKE_DATE(
            v_target_year,
            v_target_month,
            LEAST(p_billing_day, 28)
        );

        INSERT INTO expenses (
            user_id,
            description,
            amount_cents,
            currency,
            exchange_rate,
            usd_amount_cents,
            category_id,
            payment_method,
            is_installment,
            installment_group_id,
            installment_number,
            total_installments,
            installment_amount_cents,
            date,
            status,
            transaction_type
        ) VALUES (
            p_user_id,
            p_description || ' (' || (v_i + 1) || '/' || p_installment_count || ')',
            v_current_amount,
            p_currency,
            p_exchange_rate,
            FLOOR(v_current_amount / p_exchange_rate),
            p_category_id,
            'credit',
            true,
            v_installment_group_id,
            v_i + 1,
            p_installment_count,
            v_current_amount,
            v_installment_date,
            'pending',
            'expense'
        )
        RETURNING id INTO v_new_id;

        v_installment_ids := array_append(v_installment_ids, v_new_id);
    END LOOP;

    RETURN v_installment_ids;
END;
$$;
