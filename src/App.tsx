import { useEffect, useRef } from 'react'
import { supabase } from './services/supabase'
import { useUserStore } from './stores/userStore'
import { useDataStore } from './stores/dataStore'
import { useUIStore } from './stores/uiStore'
import { fetchExchangeRate } from './lib/api'
import { LoginPage } from './pages/LoginPage'
import { Dashboard } from './pages/Dashboard'
import { SettingsModal } from './components/SettingsModal'
import { Toaster } from './components/ui/toaster'
import { Button } from './components/ui/button'
import { Settings } from 'lucide-react'

function App() {
  const { user, setUser, isLightMode, reducedMotion, setExchangeRate } = useUserStore()
  const { initializeCategories } = useDataStore()
  const { isSettingsOpen, setIsSettingsOpen, isLoading, setIsLoading } = useUIStore()
  const categoriesInitializedForUser = useRef<string | null>(null)

  useEffect(() => {
    setIsLoading(true)

    // Check if we have OAuth hash to parse
    const hash = window.location.hash
    const hasAuthHash = hash && hash.includes('access_token')
    
    // App initialization

    // Listen for auth changes FIRST (before checking session)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setIsLoading(false)
        // Initialize categories only once per user
        if (session?.user && categoriesInitializedForUser.current !== session.user.id) {
          categoriesInitializedForUser.current = session.user.id
          initializeCategories(session.user.id)
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
        // Don't call setUser here - onAuthStateChange handles it
        // Just handle the loading state if there's no session
        if (!session) {
          setIsLoading(false)
        }
      })
    } else {
      // Wait for Supabase to parse the hash (max 3 seconds)
      setTimeout(() => {
        setIsLoading(false)
      }, 3000)
    }

    return () => subscription.unsubscribe()
  }, [])

  // Fetch exchange rate on app load
  useEffect(() => {
    const loadExchangeRate = async () => {
      try {
        const rate = await fetchExchangeRate()
        setExchangeRate(rate)
      } catch (error) {
        console.error('Failed to load exchange rate:', error)
      }
    }
    loadExchangeRate()
  }, [])

  const handleLogout = async () => {
    setUser(null)
    await supabase.auth.signOut()
  }

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isLightMode ? 'bg-gradient-to-br from-violet-50 to-purple-50' : 'bg-black'}`}>
        <div className={`text-xl font-semibold ${isLightMode ? 'text-violet-600' : 'text-primary glow-primary'}`}>Cargando...</div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <div className={`min-h-screen pb-20 theme-transition ${reducedMotion ? '' : ''} ${isLightMode ? 'bg-gradient-to-br from-violet-50 to-purple-50' : 'bg-black'}`}>
      {/* Header */}
      <header className={`backdrop-blur-md border-b sticky top-0 z-10 ${isLightMode ? 'bg-white/80 border-violet-100' : 'bg-card/80 border-border'}`}>
        <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className={`text-xl font-bold ${isLightMode ? 'text-violet-900' : 'text-primary glow-primary'}`}>Gastitos</h1>
            <p className={`text-xs ${isLightMode ? 'text-violet-600' : 'text-muted-foreground'}`}>Tu tracker de gastos</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm hidden sm:block ${isLightMode ? 'text-violet-700' : 'text-muted-foreground'}`}>{user.email}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsSettingsOpen(true)} 
              className={`p-2 ${isLightMode ? 'text-violet-700' : 'text-primary hover:text-primary hover:bg-primary/10'}`}
              title="Configuración"
            >
              <Settings className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout} 
              className={isLightMode ? 'text-violet-700' : 'text-muted-foreground hover:text-foreground'}
            >
              Salir
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-6">
        <Dashboard />
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <Toaster />
    </div>
  )
}

export default App
