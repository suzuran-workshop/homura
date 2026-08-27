import { create } from 'zustand'

interface ThemeState {
  isDark: boolean
  toggle: () => void
  init: () => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: false,
  toggle: () =>
    set((state) => {
      const next = !state.isDark
      localStorage.setItem('theme', next ? 'dark' : 'light')
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
      return { isDark: next }
    }),
  init: () => {
    const saved = localStorage.getItem('theme')
    const isDark = saved === 'dark'
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    set({ isDark })
  },
}))
