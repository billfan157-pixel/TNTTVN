import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/react', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('../lib/api', () => ({
  api: new Proxy({}, { get: (_t, _prop) => vi.fn() }),
  isAuthenticated: vi.fn(() => false),
  ApiError: class ApiError extends Error {
    status: number
    path: string
    constructor(status: number, message: string, path: string) {
      super(message)
      this.status = status
      this.path = path
    }
  },
}))
vi.mock('../lib/syncLease', () => ({ acquireSyncLease: vi.fn(() => true), releaseSyncLease: vi.fn() }))

import { revertFailedExamCompleteOp } from '../hooks/useSyncEngine'
import { useExamStore } from '../stores/examStore'
import type { SyncQueueItem } from '../lib/db'
import type { ExamSession } from '../types'

function mkSession(id: string, status: ExamSession['status']): ExamSession {
  return {
    id,
    parishId: 'gia-ton',
    classId: 'CL-1',
    subject: 'Kiểm tra',
    scoreType: '15m',
    maxScore: 10,
    semester: 1,
    academicYear: '2026-2027',
    status,
    createdBy: 'usr-1',
    createdAt: new Date().toISOString(),
  }
}

function mkOp(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: 'op-1',
    entity: 'exam',
    entityId: 'EXS-opt',
    operation: 'UPDATE',
    payload: JSON.stringify({ action: 'complete', sessionId: 'EXS-opt' }),
    status: 'failed',
    retryCount: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: 'usr-1',
    deviceId: 'dev-1',
    ...overrides,
  } as SyncQueueItem
}

describe('FE-F1 — revertFailedExamCompleteOp', () => {
  it('revert phiên optimistic completed khi op complete fail vĩnh viễn', async () => {
    useExamStore.setState({ sessions: [mkSession('EXS-opt', 'completed')] })

    await revertFailedExamCompleteOp(mkOp())

    expect(useExamStore.getState().sessions[0].status).toBe('draft')
  })

  it('sessionId ưu tiên từ payload (queue legacy có entityId khác)', async () => {
    useExamStore.setState({ sessions: [mkSession('EXS-real', 'completed')] })

    await revertFailedExamCompleteOp(mkOp({
      entityId: 'EXS-tmp-old',
      payload: JSON.stringify({ action: 'complete', sessionId: 'EXS-real' }),
    }))

    expect(useExamStore.getState().sessions[0].status).toBe('draft')
  })

  it('bỏ qua op không phải exam complete (save_results / CREATE / entity khác)', async () => {
    useExamStore.setState({ sessions: [mkSession('EXS-keep', 'completed')] })

    await revertFailedExamCompleteOp(mkOp({
      entityId: 'EXS-keep',
      payload: JSON.stringify({ action: 'save_results', sessionId: 'EXS-keep' }),
    }))
    expect(useExamStore.getState().sessions[0].status).toBe('completed')

    await revertFailedExamCompleteOp(mkOp({ operation: 'CREATE' }))
    expect(useExamStore.getState().sessions[0].status).toBe('completed')

    await revertFailedExamCompleteOp(mkOp({ entity: 'student' }))
    expect(useExamStore.getState().sessions[0].status).toBe('completed')
  })
})
