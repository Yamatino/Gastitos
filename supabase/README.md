# Configuración de Supabase

## 1. Crear Proyecto

1. Ve a https://supabase.com
2. Crea una cuenta o inicia sesión
3. Crea un nuevo proyecto llamado "gastitos"
4. Espera a que se complete la configuración

## 2. Configurar Google OAuth

1. En el dashboard de Supabase, ve a Authentication → Providers
2. Habilita Google
3. Crea credenciales en Google Cloud Console:
   - Ve a https://console.cloud.google.com
   - Crea un proyecto
   - Habilita Google+ API
   - Crea credenciales OAuth 2.0
   - Configura redirect URI: `https://tu-proyecto.supabase.co/auth/v1/callback`
4. Copia Client ID y Client Secret a Supabase

## 3. Variables de Entorno

Copia estas variables a tu archivo `.env`:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

Las encuentras en: Project Settings → API

## 4. Ejecutar Schema SQL

Ve al SQL Editor en Supabase y ejecuta el contenido del archivo `schema.sql`
