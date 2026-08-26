import React from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { dexieStorage, getDB } from '../lib/db'
import type { ParishNotice } from '../types'
import { api, isAuthenticated } from '../lib/api'
import { syncCreateNotice, syncUpdateNotice, syncDeleteNotice } from '../lib/syncService'
import { runSyncFlow } from '../hooks/useSyncEngine'
import { generateId } from '../lib/id'

import * as Sentry from '@sentry/react'
import { decryptQueueValue } from '../lib/offlineCipher'

async function getPendingNoticeIds(): Promise<Set<string>> {
  try {
    const db = getDB()
    const pending = await db.syncQueue.where('status').anyOf(['pending', 'retrying']).toArray()
    const ids = new Set<string>()
    for (const item of pending) {
      if (item.entity !== 'notice') continue
      if (item.entityId) ids.add(item.entityId)
      try {
        const raw = await decryptQueueValue(item.payload)
        const p = raw !== null ? JSON.parse(raw) : null
        if (p && typeof p.id === 'string') ids.add(p.id)
      } catch {}
    }
    return ids
  } catch {
    return new Set<string>()
  }
}

interface NoticeState {
  notices: ParishNotice[]
  loading: boolean
  error: string | null
  setNotices: (notices: ParishNotice[]) => void
  fetchNotices: (updatedAfter?: string) => Promise<void>
  createNotice: (data: Omit<ParishNotice, 'id'>) => Promise<ParishNotice>
  updateNotice: (id: string, data: Partial<Omit<ParishNotice, 'id'>>) => Promise<ParishNotice>
  deleteNotice: (id: string) => Promise<void>
  replaceNoticeId: (oldId: string, serverNotice: ParishNotice) => void
}

const activeNoticeSubmissions = new Set<string>()

export const useNoticeStore = create<NoticeState>()(
  persist(
    (set, get) => ({
      notices: [],
      loading: false,
      error: null,

      setNotices: (notices) => set({ notices }),

      fetchNotices: async (updatedAfter?: string) => {
        if (!isAuthenticated()) return
        set({ loading: true, error: null })
        try {
          const fetched = await api.getNotices(updatedAfter)
          if (Array.isArray(fetched)) {
            const pendingIds = await getPendingNoticeIds()
            if (updatedAfter && fetched.length > 0) {
              set((state) => {
                const merged = new Map(state.notices.map(n => [n.id, n]))
                for (const n of fetched) {
                  if (merged.has(n.id) && pendingIds.has(n.id)) continue
                  merged.set(n.id, n)
                }
                return { notices: Array.from(merged.values()) }
              })
            } else {
              set((state) => {
                const next = new Map(fetched.map(n => [n.id, n]))
                for (const localNotice of state.notices) {
                  if (pendingIds.has(localNotice.id) && !next.has(localNotice.id)) {
                    next.set(localNotice.id, localNotice)
                  }
                }
                return { notices: Array.from(next.values()) }
              })
            }
          }
        } catch (err) {
          Sentry.captureException(err)
          set({ error: (err as Error)?.message || 'Lỗi tải danh sách thông báo' })
        } finally {
          set({ loading: false })
        }
      },

      createNotice: async (data) => {
        const localId = generateId('NC')
        const submissionKey = `${data.title}_${(data as any).targetAudience || 'all'}_${data.targetBranch || 'All'}_${data.date}`
        if (activeNoticeSubmissions.has(submissionKey)) {
          console.warn('[noticeStore] Blocked duplicate createNotice call in flight:', submissionKey)
          return { id: localId, ...data } as ParishNotice
        }
        activeNoticeSubmissions.add(submissionKey)

        try {
          const created = await api.createNotice(data)
          await get().fetchNotices()
          return created
        } catch (err: any) {
          const isNetwork = err instanceof TypeError
            || (err?.message && (String(err.message).includes('Network error') || String(err.message).includes('failed to fetch')))
          if (!isNetwork) throw err

          const now = new Date().toISOString()
          const offlineNotice: ParishNotice = {
            id: localId,
            ...data,
            createdAt: now,
            updatedAt: now,
          }
          set((state) => ({ notices: [...state.notices, offlineNotice] }))
          await syncCreateNotice(offlineNotice)
          runSyncFlow()
          return offlineNotice
        } finally {
          setTimeout(() => activeNoticeSubmissions.delete(submissionKey), 1000)
        }
      },

      updateNotice: async (id, data) => {
        try {
          const updated = await api.updateNotice(id, data)
          await get().fetchNotices()
          return updated
        } catch (err: any) {
          const isNetwork = err instanceof TypeError
            || (err?.message && (String(err.message).includes('Network error') || String(err.message).includes('failed to fetch')))
          if (!isNetwork) throw err

          set((state) => ({
            notices: state.notices.map((n) => (n.id === id ? { ...n, ...data } : n)),
          }))
          await syncUpdateNotice(id, data)
          runSyncFlow()
          return { id, ...data } as ParishNotice
        }
      },

      replaceNoticeId: (oldId, serverNotice) =>
        set((state) => ({
          notices: state.notices.map((n) => (n.id === oldId ? { ...serverNotice } : n)),
        })),

      deleteNotice: async (id) => {
        try {
          await api.deleteNotice(id)
          await get().fetchNotices()
        } catch (err: any) {
          const isNetwork = err instanceof TypeError
            || (err?.message && (String(err.message).includes('Network error') || String(err.message).includes('failed to fetch')))
          if (!isNetwork) throw err

          set((state) => ({
            notices: state.notices.filter((n) => n.id !== id),
          }))
          await syncDeleteNotice(id)
          runSyncFlow()
        }
      },
    }),
    {
      name: 'parish_store_notices',
      storage: createJSONStorage(() => dexieStorage),
      partialize: (state) => ({ notices: state.notices }),
      onRehydrateStorage: () => (state) => {
        if (state) state.fetchNotices()
      },
    }
  )
)