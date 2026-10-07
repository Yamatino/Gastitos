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
import { useToastStore } from './stores/toastStore'
import { startSettingsSync, stopSettingsSync } from './lib/settingsSync'

function App() {
  const { user, setUser, isLightMode, setExchangeRate, clearSyncedSettings } = useUserStore()
  const { initializeCategories, resetData } = useDataStore()
  const { isSettingsOpen, setIsSettingsOpen, isLoading, setIsLoading } = useUIStore()
  const categoriesInitializedForUser = useRef<string | null>(null)

  // Theme tokens in index.css hang off a class on <html>, so the whole page
  // (including modals portaled to body) follows the selected theme
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('light', isLightMode)
    root.classList.toggle('dark', !isLightMode)
    // Match the phone's status bar / browser chrome to the page background
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isLightMode ? '#f5f6f9' : '#101115')
  }, [isLightMode])

  useEffect(() => {
    setIsLoading(true)

    // Check if we have OAuth hash to parse
    const hash = window.location.hash
    const hasAuthHash = hash && hash.includes('access_token')
    
    // App initialization

    // Listen for auth changes FIRST (before checking session)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'SIGNED_OUT') {
        // Also covers logouts from another tab and expired sessions
        resetData()
        stopSettingsSync()
        clearSyncedSettings()
        categoriesInitializedForUser.current = null
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setIsLoading(false)
        // Initialize categories only once per user
        if (session?.user && categoriesInitializedForUser.current !== session.user.id) {
          categoriesInitializedForUser.current = session.user.id
          initializeCategories(session.user.id)
          startSettingsSync(session.user.id)
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
        if (rate === null) {
          useToastStore.getState().addToast(
            'No se pudo obtener la cotización del dólar. Los montos en USD no están disponibles por ahora.'
          )
          return
        }
        setExchangeRate(rate)
      } catch (error) {
        console.error('Failed to load exchange rate:', error)
      }
    }
    loadExchangeRate()
  }, [])

  const handleLogout = async () => {
    setUser(null)
    resetData()
    stopSettingsSync()
    clearSyncedSettings()
    categoriesInitializedForUser.current = null
    await supabase.auth.signOut()
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-base font-medium text-muted-foreground">Cargando...</div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <div className="min-h-screen pb-20 theme-transition bg-background">
      {/* Header */}
      <header className="backdrop-blur-md border-b border-border sticky top-0 z-10 bg-background/80">
        <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Gastitos</h1>
            <p className="text-xs text-muted-foreground">Tu tracker de gastos</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm hidden sm:block text-muted-foreground">{user.email}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsSettingsOpen(true)} 
              className="p-2 text-muted-foreground hover:text-foreground"
              title="Configuración"
            >
              <Settings className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleLogout} 
              className="text-muted-foreground hover:text-foreground"
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
