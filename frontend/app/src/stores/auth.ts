import { create } from 'zustand'

export interface User {
  id: number
  name: string
  email: string
  role: string
  orgId: number
}

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  availableOrgs: Array<{ orgId: number; orgName: string; isAdmin: boolean }>
  loginSessionId: string | null
  isAuthenticated: boolean
  userRole: string | null
  initFromStorage: () => void
  setUser: (user: User) => void
  setTokens: (accessToken: string, refresh: string) => void
  setAvailableOrgs: (orgs: Array<{ orgId: number; orgName: string; isAdmin: boolean }>) => void
  setLoginSessionId: (id: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  availableOrgs: [],
  loginSessionId: null,
  get isAuthenticated() {
    return !!get().token
  },
  get userRole() {
    return get().user?.role ?? null
  },
  initFromStorage: () => {
    const token = localStorage.getItem('access_token')
    const refresh = localStorage.getItem('refresh_token')
    const userStr = localStorage.getItem('user')
    if (token) {
      set({
        token,
        refreshToken: refresh,
        user: userStr ? JSON.parse(userStr) : null,
      })
    }
  },
  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user))
    set({ user })
  },
  setTokens: (accessToken, refresh) => {
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refresh)
    set({ token: accessToken, refreshToken: refresh })
  },
  setAvailableOrgs: (orgs) => set({ availableOrgs: orgs }),
  setLoginSessionId: (id) => set({ loginSessionId: id }),
  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    set({ user: null, token: null, refreshToken: null, availableOrgs: [], loginSessionId: null })
  },
}))
