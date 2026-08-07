// Centralized error handling for the application
import { useToastStore } from '../stores/toastStore';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export class AppError extends Error {
  code: string;
  severity: ErrorSeverity;
  originalError?: unknown;
  shouldRetry: boolean;
  
  constructor(
    message: string,
    code: string,
    severity: ErrorSeverity,
    originalError?: unknown,
    shouldRetry: boolean = false
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.severity = severity;
    this.originalError = originalError;
    this.shouldRetry = shouldRetry;
  }
}

// Error codes for different scenarios
export const ErrorCodes = {
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  OFFLINE_ERROR: 'OFFLINE_ERROR',
  
  // Database errors
  DB_CONNECTION_ERROR: 'DB_CONNECTION_ERROR',
  DB_QUERY_ERROR: 'DB_QUERY_ERROR',
  DB_CONSTRAINT_ERROR: 'DB_CONSTRAINT_ERROR',
  
  // Auth errors
  AUTH_ERROR: 'AUTH_ERROR',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  
  // Business logic errors
  CATEGORY_HAS_TRANSACTIONS: 'CATEGORY_HAS_TRANSACTIONS',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  
  // Unknown errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

// User-friendly error messages
const errorMessages: Record<string, string> = {
  [ErrorCodes.NETWORK_ERROR]: 'Error de conexión. Verifica tu internet.',
  [ErrorCodes.TIMEOUT_ERROR]: 'La operación tardó demasiado. Intenta de nuevo.',
  [ErrorCodes.OFFLINE_ERROR]: 'Estás sin conexión. Algunas funciones no están disponibles.',
  [ErrorCodes.DB_CONNECTION_ERROR]: 'Error al conectar con la base de datos.',
  [ErrorCodes.DB_QUERY_ERROR]: 'Error al procesar la consulta.',
  [ErrorCodes.DB_CONSTRAINT_ERROR]: 'No se puede realizar esta operación por restricciones de datos.',
  [ErrorCodes.AUTH_ERROR]: 'Error de autenticación. Inicia sesión de nuevo.',
  [ErrorCodes.SESSION_EXPIRED]: 'Tu sesión expiró. Inicia sesión de nuevo.',
  [ErrorCodes.VALIDATION_ERROR]: 'Datos inválidos. Verifica la información ingresada.',
  [ErrorCodes.INVALID_INPUT]: 'Entrada inválida.',
  [ErrorCodes.CATEGORY_HAS_TRANSACTIONS]: 'No se puede eliminar: la categoría tiene transacciones asociadas.',
  [ErrorCodes.DUPLICATE_ENTRY]: 'Ya existe un registro con estos datos.',
  [ErrorCodes.INSUFFICIENT_FUNDS]: 'Fondos insuficientes.',
  [ErrorCodes.UNKNOWN_ERROR]: 'Ocurrió un error inesperado.',
};

export function getErrorMessage(code: string): string {
  return errorMessages[code] || errorMessages[ErrorCodes.UNKNOWN_ERROR];
}

// Interface for PostgREST/Supabase errors
interface PostgrestError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

// Convert Supabase/Postgrest errors to AppError
export function handleSupabaseError(error: unknown, context: string): AppError {
  console.error(`Error in ${context}:`, error);
  
  // Handle PostgREST errors
  if (error && typeof error === 'object') {
    const pgError = error as PostgrestError;
    
    // Check for specific PostgreSQL error codes
    if (pgError.code) {
      switch (pgError.code) {
        case '23503': // foreign_key_violation
          return new AppError(
            getErrorMessage(ErrorCodes.CATEGORY_HAS_TRANSACTIONS),
            ErrorCodes.CATEGORY_HAS_TRANSACTIONS,
            'high',
            error,
            false
          );
        case '23505': // unique_violation
          return new AppError(
            getErrorMessage(ErrorCodes.DUPLICATE_ENTRY),
            ErrorCodes.DUPLICATE_ENTRY,
            'medium',
            error,
            false
          );
        case '23514': // check_violation
          return new AppError(
            getErrorMessage(ErrorCodes.VALIDATION_ERROR),
            ErrorCodes.VALIDATION_ERROR,
            'medium',
            error,
            false
          );
        case 'PGRST301': // JWT expired
          return new AppError(
            getErrorMessage(ErrorCodes.SESSION_EXPIRED),
            ErrorCodes.SESSION_EXPIRED,
            'critical',
            error,
            false
          );
      }
    }
    
    // Check for network errors
    if (pgError.message?.includes('network') || pgError.message?.includes('fetch')) {
      return new AppError(
        getErrorMessage(ErrorCodes.NETWORK_ERROR),
        ErrorCodes.NETWORK_ERROR,
        'high',
        error,
        true
      );
    }
    
    // Check for timeout errors
    if (pgError.message?.includes('timeout')) {
      return new AppError(
        getErrorMessage(ErrorCodes.TIMEOUT_ERROR),
        ErrorCodes.TIMEOUT_ERROR,
        'high',
        error,
        true
      );
    }
  }
  
  // Default to unknown error
  return new AppError(
    getErrorMessage(ErrorCodes.UNKNOWN_ERROR),
    ErrorCodes.UNKNOWN_ERROR,
    'medium',
    error,
    true
  );
}

// Global error handler that shows a toast
export function showErrorAlert(error: unknown, context?: string): void {
  let message: string;

  if (error instanceof AppError) {
    message = error.message;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = getErrorMessage(ErrorCodes.UNKNOWN_ERROR);
  }

  if (context) {
    message = `${context}: ${message}`;
  }

  useToastStore.getState().addToast(message, 'error');
}

// Retry wrapper for async operations
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      if (error instanceof AppError && !error.shouldRetry) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt < maxRetries - 1) {
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  
  throw lastError || new Error('Operation failed after retries');
}

// Network status monitoring
let isOnline = navigator.onLine;

export function initNetworkMonitoring(): void {
  window.addEventListener('online', () => {
    isOnline = true;
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    useToastStore.getState().addToast(
      'Estás sin conexión. Algunas funciones pueden no estar disponibles.',
      'error'
    );
  });
}

export function checkOnline(): boolean {
  return isOnline;
}

export function assertOnline(): void {
  if (!isOnline) {
    throw new AppError(
      getErrorMessage(ErrorCodes.OFFLINE_ERROR),
      ErrorCodes.OFFLINE_ERROR,
      'high',
      null,
      false
    );
  }
}
