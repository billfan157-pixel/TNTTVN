import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasUnsettledLocalAttendanceInSelectedScope } from '../lib/tiniImportPreflight'
import { getOwnUnsettledSyncOperations } from '../stores/syncStore'
import { decryptQueueValue } from '../lib/offlineCipher'

vi.mock('../stores/syncStore', () => ({ getOwnUnsettledSyncOperations: vi.fn() }))
vi.mock('../lib/offlineCipher', () => ({ decryptQueueValue: vi.fn() }))

const item = {
  index: 3,
  observation: { date: '2026-09-20' },
  normalized: { type: 'SundayMass', status: 'Present' },
} as any

describe('TINI local queue preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getOwnUnsettledSyncOperations).mockResolvedValue([])
  })

  it('blocks an unsettled Attendance operation in the selected date/session scope', async () => {
    vi.mocked(getOwnUnsettledSyncOperations).mockResolvedValue([{ entity: 'attendance', payload: 'encrypted' }] as any)
    vi.mocked(decryptQueueValue).mockResolvedValue(JSON.stringify({
      studentId: 'OTHER-STUDENT', date: '2026-09-20', type: 'SundayMass', status: 'Present',
    }))
    await expect(hasUnsettledLocalAttendanceInSelectedScope([item], new Set([3]))).resolves.toBe(true)
  })

  it('allows unrelated dates and fails closed when an Attendance payload cannot be read', async () => {
    vi.mocked(getOwnUnsettledSyncOperations).mockResolvedValue([{ entity: 'attendance', payload: 'encrypted' }] as any)
    vi.mocked(decryptQueueValue).mockResolvedValue(JSON.stringify({ date: '2026-09-21', type: 'SundayMass' }))
    await expect(hasUnsettledLocalAttendanceInSelectedScope([item], new Set([3]))).resolves.toBe(false)
    vi.mocked(decryptQueueValue).mockResolvedValue(null)
    await expect(hasUnsettledLocalAttendanceInSelectedScope([item], new Set([3]))).resolves.toBe(true)
  })
})
