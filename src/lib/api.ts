import { supabase } from '../services/supabase';
import type { Expense, Category } from '../services/supabase';
import type { SyncedSettings } from '../stores/userStore';
import { AppError, ErrorCodes, getErrorMessage, handleSupabaseError, withRetry } from './errors';

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
// Writes are never retried automatically: a request that timed out may still have
// been applied on the server, and retrying it would save the transaction twice.
const WRITE_ATTEMPTS = 1;
// PostgREST caps every response at 1000 rows (Supabase's default max-rows).
const PAGE_SIZE = 1000;

// Wrapper for Supabase queries with timeout and retry
export async function queryWithTimeout<T>(
  queryFn: () => Promise<{ data: T | null; error: unknown }>,
  timeoutMs: number = DEFAULT_TIMEOUT,
  maxAttempts: number = MAX_RETRIES
): Promise<T> {
  return withRetry(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new AppError(
          getErrorMessage(ErrorCodes.TIMEOUT_ERROR),
          ErrorCodes.TIMEOUT_ERROR,
          'high',
          null,
          true
        ));
      }, timeoutMs);
    });
    
    try {
      const result = await Promise.race([
        queryFn(),
        timeoutPromise
      ]);
      
      if (result.error) {
        throw handleSupabaseError(result.error, 'query');
      }
      
      if (result.data === null) {
        throw new AppError(
          'No se encontraron datos',
          ErrorCodes.DB_QUERY_ERROR,
          'medium',
          null,
          false
        );
      }
      
      return result.data;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw handleSupabaseError(error, 'query');
    } finally {
      clearTimeout(timer);
    }
  }, maxAttempts);
}

// Fetch all of a user's expenses, page by page. A single request silently stops at
// the server's row cap, which used to drop the oldest history from every total.
export async function fetchExpenses(userId: string): Promise<Expense[]> {
  const all: Expense[] = [];

  for (;;) {
    const offset = all.length;
    const page = await queryWithTimeout<Expense[]>(async () => {
      return supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        // id breaks ties between same-date rows so pages never overlap or skip rows
        .order('date', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
    });
    all.push(...page);
    // Stop on an empty page rather than a short one, in case the server cap is below PAGE_SIZE
    if (page.length === 0) break;
  }

  return all;
}

// Fetch categories for user
export async function fetchCategories(userId: string) {
  return queryWithTimeout(async () => {
    return supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('name');
  });
}

// Create expense with validation
export async function createExpense(expenseData: {
  user_id: string;
  description: string;
  amount_cents: number;
  currency: string;
  exchange_rate: number;
  usd_amount_cents: number;
  category_id?: string | null;
  payment_method: 'debit' | 'credit';
  date: string;
  transaction_type: 'expense' | 'income' | 'savings';
  is_salary?: boolean;
}): Promise<Expense> {
  const result = await queryWithTimeout(async () => {
    return supabase
      .from('expenses')
      .insert(expenseData)
      .select()
      .single();
  }, DEFAULT_TIMEOUT, WRITE_ATTEMPTS);
  
  if (!result) {
    throw new AppError(
      'Error al crear la transacción',
      ErrorCodes.DB_QUERY_ERROR,
      'high',
      null,
      false
    );
  }
  
  return result as Expense;
}

// Update a non-installment expense/income/savings entry
export async function updateExpense(
  id: string,
  updates: Partial<{
    description: string;
    amount_cents: number;
    currency: string;
    exchange_rate: number;
    usd_amount_cents: number;
    category_id: string | null;
    payment_method: 'debit' | 'credit';
    date: string;
    transaction_type: 'expense' | 'income' | 'savings';
    is_salary: boolean;
    original_currency: 'ARS' | 'USD' | null;
    original_amount_cents: number | null;
  }>
): Promise<Expense> {
  const result = await queryWithTimeout(async () => {
    return supabase
      .from('expenses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
  }, DEFAULT_TIMEOUT, WRITE_ATTEMPTS);

  if (!result) {
    throw new AppError(
      'Error al actualizar la transacción',
      ErrorCodes.DB_QUERY_ERROR,
      'high',
      null,
      false
    );
  }

  return result as Expense;
}

// Create installments using stored procedure
export async function createInstallments(
  userId: string,
  description: string,
  amountCents: number,
  currency: string,
  exchangeRate: number,
  usdAmountCents: number,
  categoryId: string,
  installmentCount: number,
  baseDate: string,
  billingDay: number
): Promise<void> {
  const params = {
    p_user_id: userId,
    p_description: description,
    p_amount_cents: Math.round(amountCents),
    p_currency: currency,
    p_exchange_rate: Math.round(exchangeRate),
    p_usd_amount_cents: Math.round(usdAmountCents),
    p_category_id: categoryId,
    p_installment_count: Math.round(installmentCount),
    p_base_date: baseDate,
    p_billing_day: Math.round(billingDay)
  };
  await queryWithTimeout(async () => {
    return supabase.rpc('create_installments', params);
  }, DEFAULT_TIMEOUT, WRITE_ATTEMPTS);
}

// Create category
export async function createCategory(categoryData: {
  user_id: string;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
}): Promise<Category> {
  const result = await queryWithTimeout(async () => {
    return supabase
      .from('categories')
      .insert(categoryData)
      .select()
      .single();
  }, DEFAULT_TIMEOUT, WRITE_ATTEMPTS);
  
  if (!result) {
    throw new AppError(
      'Error al crear la categoría',
      ErrorCodes.DB_QUERY_ERROR,
      'high',
      null,
      false
    );
  }
  
  return result as Category;
}

// Delete category with check for transactions
export async function deleteCategory(categoryId: string) {
  return queryWithTimeout(async () => {
    return supabase
      .from('categories')
      .delete()
      .eq('id', categoryId)
      .select()
      .single();
  }, DEFAULT_TIMEOUT, WRITE_ATTEMPTS);
}

// Check if category has transactions
export async function getTransactionCountForCategory(categoryId: string): Promise<number> {
  return withRetry(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new AppError(
          getErrorMessage(ErrorCodes.TIMEOUT_ERROR),
          ErrorCodes.TIMEOUT_ERROR,
          'high',
          null,
          true
        ));
      }, DEFAULT_TIMEOUT);
    });

    const result = await Promise.race([
      supabase
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', categoryId),
      timeoutPromise
    ]).finally(() => clearTimeout(timer));

    if (result.error) {
      throw handleSupabaseError(result.error, 'getTransactionCountForCategory');
    }

    // head:true queries never return a data body, so count is the only signal
    return result.count || 0;
  }, MAX_RETRIES);
}

