import { create } from 'zustand'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  variant: 'error' | 'success'
  action?: ToastAction
  duration?: number
}

interface AddToastOptions {
  action?: ToastAction
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, variant?: Toast['variant'], options?: AddToastOptions) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (message, variant = 'error', options) => {
    const id = crypto.randomUUID()
    set((state) => ({
      toasts: [...state.toasts, { id, message, variant, action: options?.action, duration: options?.duration }]
    }))
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))
