import { create } from 'zustand'
import { api } from '../lib/api'
import { useAuthStore } from './authStore'

export interface ParishEvent {
  id: string
  parishId: string
  date: string // YYYY-MM-DD
  title: string
  description?: string
  branch?: string
  category: 'FEAST_DAY' | 'CAMP' | 'TRAINING' | 'SACRAMENT' | 'RETREAT' | 'MEETING' | 'OTHER'
  categoryName: string
  time?: string | null
  location?: string | null
  createdBy?: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

interface ParishEventState {
  events: ParishEvent[]
  loading: boolean
  error: string | null
  fetchEvents: (params?: { from?: string; to?: string }) => Promise<void>
  createEvent: (data: Omit<ParishEvent, 'id' | 'parishId' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<ParishEvent | null>
  updateEvent: (id: string, data: Partial<Pick<ParishEvent, 'date' | 'title' | 'category' | 'categoryName' | 'time' | 'location'>>) => Promise<ParishEvent | null>
  deleteEvent: (id: string) => Promise<boolean>
  getEventsByDate: (date: string) => ParishEvent[]
}

const STORAGE_KEY = 'parish_calendar_events_v1'

function loadLocalFallback(): ParishEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as ParishEvent[]
    // Migrate old local shape (EV-xxx without parishId) to new shape
    return arr.map(e => ({
      ...e,
      parishId: (e as any).parishId || useAuthStore.getState().user?.parishId || 'gia-ton',
      category: e.category as ParishEvent['category'],
    }))
  } catch {
    return []
  }
}

function saveLocalFallback(events: ParishEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  } catch {}
}

export const useParishEventStore = create<ParishEventState>((set, get) => ({
  events: loadLocalFallback(),
  loading: false,
  error: null,

  fetchEvents: async (params) => {
    set({ loading: true, error: null })
    try {
      const data = await api.getParishEvents(params)
      // Server is authoritative — replace local
      set({ events: data, loading: false })
      saveLocalFallback(data)
    } catch (err: any) {
      // Fallback to localStorage when offline or server not yet migrated
      const local = loadLocalFallback()
      set({ events: local, loading: false, error: err?.message || 'Không tải được lịch xứ đoàn' })
    }
  },

  createEvent: async (data) => {
    try {
      const created = await api.createParishEvent(data as any)
      set(s => ({ events: [...s.events, created] }))
      saveLocalFallback(get().events)
      return created
    } catch {
      // Offline fallback: create locally with temp id
      const temp: ParishEvent = {
        id: `EV-${Date.now()}`,
        parishId: useAuthStore.getState().user?.parishId || 'gia-ton',
        ...data,
        categoryName: data.categoryName || data.category,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      set(s => ({ events: [...s.events, temp] }))
      saveLocalFallback(get().events)
      return temp
    }
  },

  updateEvent: async (id, data) => {
    const prev = get().events.find(e => e.id === id)
    try {
      const updated = await api.updateParishEvent(id, data as any)
      set(s => ({ events: s.events.map(e => e.id === id ? updated : e) }))
      saveLocalFallback(get().events)
      return updated
    } catch {
      // Offline: update locally
      if (!prev) return null
      const updated = { ...prev, ...data, updatedAt: new Date().toISOString() } as ParishEvent
      set(s => ({ events: s.events.map(e => e.id === id ? updated : e) }))
      saveLocalFallback(get().events)
      return updated
    }
  },

  deleteEvent: async (id) => {
    set(s => ({ events: s.events.filter(e => e.id !== id) }))
    saveLocalFallback(get().events)
    try {
      await api.deleteParishEvent(id)
      return true
    } catch {
      // Already removed locally; will sync on next fetch
      return true
    }
  },

  getEventsByDate: (date) => get().events.filter(e => e.date === date),
}))
