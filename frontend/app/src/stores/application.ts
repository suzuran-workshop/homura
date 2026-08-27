import { create } from 'zustand'
import type { Application } from '../api/application'
import { listApps } from '../api/application'

interface ApplicationState {
  apps: Application[]
  loading: boolean
  error: string
  fetchApps: () => Promise<void>
  clear: () => void
}

export const useApplicationStore = create<ApplicationState>((set) => ({
  apps: [],
  loading: false,
  error: '',
  fetchApps: async () => {
    set({ loading: true, error: '' })
    try {
      const apps = await listApps()
      set({ apps, loading: false })
    } catch (e: any) {
      set({ error: e.message || 'Failed to fetch apps', loading: false })
    }
  },
  clear: () => set({ apps: [], error: '' }),
}))
