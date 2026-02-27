import { supabase } from '../services/supabase';
import type { Expense, Category } from '../services/supabase';
import { AppError, ErrorCodes, getErrorMessage, handleSupabaseError, withRetry } from './errors';

const DEFAULT_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;

// Wrapper for Supabase queries with timeout and retry
export async function queryWithTimeout<T>(
  queryFn: () => Promise<{ data: T | null; error: unknown }>,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<T> {
  return withRetry(async () => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
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
    }
  }, MAX_RETRIES);
}

// Fetch expenses with pagination
export async function fetchExpenses(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    orderBy?: string;
    ascending?: boolean;
  } = {}
) {
  const { limit = 50, offset = 0, orderBy = 'date', ascending = false } = options;
  
  return queryWithTimeout(async () => {
    return supabase
      .from('expenses')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order(orderBy, { ascending })
      .range(offset, offset + limit - 1);
  });
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
  is_recurring: boolean;
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
  });
  
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
  console.log('Creating installments with params:', params);
  const result = await supabase.rpc('create_installments', params);
  if (result.error) {
    console.error('create_installments error details:', result.error);
    throw handleSupabaseError(result.error, 'create_installments');
  }
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
  });
  
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
  });
}

// Check if category has transactions
export async function getTransactionCountForCategory(categoryId: string): Promise<number> {
  const result = await queryWithTimeout(async () => {
    return supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId);
  });
  
  return result.length || 0;
}

// Fetch exchange rate with caching
export async function fetchExchangeRate(): Promise<number> {
  const cacheKey = 'lastExchangeRate';
  const cacheTimeKey = 'lastExchangeRateTime';
  const cacheDuration = 24 * 60 * 60 * 1000; // 24 hours
  
  // Check cache first
  const cachedRate = localStorage.getItem(cacheKey);
  const cachedTime = localStorage.getItem(cacheTimeKey);
  
  if (cachedRate && cachedTime) {
    const age = Date.now() - parseInt(cachedTime);
    if (age < cacheDuration) {
      console.log('Using cached exchange rate:', cachedRate);
      return parseFloat(cachedRate);
    }
  }
  
  try {
    const response = await fetch('https://api.bluelytics.com.ar/v2/latest');
    
    if (!response.ok) {
      throw new Error('Failed to fetch exchange rate');
    }
    
    const data = await response.json();
    const rate = data.oficial?.value_sell || data.oficial?.value_avg;
    
    if (!rate) {
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
    
    // Fallback to default
    console.warn('Using default exchange rate: 1000');
    return 1000;
  }
}

// Re-export error handling functions
export { AppError, ErrorCodes, getErrorMessage, showErrorAlert } from './errors';

// Export for backwards compatibility
export { supabase };
