import { useEffect } from 'react'
import { supabase } from './services/supabase'
import { useAppStore } from './stores/appStore'
import { LoginPage } from './pages/LoginPage'
import { Dashboard } from './pages/Dashboard'
import { Button } from './components/ui/button'

function App() {
  const { user, setUser, isLoading, setIsLoading } = useAppStore()

  useEffect(() => {
    setIsLoading(true)
    
    // Handle OAuth callback if present
    const handleAuthCallback = async () => {
      try {
        // Check for auth code in URL (OAuth callback)
        const hash = window.location.hash
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        
        console.log('Checking auth callback, code:', code ? 'present' : 'none', 'hash:', hash ? 'present' : 'none')
        
        // If there's a code in the URL, exchange it for a session
        if (code) {
          console.log('Exchanging code for session...')
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            console.error('Code exchange error:', error)
          } else {
            console.log('Session exchanged successfully:', data.session?.user?.email)
          }
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname)
        }
        
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Session error:', error)
        }
        
        console.log('Current session:', session?.user?.email ?? 'none')
        setUser(session?.user ?? null)
      } catch (err) {
        console.error('Auth callback error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    handleAuthCallback()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.email)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-purple-50">
        <div className="text-violet-600 text-xl font-semibold">Cargando...</div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-purple-50 pb-20">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-violet-100 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-violet-900">Gastitos</h1>
            <p className="text-xs text-violet-600">Tu tracker de gastos</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-violet-700 hidden sm:block">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-violet-700">
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-md mx-auto px-4 py-6">
        <Dashboard />
      </main>
    </div>
  )
}

export default App
