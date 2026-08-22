import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import { readBootUI, writeBootUI } from '../lib/uiBoot'

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // PHA 2 (audit A24): khởi tạo từ mirror — inline script trong index.html
      // đã thêm .dark trước paint; store phải khớp để không bị effect lật ngược.
      theme: readBootUI().theme === 'dark' ? 'dark' : 'light',
      toggleTheme: () =>
        set((s) => {
          const next = s.theme === 'light' ? 'dark' : 'light'
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', next === 'dark')
          }
          writeBootUI({ theme: next })
          return { theme: next }
        }),
      setTheme: (theme) => {
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', theme === 'dark')
        }
        writeBootUI({ theme })
        set({ theme })
      },
    }),
    {
      name: 'parish_store_theme',
      storage: createJSONStorage(() => dexieStorage),
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', state.theme === 'dark')
          writeBootUI({ theme: state.theme })
        }
      },
    }
  )
)
