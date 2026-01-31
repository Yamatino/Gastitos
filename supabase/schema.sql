-- Crear tabla de categorías
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📦',
  color TEXT DEFAULT '#7C3AED',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear tabla de gastos
CREATE TABLE expenses (
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

-- Políticas de seguridad (RLS)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Política para categorías
CREATE POLICY "Users can only see their own categories"
  ON categories FOR ALL
  USING (auth.uid() = user_id);

-- Política para gastos
CREATE POLICY "Users can only see their own expenses"
  ON expenses FOR ALL
  USING (auth.uid() = user_id);

-- Función para crear categorías por defecto
CREATE OR REPLACE FUNCTION create_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO categories (user_id, name, icon, color, is_default) VALUES
    (NEW.id, 'Salario', '💰', '#10B981', true),
    (NEW.id, 'Comida', '🍔', '#F59E0B', true),
    (NEW.id, 'Transporte', '🚗', '#3B82F6', true),
    (NEW.id, 'Entretenimiento', '🎬', '#EC4899', true),
    (NEW.id, 'Servicios', '💡', '#6B7280', true),
    (NEW.id, 'Compras', '🛍️', '#8B5CF6', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para crear categorías cuando se registra un usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_categories();

-- Índices para mejor performance
CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_installment ON expenses(installment_group_id);
CREATE INDEX idx_categories_user_id ON categories(user_id);
