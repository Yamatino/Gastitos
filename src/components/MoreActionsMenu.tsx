import { useState } from 'react'
import { Button } from './ui/button'
import { MoreHorizontal, Target, Download } from 'lucide-react'

interface MoreActionsMenuProps {
  onBudgetsClick: () => void
  onExportClick: () => void
}

export function MoreActionsMenu({ onBudgetsClick, onExportClick }: MoreActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleAction = (action: () => void) => {
    action()
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="outline"
        className="px-3 border-border hover:bg-muted"
        title="Más opciones"
      >
        <MoreHorizontal className="w-4 h-4" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown Menu */}
          <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-2 space-y-1">
              <button
                onClick={() => handleAction(onBudgetsClick)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-muted transition-colors group"
              >
                <div className="p-1.5 bg-warning/10 rounded-lg group-hover:bg-warning/20">
                  <Target className="w-4 h-4 text-warning" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground block">Presupuestos</span>
                  <span className="text-xs text-muted-foreground">Administrar límites</span>
                </div>
              </button>

              <div className="h-px bg-border my-1" />

              <button
                onClick={() => handleAction(onExportClick)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-muted transition-colors group"
              >
                <div className="p-1.5 bg-muted rounded-lg">
                  <Download className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground block">Exportar CSV</span>
                  <span className="text-xs text-muted-foreground">Descargar datos</span>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
