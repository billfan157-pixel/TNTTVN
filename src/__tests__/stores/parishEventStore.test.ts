import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { dexieStorage } from '../../lib/db'
import { setTenantScope } from '../../lib/tenantScope'
import { useParishEventStore, type ParishEvent } from '../../stores/parishEventStore'

const parishA = 'parish-event-a'
const parishB = 'parish-event-b'

function event(id: string, parishId = parishA): ParishEvent {
  return {
    id,
    parishId,
    date: '2026-09-02',
    title: `Sự kiện ${id}`,
    category: 'MEETING',
    categoryName: 'Họp Xứ đoàn',
    time: null,
    location: null,
    createdAt: '2026-09-02T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
  }
}

describe('parishEventStore tenant and acknowledgement boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    setTenantScope({ parishId: parishA, userId: 'user-a' })
    useParishEventStore.getState().clear()
    vi.spyOn(dexieStorage, 'getItem').mockResolvedValue(null)
    vi.spyOn(dexieStorage, 'setItem').mockResolvedValue(undefined)
    vi.spyOn(dexieStorage, 'removeItem').mockResolvedValue(undefined)
  })

  afterEach(() => {
    setTenantScope(null)
  })

  it('rejects a mixed-tenant server response instead of projecting foreign events', async () => {
    vi.spyOn(api, 'getParishEvents').mockResolvedValue([event('A'), event('B', parishB)])

    await useParishEventStore.getState().fetchEvents()

    expect(useParishEventStore.getState().events).toEqual([])
    expect(useParishEventStore.getState().source).toBe('none')
    expect(useParishEventStore.getState().error).toMatch(/không đúng phạm vi giáo xứ/i)
  })

  it('loads only the active tenant from encrypted scoped cache when the server is unavailable', async () => {
    vi.spyOn(api, 'getParishEvents').mockRejectedValue(new Error('Network offline'))
    vi.mocked(dexieStorage.getItem).mockResolvedValue(JSON.stringify([event('A'), event('B', parishB)]))

    await useParishEventStore.getState().fetchEvents()

    expect(useParishEventStore.getState().events.map(item => item.id)).toEqual(['A'])
    expect(useParishEventStore.getState().source).toBe('cache')
    expect(useParishEventStore.getState().error).toBe('Network offline')
  })

  it('does not apply a response after the active tenant changes', async () => {
    let resolveRequest!: (events: ParishEvent[]) => void
    vi.spyOn(api, 'getParishEvents').mockReturnValue(new Promise(resolve => { resolveRequest = resolve }))

    const request = useParishEventStore.getState().fetchEvents()
    setTenantScope({ parishId: parishA, userId: 'user-b' })
    resolveRequest([event('A')])
    await request

    expect(useParishEventStore.getState().events).toEqual([])
  })

  it('keeps local state unchanged when create is not acknowledged by the server', async () => {
    vi.spyOn(api, 'createParishEvent').mockRejectedValue(new Error('Network offline'))

    await expect(useParishEventStore.getState().createEvent({
      date: '2026-09-02',
      title: 'Không được giả thành công',
      category: 'MEETING',
      categoryName: 'Họp Xứ đoàn',
    })).rejects.toThrow('Network offline')

    expect(useParishEventStore.getState().events).toEqual([])
    expect(useParishEventStore.getState().error).toBe('Network offline')
  })

  it('keeps the acknowledged row when update or delete fails', async () => {
    useParishEventStore.setState({ events: [event('A')], source: 'server', error: null })
    vi.spyOn(api, 'updateParishEvent').mockRejectedValue(new Error('Update offline'))
    vi.spyOn(api, 'deleteParishEvent').mockRejectedValue(new Error('Delete offline'))

    await expect(useParishEventStore.getState().updateEvent('A', { title: 'Tên chưa lưu' })).rejects.toThrow('Update offline')
    expect(useParishEventStore.getState().events[0].title).toBe('Sự kiện A')

    await expect(useParishEventStore.getState().deleteEvent('A')).rejects.toThrow('Delete offline')
    expect(useParishEventStore.getState().events.map(item => item.id)).toEqual(['A'])
  })
})
