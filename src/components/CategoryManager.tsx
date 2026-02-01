import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, Plus, Trash2, Tags } from 'lucide-react'

interface CategoryManagerProps {
  isOpen: boolean
  onClose: () => void
}

const ICONS = ['📦', '💰', '🏠', '🛒', '🍻', '🚗', '💡', '🍔', '🎬', '🛍️', '💳', '📱', '⚕️', '🎓', '✈️', '🎮', '📚', '🏋️', '🎨', '🎵']
const COLORS = ['#7C3AED', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#6B7280', '#8B5CF6', '#EF4444', '#14B8A6', '#F97316']

export function CategoryManager({ isOpen, onClose }: CategoryManagerProps) {
  const { categories, addCategory, removeCategory } = useAppStore()
  const [newCategoryName, setNewCategoryName] = useState('')
  const [selectedIcon, setSelectedIcon] = useState(ICONS[0])
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const [isAdding, setIsAdding] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen) return null

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCategoryName.trim()) return

    setIsLoading(true)
    try {
      await addCategory({
        name: newCategoryName.trim(),
        icon: selectedIcon,
        color: selectedColor,
        is_default: false
      })
      setNewCategoryName('')
      setIsAdding(false)
    } catch (err) {
      alert('Error al agregar categoría')
    } finally {
      setIsLoading(false)
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Tags className="w-5 h-5 text-violet-600" />
            <h2 className="text-xl font-bold text-gray-900">Gestionar Categorías</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {/* Add New Category Button */}
          {!isAdding ? (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full flex items-center justify-center gap-2 py-3 mb-4 border-2 border-dashed border-violet-300 rounded-xl text-violet-600 hover:bg-violet-50 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Agregar nueva categoría
            </button>
          ) : (
            <form onSubmit={handleAddCategory} className="mb-4 p-4 bg-violet-50 rounded-xl space-y-3">
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
                      onClick={() => setSelectedIcon(icon)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${
                        selectedIcon === icon ? 'bg-violet-200 ring-2 ring-violet-500' : 'bg-white hover:bg-gray-100'
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
                      onClick={() => setSelectedColor(color)}
                      className={`w-8 h-8 rounded-lg ${
                        selectedColor === color ? 'ring-2 ring-gray-400 scale-110' : ''
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
                  onClick={() => setIsAdding(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !newCategoryName.trim()}
                  className="flex-1 bg-violet-600 hover:bg-violet-700"
                >
                  {isLoading ? 'Agregando...' : 'Agregar'}
                </Button>
              </div>
            </form>
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
              <Tags className="w-12 h-12 mx-auto mb-2 text-violet-300" />
              <p>No hay categorías</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
