import { create } from 'zustand'
import type { Role } from '../types'
import { setTokens, clearTokens, loadTokensFromStorage, api } from '../lib/api'

export interface AuthUser {
  id: string
  username: string
  fullName: string
  role: Role
  status: string
  mustChangePassword?: number
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  requiresPasswordChange: boolean

  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  setUser: (user: AuthUser) => void
  clearError: () => void
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>
  loadFromStorage: () => void
}

const STORAGE_KEY = 'parish_current_user'

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  requiresPasswordChange: false,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.login(username, password)
      if (res && res.accessToken) {
        setTokens(res.accessToken, res.refreshToken)
        const user: AuthUser = {
          id: res.user.id,
          username: res.user.username,
          fullName: res.user.fullName,
          role: res.user.role as Role,
          status: res.user.status || 'ACTIVE',
          mustChangePassword: res.user.mustChangePassword,
        }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)) } catch {}
        const requiresChange = user.status === 'FORCE_PASSWORD_CHANGE' || user.mustChangePassword === 1
        set({ user, isAuthenticated: true, isLoading: false, requiresPasswordChange: requiresChange })
        return true
      }
      set({ error: 'Đăng nhập không thành công', isLoading: false })
      return false
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tên đăng nhập hoặc mật khẩu không chính xác!'
      set({ error: message, isLoading: false })
      return false
    }
  },

  logout: () => {
    clearTokens()
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
    set({ user: null, isAuthenticated: false, requiresPasswordChange: false, error: null })
  },

  setUser: (user: AuthUser) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)) } catch {}
    set({ user, isAuthenticated: true })
  },

  clearError: () => set({ error: null }),

  changePassword: async (currentPassword: string, newPassword: string) => {
    set({ isLoading: true, error: null })
    try {
      await api.changePassword(currentPassword, newPassword)
      const user = get().user
      if (user) {
        const updatedUser = { ...user, status: 'ACTIVE', mustChangePassword: 0 }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser)) } catch {}
        set({ user: updatedUser as AuthUser, requiresPasswordChange: false, isLoading: false })
      } else {
        set({ isLoading: false })
      }
      return true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể đổi mật khẩu'
      set({ error: message, isLoading: false })
      return false
    }
  },

  loadFromStorage: () => {
    loadTokensFromStorage()
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const user = JSON.parse(raw) as AuthUser
        const requiresChange = user.status === 'FORCE_PASSWORD_CHANGE' || user.mustChangePassword === 1
        set({ user, isAuthenticated: true, requiresPasswordChange: requiresChange })
      }
    } catch {
      set({ user: null, isAuthenticated: false })
    }
  },
}))
