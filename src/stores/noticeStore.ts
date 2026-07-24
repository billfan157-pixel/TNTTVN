import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage } from '../lib/db'
import type { ParishNotice } from '../types'
import { api } from '../lib/api'
import * as Sentry from '@sentry/react'

interface NoticeState {
  notices: ParishNotice[]
  setNotices: (notices: ParishNotice[]) => void
  fetchNotices: () => Promise<void>
}

export const useNoticeStore = create<NoticeState>()(
  persist(
    (set) => ({
      notices: [],
      setNotices: (notices) => set({ notices }),

      fetchNotices: async () => {
        try {
          const fetched = await api.getNotices()
          if (Array.isArray(fetched)) {
            set({ notices: fetched })
          }
        } catch (err) {
          Sentry.captureException(err)
        }
      },
    }),
    {
      name: 'parish_store_notices',
      storage: createJSONStorage(() => dexieStorage),
    }
  )
)
