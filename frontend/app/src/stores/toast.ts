import { create } from 'zustand'

export type ToastIntent = 'success' | 'error' | 'warning' | 'info'

interface ToastState {
  visible: boolean
  text: string
  intent: ToastIntent
  notify: (text: string, intent?: ToastIntent) => void
  hide: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  text: '',
  intent: 'success',
  notify: (text, intent = 'success') => {
    set({ visible: true, text, intent })
    setTimeout(() => set({ visible: false }), 3000)
  },
  hide: () => set({ visible: false }),
}))
