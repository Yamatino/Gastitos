import { useState } from 'react'
import { useUserStore } from '../stores/userStore'
import { useDataStore } from '../stores/dataStore'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, Settings, DollarSign, Bell, Target, CreditCard, Plus, Trash2, Sun, Moon, Zap, ZapOff } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  // User store for preferences
  const { 
    showUsd, 
    toggleShowUsd,
    monthlySavingsGoalUSD,
    setMonthlySavingsGoalUSD,
    isLightMode,
    toggleTheme,
    reducedMotion,
    toggleReducedMotion
  } = useUserStore()
  
  // Data store for categories
  const { 
    categories, 
    addCategory, 
    removeCategory 
  } = useDataStore()
  
  const [activeTab, setActiveTab] = useState<'general' | 'cuotas' | 'categorias'>('general')
  const [budgetAlertThreshold, setBudgetAlertThreshold] = useState(80)
  const [billingDay, setBillingDay] = useState(10)
  const [savingsGoalInput, setSavingsGoalInput] = useState(monthlySavingsGoalUSD.toString())
  
  // Category management states
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryIcon, setNewCategoryIcon] = useState('📦')
  const [newCategoryColor, setNewCategoryColor] = useState('#7C3AED')

  if (!isOpen) return null

  const ICONS = ['📦', '💰', '🏠', '🛒', '🍻', '🚗', '💡', '🍔', '🎬', '🛍️', '💳', '📱', '⚕️', '🎓', '✈️', '🎮', '📚', '🏋️', '🎨', '🎵']
  const COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#6B7280', '#8B5CF6', '#EF4444', '#14B8A6', '#F97316']

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    
    try {
      await addCategory({
        name: newCategoryName.trim(),
        icon: newCategoryIcon,
        color: newCategoryColor,
        is_default: false
      })
      
      setNewCategoryName('')
      setIsAddingCategory(false)
    } catch (err) {
      console.error('Error adding category:', err)
      // Error is already shown via alert in the store
    }
  }

  const handleRemoveCategory = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta categoría?')) return

    try {
      await removeCategory(id)
    } catch (err) {
      // Error is already shown via alert in the store
    }
  }

  const handleSaveBillingDay = () => {
    localStorage.setItem('defaultBillingDay', billingDay.toString())
    alert('Día de facturación guardado')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Configuración</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'general' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('cuotas')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'cuotas' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Cuotas
          </button>
          <button
            onClick={() => setActiveTab('categorias')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'categorias' 
                ? 'text-primary border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Categorías
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Theme Toggle */}
              <div className="flex items-center justify-between p-4 bg-secondary rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isLightMode ? 'bg-amber-100 text-amber-600' : 'bg-violet-500/20 text-primary'}`}>
                    {isLightMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Tema</p>
                    <p className="text-sm text-muted-foreground">{isLightMode ? 'Modo claro' : 'Modo oscuro'}</p>
                  </div>
                </div>
                <button
                  onClick={toggleTheme}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Cambiar a {isLightMode ? 'oscuro' : 'claro'}
                </button>
              </div>

              {/* Reduced Motion */}
              <div className="flex items-center justify-between p-4 bg-secondary rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${reducedMotion ? 'bg-muted text-muted-foreground' : 'bg-success/20 text-success'}`}>
                    {reducedMotion ? <ZapOff className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Animaciones</p>
                    <p className="text-sm text-muted-foreground">{reducedMotion ? 'Reducidas' : 'Activas'}</p>
                  </div>
                </div>
                <button
                  onClick={toggleReducedMotion}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  {reducedMotion ? 'Activar' : 'Reducir'}
                </button>
              </div>

              {/* Currency */}
              <div className="flex items-center justify-between p-4 bg-secondary rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${showUsd ? 'bg-blue-500/20 text-blue-400' : 'bg-primary/20 text-primary'}`}>
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Moneda por defecto</p>
                    <p className="text-sm text-muted-foreground">Mostrar montos en {showUsd ? 'USD' : 'ARS'}</p>
                  </div>
                </div>
                <button
                  onClick={toggleShowUsd}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Cambiar a {showUsd ? 'ARS' : 'USD'}
                </button>
              </div>

              {/* Savings Goal */}
              <div className="p-4 bg-secondary rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-primary/20 text-primary rounded-lg">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Meta de Ahorro Mensual</p>
                    <p className="text-sm text-muted-foreground">Meta actual: ${monthlySavingsGoalUSD} USD</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">US$</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      step="1"
                      value={savingsGoalInput}
                      onChange={(e) => setSavingsGoalInput(e.target.value)}
                      placeholder="0"
                      className="pl-10 bg-background"
                    />
                  </div>
                  <Button 
                    onClick={() => {
                      const value = parseFloat(savingsGoalInput)
                      if (!isNaN(value) && value >= 0) {
                        setMonthlySavingsGoalUSD(value)
                      }
                    }}
                    className="bg-primary hover:opacity-90"
                  >
                    Guardar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Esta meta se aplicará a todos los meses futuros
                </p>
              </div>

              {/* Budget Alert */}
              <div className="p-4 bg-secondary rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-warning/20 text-warning rounded-lg">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Alerta de presupuesto</p>
                    <p className="text-sm text-muted-foreground">Advertir al alcanzar {budgetAlertThreshold}% del límite</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="50"
                    max="100"
                    value={budgetAlertThreshold}
                    onChange={(e) => setBudgetAlertThreshold(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-lg font-semibold text-primary w-12 text-center">
                    {budgetAlertThreshold}%
                  </span>
                </div>
              </div>

            </div>
          )}

          {activeTab === 'cuotas' && (
            <div className="space-y-6">
              <div className="p-4 bg-secondary rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-primary/20 text-primary rounded-lg">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Día de facturación</p>
                    <p className="text-sm text-muted-foreground">Día del mes en que vencen las cuotas</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="range"
                    min="1"
                    max="28"
                    value={billingDay}
                    onChange={(e) => setBillingDay(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-lg font-semibold text-primary w-12 text-center">
                    {billingDay}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Las cuotas se vencerán el día {billingDay} de cada mes
                </p>
                <Button 
                  onClick={handleSaveBillingDay}
                  className="w-full bg-primary hover:opacity-90"
                >
                  Guardar
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'categorias' && (
            <div className="space-y-4">
              {/* Add Category Button */}
              {!isAddingCategory ? (
                <button
                  onClick={() => setIsAddingCategory(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-primary/30 rounded-xl text-primary hover:bg-primary/10 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Agregar categoría de gasto
                </button>
              ) : (
                <div className="p-4 bg-secondary rounded-xl space-y-3">
                  <Input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nombre de la categoría"
                    className="bg-background"
                    autoFocus
                  />
                  
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Icono</label>
                    <div className="flex flex-wrap gap-2">
                      {ICONS.map(icon => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setNewCategoryIcon(icon)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${
                            newCategoryIcon === icon ? 'bg-primary/30 ring-2 ring-primary' : 'bg-background hover:bg-muted'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Color</label>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewCategoryColor(color)}
                          className={`w-8 h-8 rounded-lg ${
                            newCategoryColor === color ? 'ring-2 ring-white scale-110' : ''
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddingCategory(false)}
                      className="flex-1"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      onClick={handleAddCategory}
                      disabled={!newCategoryName.trim()}
                      className="flex-1 bg-primary hover:opacity-90"
                    >
                      Agregar
                    </Button>
                  </div>
                </div>
              )}

              {/* Categories List */}
              <div className="space-y-2">
                {categories.map(category => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between p-3 bg-secondary rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{category.icon}</span>
                      <div>
                        <span className="font-medium text-foreground">{category.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">(Gasto)</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveCategory(category.id)}
                      className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      title="Eliminar categoría"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {categories.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="w-12 h-12 mx-auto mb-2 text-primary/30" />
                  <p>No hay categorías</p>
                  <p className="text-sm mt-1">Agrega tu primera categoría de gasto</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
