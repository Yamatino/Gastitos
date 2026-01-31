# Gastitos 💜

Tu tracker de gastos personales. Controla tus gastos en pesos argentinos con conversión a USD.

## Características ✨

- 🔐 Autenticación con Google (Supabase Auth)
- 💰 Registro rápido de gastos (débito y crédito)
- 📊 Dashboard con métricas del mes
- 💳 Seguimiento de cuotas (hasta 24 meses)
- 🔄 Conversión ARS/USD (toggle en tiempo real)
- 📱 Diseño mobile-first (PWA ready)
- 🎨 Tema violeta moderno
- 🏷️ Categorías personalizables

## Tecnologías 🛠️

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth)
- **State**: Zustand
- **Deploy**: Vercel

## Configuración Local 🚀

1. **Clonar y instalar**:
```bash
git clone https://github.com/tu-usuario/gastitos.git
cd gastitos
npm install
```

2. **Configurar Supabase**:
- Crea proyecto en https://supabase.com
- Configura Google OAuth (ver `supabase/README.md`)
- Copia `.env.example` a `.env` y completa las variables

3. **Base de datos**:
- Ejecuta el SQL en `supabase/schema.sql` en el SQL Editor de Supabase

4. **Iniciar**:
```bash
npm run dev
```

## Variables de Entorno 🔑

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
```

## Despliegue 🌐

```bash
npm run build
# Subir a Vercel (conecta tu repo GitHub)
```

## Estructura del Proyecto 📁

```
src/
├── components/       # UI components
├── pages/           # Page components
├── services/        # Supabase client
├── stores/          # Zustand stores
├── lib/             # Utilities
└── types.ts         # TypeScript types
```

## Licencia 📄

MIT - Libre para usar y modificar
