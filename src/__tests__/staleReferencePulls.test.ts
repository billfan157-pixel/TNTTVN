import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import { getDB, initDB } from '../lib/db'
import { setTenantScope } from '../lib/tenantScope'
import { useClassStore } from '../stores/classStore'
import { useNoticeStore } from '../stores/noticeStore'
import { useStudentStore } from '../stores/studentStore'

vi.mock('@sentry/react', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('../router', () => ({ router: {} }))

let finishLocalRead!: (rows: unknown[]) => void
let localReadStarted!: () => void

function pauseQueueRead() {
  const started = new Promise<void>(resolve => { localReadStarted = resolve })
  const result = new Promise<unknown[]>(resolve => { finishLocalRead = resolve })
  vi.spyOn(getDB().syncQueue, 'where').mockReturnValue({
    anyOf: () => ({ toArray: () => { localReadStarted(); return result } }),
  } as never)
  return started
}

describe('reference pulls across an account switch', () => {
  beforeEach(async () => {
    await initDB()
    localStorage.setItem('parish_current_user', 'old-session')
    setTenantScope({ parishId: 'old-parish', userId: 'old-user' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setTenantScope(null)
    localStorage.removeItem('parish_current_user')
  })

  it('does not apply old classes after local pending-change reconciliation yields', async () => {
    vi.spyOn(api, 'getClasses').mockResolvedValue([{ id: 'old-class', parishId: 'old-parish' }] as never)
    const started = pauseQueueRead()
    const pull = useClassStore.getState().fetchClasses()
    await started
    setTenantScope({ parishId: 'new-parish', userId: 'new-user' })
    useClassStore.setState({ classes: [{ id: 'new-class', parishId: 'new-parish' }] as never, loading: false })
    finishLocalRead([])
    await pull
    expect(useClassStore.getState().classes.map(row => row.id)).toEqual(['new-class'])
    expect(useClassStore.getState().loading).toBe(false)
  })

  it('does not apply old notices after local pending-change reconciliation yields', async () => {
    vi.spyOn(api, 'getNotices').mockResolvedValue([{ id: 'old-notice', parishId: 'old-parish' }] as never)
    const started = pauseQueueRead()
    const pull = useNoticeStore.getState().fetchNotices()
    await started
    setTenantScope({ parishId: 'new-parish', userId: 'new-user' })
    useNoticeStore.setState({ notices: [{ id: 'new-notice', parishId: 'new-parish' }] as never, loading: false })
    finishLocalRead([])
    await pull
    expect(useNoticeStore.getState().notices.map(row => row.id)).toEqual(['new-notice'])
    expect(useNoticeStore.getState().loading).toBe(false)
  })

  it('does not merge an old paged student pull into the next account', async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) => ({ id: `old-${String(index).padStart(4, '0')}` }))
    let finishSecondPage!: (result: unknown) => void
    let secondPageStarted!: () => void
    const secondStarted = new Promise<void>(resolve => { secondPageStarted = resolve })
    const secondResult = new Promise<unknown>(resolve => { finishSecondPage = resolve })
    const getStudents = vi.spyOn(api, 'getStudents')
      .mockResolvedValueOnce({ data: firstPage, total: 1_001 } as never)
      .mockImplementationOnce(() => { secondPageStarted(); return secondResult as never })

    const pull = useStudentStore.getState().fetchStudents({ updatedAfter: '2026-09-01T00:00:00Z', throwOnError: true })
    await secondStarted
    setTenantScope({ parishId: 'new-parish', userId: 'new-user' })
    useStudentStore.setState({ students: [{ id: 'new-student' }] as never, isLoading: false })
    finishSecondPage({ data: [{ id: 'old-1000' }], total: 1_001 })

    await expect(pull).rejects.toThrow('Student pull owner changed')
    expect(getStudents).toHaveBeenCalledTimes(2)
    expect(useStudentStore.getState().students.map(row => row.id)).toEqual(['new-student'])
  })
})
