import * as ToastPrimitive from '@radix-ui/react-toast'
import { CheckCircle2, XCircle, X } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { cn } from '../../lib/utils'

export function Toaster() {
  const { toasts, removeToast } = useToastStore()

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
      {toasts.map((toast) => (
        <ToastPrimitive.Root
          key={toast.id}
          onOpenChange={(open) => {
            if (!open) removeToast(toast.id)
          }}
          className={cn(
            'flex items-start gap-3 rounded-xl border p-4 shadow-lg bg-card text-card-foreground border-border',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-top-full sm:data-[state=open]:slide-in-from-bottom-full',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-80',
            'data-[swipe=end]:animate-out'
          )}
        >
          {toast.variant === 'error' ? (
            <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
          )}
          <ToastPrimitive.Description className="text-sm flex-1">
            {toast.message}
          </ToastPrimitive.Description>
          <ToastPrimitive.Close aria-label="Cerrar" className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96 max-w-full outline-none" />
    </ToastPrimitive.Provider>
  )
}
