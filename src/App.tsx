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
    
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
