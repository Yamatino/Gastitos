import { useState } from 'react'
import { supabase } from '../services/supabase'
import { useUserStore } from '../stores/userStore'
import { Button } from '../components/ui/button'
import { CreditCard, Wallet } from 'lucide-react'

export function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { setUser } = useUserStore()

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true)
      setError('')
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })
      
      if (error) throw error
    } catch (err) {
      setError('Error al iniciar sesión con Google')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  // Dev bypass for testing - only works on localhost or preview deployments
  const handleDevBypass = async () => {
    try {
      setIsLoading(true)
      setError('')
      
      // Create a mock user for testing
      const mockUser = {
        id: 'dev-user-' + Date.now(),
        email: 'dev@test.com',
        user_metadata: { name: 'Dev User' }
      }
      
      // Store in localStorage to persist across reloads
      localStorage.setItem('devBypassUser', JSON.stringify(mockUser))
      
      // Set user in store
      setUser(mockUser as any)
    } catch (err) {
      setError('Error en bypass de desarrollo')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-violet-600 via-purple-600 to-violet-800 p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center">
        {/* Logo/Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
            <div className="flex gap-1">
              <Wallet className="w-8 h-8 text-white" />
              <CreditCard className="w-8 h-8 text-white/80" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Gastitos</h1>
        <p className="text-gray-500 mb-8">Controla tus gastos de forma simple</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        <Button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full bg-white border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 font-semibold py-3 rounded-xl transition-all"
        >
          {isLoading ? (
            'Conectando...'
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continuar con Google
            </>
          )}
        </Button>

        {/* Dev bypass button - only shows on preview deployments */}
        {window.location.hostname.includes('vercel.app') && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-400 mb-2">Desarrollo</p>
            <Button
              onClick={handleDevBypass}
              disabled={isLoading}
              variant="outline"
              className="w-full border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 py-2 text-sm"
            >
              Entrar sin Google (Test)
            </Button>
          </div>
        )}

        <p className="mt-6 text-xs text-gray-400">
          Al iniciar sesión, aceptas nuestros términos de uso
        </p>
      </div>
    </div>
  )
}
