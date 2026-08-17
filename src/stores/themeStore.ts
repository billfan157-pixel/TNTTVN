import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      toggleTheme: () =>
        set((s) => {
          const next = s.theme === 'light' ? 'dark' : 'light'
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', next === 'dark')
          }
          return { theme: next }
        }),
      setTheme: (theme) => {
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', theme === 'dark')
        }
        set({ theme })
      },
    }),
    {
      name: 'parish_store_theme',
      storage: createJSONStorage(() => dexieStorage),
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', state.theme === 'dark')
        }
      },
    }
  )
)
