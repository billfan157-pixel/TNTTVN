import { create } from 'zustand'
import { api } from '../lib/api'
import { dexieStorage } from '../lib/db'
import { getTenantScope } from '../lib/tenantScope'

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

export interface ParishEventMutationInput {
  date: string
  title: string
  category: ParishEvent['category']
  categoryName?: string
  time?: string
  location?: string
}

type ParishEventSource = 'server' | 'cache' | 'none'

interface ParishEventState {
  events: ParishEvent[]
  loading: boolean
  error: string | null
  source: ParishEventSource
  fetchEvents: (params?: { from?: string; to?: string }) => Promise<void>
  createEvent: (data: ParishEventMutationInput) => Promise<ParishEvent>
  updateEvent: (id: string, data: Partial<Pick<ParishEvent, 'date' | 'title' | 'category' | 'categoryName' | 'time' | 'location'>>) => Promise<ParishEvent>
  deleteEvent: (id: string) => Promise<boolean>
  getEventsByDate: (date: string) => ParishEvent[]
  clear: () => void
}

const CACHE_KEY = 'parish_calendar_events_v2'
const LEGACY_STORAGE_KEY = 'parish_calendar_events_v1'
let fetchSequence = 0

function activeParishId(): string | null {
  return getTenantScope()?.parishId ?? null
}

function activeScopeId(): string | null {
  const scope = getTenantScope()
  return scope ? `${scope.parishId}:${scope.userId}` : null
}

function tenantEvents(value: unknown, parishId: string): ParishEvent[] {
  if (!Array.isArray(value)) return []
  return value.filter((event): event is ParishEvent => (
    Boolean(event)
    && typeof event === 'object'
    && (event as ParishEvent).parishId === parishId
    && typeof (event as ParishEvent).id === 'string'
    && typeof (event as ParishEvent).date === 'string'
  ))
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

async function saveCache(events: ParishEvent[], parishId: string, scopeId: string): Promise<void> {
  if (activeScopeId() !== scopeId) return
  await dexieStorage.setItem(CACHE_KEY, JSON.stringify(tenantEvents(events, parishId)))
}

async function loadCache(parishId: string, scopeId: string): Promise<ParishEvent[]> {
  const cached = await dexieStorage.getItem(CACHE_KEY)
  if (cached) {
    try {
      return tenantEvents(JSON.parse(cached), parishId)
    } catch {
      await dexieStorage.removeItem(CACHE_KEY)
    }
  }

  // One-time safe migration: never adopt legacy rows without an exact parishId.
  // The old global key is removed because retaining mixed-tenant data in plaintext
  // would preserve the original isolation flaw.
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    if (!legacy) return []
    const migrated = tenantEvents(JSON.parse(legacy), parishId)
    if (migrated.length > 0 && activeScopeId() === scopeId) {
      await saveCache(migrated, parishId, scopeId)
    }
    return migrated
  } catch {
    try { localStorage.removeItem(LEGACY_STORAGE_KEY) } catch {}
    return []
  }
}

function requireActiveScope(): { parishId: string; scopeId: string } {
  const parishId = activeParishId()
  const scopeId = activeScopeId()
  if (!parishId || !scopeId) throw new Error('Phiên giáo xứ chưa sẵn sàng. Vui lòng đăng nhập lại.')
  return { parishId, scopeId }
}

export const useParishEventStore = create<ParishEventState>((set, get) => ({
  events: [],
  loading: false,
  error: null,
  source: 'none',

  fetchEvents: async (params) => {
    const parishId = activeParishId()
    const scopeId = activeScopeId()
    const requestId = ++fetchSequence
    if (!parishId || !scopeId) {
      set({ events: [], loading: false, error: null, source: 'none' })
      return
    }

    set({ loading: true, error: null })
    try {
      const data = await api.getParishEvents(params)
      if (requestId !== fetchSequence || activeScopeId() !== scopeId) return
      const events = tenantEvents(data, parishId)
      if (events.length !== data.length) {
        throw new Error('Máy chủ trả dữ liệu lịch không đúng phạm vi giáo xứ')
      }
      set({ events, loading: false, error: null, source: 'server' })
      await saveCache(events, parishId, scopeId).catch(() => undefined)
    } catch (error) {
      if (requestId !== fetchSequence || activeScopeId() !== scopeId) return
      const cached = await loadCache(parishId, scopeId)
      if (requestId !== fetchSequence || activeScopeId() !== scopeId) return
      set({
        events: cached,
        loading: false,
        error: errorMessage(error, 'Không tải được lịch Xứ đoàn'),
        source: cached.length > 0 ? 'cache' : 'none',
      })
    }
  },

  createEvent: async (data) => {
    const { parishId, scopeId } = requireActiveScope()
    try {
      const created = await api.createParishEvent(data)
      if (activeScopeId() !== scopeId || created.parishId !== parishId) {
        throw new Error('Không thể xác nhận sự kiện trong giáo xứ hiện tại')
      }
      const events = [...get().events.filter(event => event.parishId === parishId), created]
      set({ events, error: null, source: 'server' })
      await saveCache(events, parishId, scopeId).catch(() => undefined)
      return created
    } catch (error) {
      const message = errorMessage(error, 'Không thể lưu sự kiện khi chưa kết nối máy chủ')
      if (activeScopeId() === scopeId) set({ error: message })
      throw error instanceof Error ? error : new Error(message)
    }
  },

  updateEvent: async (id, data) => {
    const { parishId, scopeId } = requireActiveScope()
    const existing = get().events.find(event => event.id === id && event.parishId === parishId)
    if (!existing) throw new Error('Không tìm thấy sự kiện trong giáo xứ hiện tại')
    try {
      const updated = await api.updateParishEvent(id, data)
      if (activeScopeId() !== scopeId || updated.parishId !== parishId) {
        throw new Error('Không thể xác nhận sự kiện trong giáo xứ hiện tại')
      }
      const events = get().events.map(event => event.id === id && event.parishId === parishId ? updated : event)
      set({ events, error: null, source: 'server' })
      await saveCache(events, parishId, scopeId).catch(() => undefined)
      return updated
    } catch (error) {
      const message = errorMessage(error, 'Không thể cập nhật sự kiện khi chưa kết nối máy chủ')
      if (activeScopeId() === scopeId) set({ error: message })
      throw error instanceof Error ? error : new Error(message)
    }
  },

  deleteEvent: async (id) => {
    const { parishId, scopeId } = requireActiveScope()
    const existing = get().events.find(event => event.id === id && event.parishId === parishId)
    if (!existing) throw new Error('Không tìm thấy sự kiện trong giáo xứ hiện tại')
    try {
      await api.deleteParishEvent(id)
      if (activeScopeId() !== scopeId) throw new Error('Phiên giáo xứ đã thay đổi')
      const events = get().events.filter(event => !(event.id === id && event.parishId === parishId))
      set({ events, error: null, source: 'server' })
      await saveCache(events, parishId, scopeId).catch(() => undefined)
      return true
    } catch (error) {
      const message = errorMessage(error, 'Không thể xóa sự kiện khi chưa kết nối máy chủ')
      if (activeScopeId() === scopeId) set({ error: message })
      throw error instanceof Error ? error : new Error(message)
    }
  },

  getEventsByDate: (date) => get().events.filter(event => event.parishId === activeParishId() && event.date === date),
  clear: () => {
    fetchSequence += 1
    set({ events: [], loading: false, error: null, source: 'none' })
  },
}))
