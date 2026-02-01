-- Drop the trigger that might be causing issues
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS create_default_categories();

-- Tabla de categorías (sin cambios)
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📦',
  color TEXT DEFAULT '#7C3AED',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de gastos (sin cambios)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'ARS',
  exchange_rate DECIMAL(10,2) DEFAULT 1000,
  usd_amount_cents INTEGER,
  
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  payment_method TEXT CHECK (payment_method IN ('debit', 'credit')),
  
  is_installment BOOLEAN DEFAULT false,
  installment_group_id UUID,
  installment_number INTEGER,
  total_installments INTEGER,
  installment_amount_cents INTEGER,
  
  date DATE NOT NULL,
  status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
  
  is_recurring BOOLEAN DEFAULT false,
  recurring_parent_id UUID REFERENCES expenses(id),
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY IF NOT EXISTS "Users can only see their own categories"
  ON categories FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can only see their own expenses"
  ON expenses FOR ALL
  USING (auth.uid() = user_id);

-- Índices
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_installment ON expenses(installment_group_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