// Synced settings (user_settings table). Returns null when the user has no row yet.
export async function fetchUserSettings(userId: string): Promise<SyncedSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('budgets, monthly_savings_goal_usd, billing_day')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw handleSupabaseError(error, 'fetchUserSettings');
  if (!data) return null;

  return {
    budgets: data.budgets ?? {},
    monthlySavingsGoalUSD: Number(data.monthly_savings_goal_usd) || 0,
    billingDay: data.billing_day,
  };
}

export async function saveUserSettings(userId: string, settings: SyncedSettings): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      budgets: settings.budgets,
      monthly_savings_goal_usd: settings.monthlySavingsGoalUSD,
      billing_day: settings.billingDay,
      updated_at: new Date().toISOString(),
    });

  if (error) throw handleSupabaseError(error, 'saveUserSettings');
}

// Fetch exchange rate with caching. Returns null when there's no live rate and nothing
// cached: guessing one would get stored permanently on every new transaction.
export async function fetchExchangeRate(): Promise<number | null> {
  const cacheKey = 'lastExchangeRate';
  const cacheTimeKey = 'lastExchangeRateTime';
  const cacheDuration = 24 * 60 * 60 * 1000; // 24 hours
  
  // Check cache first
  const cachedRate = localStorage.getItem(cacheKey);
  const cachedTime = localStorage.getItem(cacheTimeKey);
  
  if (cachedRate && cachedTime) {
    const age = Date.now() - parseInt(cachedTime);
    if (age < cacheDuration) {
      return parseFloat(cachedRate);
    }
  }
  
  try {
    const response = await fetch('https://api.bluelytics.com.ar/v2/latest');
    
    if (!response.ok) {
      throw new Error('Failed to fetch exchange rate');
    }
    
    const data = await response.json();
    const rate = Number(data.oficial?.value_sell || data.oficial?.value_avg);
    
    if (!rate || rate <= 0) {
      throw new Error('Invalid exchange rate data');
    }
    
    // Cache the result
    localStorage.setItem(cacheKey, rate.toString());
    localStorage.setItem(cacheTimeKey, Date.now().toString());
    
    return rate;
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    
    // Use cached rate even if expired
    if (cachedRate) {
      console.warn('Using expired cached exchange rate');
      return parseFloat(cachedRate);
    }
    
    return null;
  }
}

// Re-export error handling functions
export { AppError, ErrorCodes, getErrorMessage, showErrorAlert } from './errors';

// Export for backwards compatibility
export { supabase };
