import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  variant: 'error' | 'success'
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, variant?: Toast['variant']) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (message, variant = 'error') => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }))
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))
