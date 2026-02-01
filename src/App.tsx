import { useEffect } from 'react'
import { supabase } from './services/supabase'
import { useAppStore } from './stores/appStore'
import { LoginPage } from './pages/LoginPage'
import { Dashboard } from './pages/Dashboard'
import { Button } from './components/ui/button'

function App() {
  const { user, setUser, isLoading, setIsLoading, initializeCategories } = useAppStore()

  useEffect(() => {
    setIsLoading(true)
    
    // Check if we have OAuth hash to parse
    const hash = window.location.hash
    const hasAuthHash = hash && hash.includes('access_token')
    
    console.log('App mounted, hash present:', !!hash, 'has auth:', hasAuthHash)

    // Listen for auth changes FIRST (before checking session)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.email)
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setIsLoading(false)
        if (event === 'SIGNED_IN') {
          initializeCategories()
        }
      }
    })

    // If there's no auth hash, check session immediately
    // If there IS an auth hash, wait for onAuthStateChange to fire
    if (!hasAuthHash) {
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          console.error('Session error:', error)
        }
        console.log('Initial session check:', session?.user?.email ?? 'none')
        setUser(session?.user ?? null)
        setIsLoading(false)
      })
    } else {
      // Wait for Supabase to parse the hash (max 3 seconds)
      setTimeout(() => {
        setIsLoading(false)
      }, 3000)
    }

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
