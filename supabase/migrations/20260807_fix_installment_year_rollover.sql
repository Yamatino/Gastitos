-- ============================================
-- Fix: create_installments crashes when an installment plan crosses
-- a year boundary (e.g. any plan where month + installment_count > 12).
--
-- MAKE_DATE() raises an error immediately when given month > 12, so the
-- "handle year rollover" WHILE loop in the previous version could never
-- run - the exception fired before the loop was ever reached. This
-- version computes the target year/month with integer arithmetic first,
-- so MAKE_DATE always receives a valid 1-12 month.
--
-- Dropped first because the live function's signature has drifted from
-- what's in migration history (it was applied by hand over time), so
-- CREATE OR REPLACE can fail with "cannot change return type of existing
-- function" even when the new definition is correct.
-- ============================================

DROP FUNCTION IF EXISTS create_installments(UUID, TEXT, INTEGER, TEXT, NUMERIC, INTEGER, UUID, INTEGER, DATE, INTEGER);

CREATE OR REPLACE FUNCTION create_installments(
    p_user_id UUID,
    p_description TEXT,
    p_amount_cents INTEGER,
    p_currency TEXT,
    p_exchange_rate NUMERIC,
    p_usd_amount_cents INTEGER,
    p_category_id UUID,
    p_installment_count INTEGER,
    p_base_date DATE,
    p_billing_day INTEGER
)
RETURNS UUID[] AS $$
DECLARE
    v_installment_group_id UUID := gen_random_uuid();
    v_installment_amount INTEGER;
    v_remainder INTEGER;
    v_current_amount INTEGER;
    v_installment_date DATE;
    v_installment_ids UUID[];
    v_base_month_index INTEGER; -- 0-based months since year 0, for safe arithmetic
    v_target_year INTEGER;
    v_target_month INTEGER;
    v_i INTEGER;
BEGIN
    -- Calculate base installment amount
    v_installment_amount := FLOOR(p_amount_cents / p_installment_count);
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
        -- always gets a valid month (1-12), regardless of how many
        -- installments cross a year boundary.
        v_target_year := EXTRACT(YEAR FROM p_base_date)::INTEGER + (v_base_month_index + v_i) / 12;
        v_target_month := (v_base_month_index + v_i) % 12 + 1;

        v_installment_date := MAKE_DATE(
            v_target_year,
            v_target_month,
            LEAST(p_billing_day, 28)
        );

        -- Insert installment
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
        RETURNING id INTO v_installment_ids[v_i + 1];
    END LOOP;

    RETURN v_installment_ids;
END;
$$ LANGUAGE plpgsql;
