import { describe, expect, it } from 'vitest'
import { canManageParishEvents, selectUpcomingPortalEvents } from '../../utils/parishPortal'

describe('parish portal read model', () => {
  it('limits the dashboard to the next 14 local calendar days and keeps stable ordering', () => {
    const now = new Date(2026, 8, 2, 0, 30)
    const events = [
      { id: 'late', date: '2026-09-15', time: '09:00', title: 'Ngày thứ 14' },
      { id: 'outside', date: '2026-09-16', time: '07:00', title: 'Ngoài cửa sổ' },
      { id: 'past', date: '2026-09-01', time: '07:00', title: 'Đã qua' },
      { id: 'second', date: '2026-09-02', time: '10:00', title: 'Buổi sau' },
      { id: 'first', date: '2026-09-02', time: '08:00', title: 'Buổi trước' },
    ]

    expect(selectUpcomingPortalEvents(events, now, 14, 10).map(event => event.id)).toEqual([
      'first', 'second', 'late',
    ])
  })

  it('keeps event mutation controls aligned with backend RBAC', () => {
    expect(canManageParishEvents('admin')).toBe(true)
    expect(canManageParishEvents('chunhiem')).toBe(true)
    expect(canManageParishEvents('phuta')).toBe(false)
    expect(canManageParishEvents('phuhuynh')).toBe(false)
    expect(canManageParishEvents(null)).toBe(false)
  })
})
