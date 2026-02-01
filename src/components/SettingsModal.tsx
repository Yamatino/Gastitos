import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, Settings, DollarSign, Bell, Target, CreditCard, Plus, Trash2 } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { 
    categories, 
    addCategory, 
    removeCategory,
    showUsd, 
    toggleShowUsd
  } = useAppStore()
  
  const [activeTab, setActiveTab] = useState<'general' | 'cuotas' | 'categorias'>('general')
  const [budgetAlertThreshold, setBudgetAlertThreshold] = useState(80)
  const [billingDay, setBillingDay] = useState(10)
  
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
        is_default: false,
        type: 'expense'
      })
      
      setNewCategoryName('')
      setIsAddingCategory(false)
    } catch (err) {
      console.error('Error adding category:', err)
      alert('Error al agregar categoría')
    }
  }

  const handleRemoveCategory = async (id: string, isDefault: boolean) => {
    if (isDefault) {
      alert('No se pueden eliminar categorías por defecto')
      return
    }
    if (!confirm('¿Estás seguro de que quieres eliminar esta categoría?')) return

    try {
      await removeCategory(id)
    } catch (err) {
      alert('Error al eliminar categoría')
    }
  }

  const handleSaveBillingDay = () => {
    // Save to localStorage for now, could be saved to Supabase user preferences later
    localStorage.setItem('defaultBillingDay', billingDay.toString())
    alert('Día de facturación guardado')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-violet-600" />
            <h2 className="text-xl font-bold text-gray-900">Configuración</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'general' 
                ? 'text-violet-600 border-b-2 border-violet-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('cuotas')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'cuotas' 
                ? 'text-violet-600 border-b-2 border-violet-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Cuotas
          </button>
          <button
            onClick={() => setActiveTab('categorias')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'categorias' 
                ? 'text-violet-600 border-b-2 border-violet-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Categorías
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Currency */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${showUsd ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'}`}>
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Moneda por defecto</p>
                    <p className="text-sm text-gray-500">Mostrar montos en {showUsd ? 'USD' : 'ARS'}</p>
                  </div>
                </div>
                <button
                  onClick={toggleShowUsd}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700"
                >
                  Cambiar a {showUsd ? 'ARS' : 'USD'}
                </button>
              </div>

              {/* Budget Alert */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Alerta de presupuesto</p>
                    <p className="text-sm text-gray-500">Advertir al alcanzar {budgetAlertThreshold}% del límite</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="50"
                    max="100"
                    value={budgetAlertThreshold}
                    onChange={(e) => setBudgetAlertThreshold(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                  />
                  <span className="text-lg font-semibold text-violet-600 w-12 text-center">
                    {budgetAlertThreshold}%
                  </span>
                </div>
              </div>


            </div>
          )}

          {activeTab === 'cuotas' && (
            <div className="space-y-6">
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-violet-100 text-violet-600 rounded-lg">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Día de facturación</p>
                    <p className="text-sm text-gray-500">Día del mes en que vencen las cuotas</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="range"
                    min="1"
                    max="28"
                    value={billingDay}
                    onChange={(e) => setBillingDay(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                  />
                  <span className="text-lg font-semibold text-violet-600 w-12 text-center">
                    {billingDay}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Las cuotas se vencerán el día {billingDay} de cada mes
                </p>
                <Button 
                  onClick={handleSaveBillingDay}
                  className="w-full bg-violet-600 hover:bg-violet-700"
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
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-violet-300 rounded-xl text-violet-600 hover:bg-violet-50 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Agregar categoría personalizada
                </button>
              ) : (
                <div className="p-4 bg-violet-50 rounded-xl space-y-3">
                  <Input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nombre de la categoría"
                    className="bg-white"
                    autoFocus
                  />
                  
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Icono</label>
                    <div className="flex flex-wrap gap-2">
                      {ICONS.map(icon => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setNewCategoryIcon(icon)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${
                            newCategoryIcon === icon ? 'bg-violet-200 ring-2 ring-violet-500' : 'bg-white hover:bg-gray-100'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Color</label>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewCategoryColor(color)}
                          className={`w-8 h-8 rounded-lg ${
                            newCategoryColor === color ? 'ring-2 ring-gray-400 scale-110' : ''
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
                      className="flex-1 bg-violet-600 hover:bg-violet-700"
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
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{category.icon}</span>
                      <div>
                        <span className="font-medium text-gray-900">{category.name}</span>
                        {category.is_default && (
                          <span className="ml-2 text-xs text-gray-500">(por defecto)</span>
                        )}
                      </div>
                    </div>
                    {!category.is_default && (
                      <button
                        onClick={() => handleRemoveCategory(category.id, category.is_default)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {categories.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Target className="w-12 h-12 mx-auto mb-2 text-violet-300" />
                  <p>No hay categorías</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
