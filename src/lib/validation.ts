import { z } from 'zod';

// ============================================
// Base Schemas
// ============================================

export const CategorySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1).max(50),
  icon: z.string().max(10),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  is_default: z.boolean(),
  created_at: z.string().datetime(),
});

export const ExpenseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  description: z.string().min(1).max(200),
  amount_cents: z.number().int(),
  currency: z.enum(['ARS', 'USD']),
  exchange_rate: z.number().positive(),
  usd_amount_cents: z.number().int(),
  original_currency: z.enum(['ARS', 'USD']).optional(),
  original_amount_cents: z.number().int().optional(),
  category_id: z.string().uuid().nullable(),
  payment_method: z.enum(['debit', 'credit']),
  is_installment: z.boolean(),
  is_recurring: z.boolean(),
  installment_group_id: z.string().uuid().optional(),
  installment_number: z.number().int().min(1).max(24).optional(),
  total_installments: z.number().int().min(1).max(24).optional(),
  installment_amount_cents: z.number().int().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['paid', 'pending']),
  transaction_type: z.enum(['expense', 'income', 'savings']),
  is_salary: z.boolean().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// ============================================
// Input Validation Schemas
// ============================================

export const CreateCategoryInputSchema = z.object({
  name: z.string()
    .min(1, 'El nombre es requerido')
    .max(50, 'El nombre no puede tener más de 50 caracteres')
    .transform(s => s.trim()),
  icon: z.string().max(10).default('📦'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#7C3AED'),
  is_default: z.boolean().default(false),
});

export const CreateExpenseInputSchema = z.object({
  description: z.string()
    .min(1, 'La descripción es requerida')
    .max(200, 'La descripción no puede tener más de 200 caracteres')
    .transform(s => s.trim().replace(/[<>]/g, '')), // Remove potential HTML tags
  amount: z.number()
    .positive('El monto debe ser mayor a 0')
    .max(1000000000, 'El monto no puede ser mayor a 10,000,000 ARS'),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  category_id: z.string().uuid().nullable(),
  payment_method: z.enum(['debit', 'credit']).default('debit'),
  is_installment: z.boolean().default(false),
  is_recurring: z.boolean().default(false),
  installments: z.number().int().min(1).max(24).default(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transaction_type: z.enum(['expense', 'income', 'savings']).default('expense'),
  is_salary: z.boolean().default(false),
});

// ============================================
// Validation Helpers
// ============================================

export function validateCategoryInput(input: unknown) {
  return CreateCategoryInputSchema.safeParse(input);
}

export function validateExpenseInput(input: unknown) {
  return CreateExpenseInputSchema.safeParse(input);
}

export function sanitizeDescription(description: string): string {
  return description
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .slice(0, 200);
}

export function sanitizeCategoryName(name: string): string {
  return name
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, 50);
}

// ============================================
// Type Exports
// ============================================

export type Category = z.infer<typeof CategorySchema>;
export type Expense = z.infer<typeof ExpenseSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>;
export type CreateExpenseInput = z.infer<typeof CreateExpenseInputSchema>;
