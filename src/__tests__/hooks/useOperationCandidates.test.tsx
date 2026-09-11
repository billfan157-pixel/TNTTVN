import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { operationsApi } from '../../lib/api/operations'
import { setTenantScope } from '../../lib/tenantScope'
import { parseOperationCandidateValue, useOperationCandidates } from '../../hooks/useOperationCandidates'

vi.mock('../../lib/api/operations', () => ({ operationsApi: { getCandidates: vi.fn() } }))

const page = (parishId = 'P1') => ({
  success: true as const,
  error: null,
  data: [{ parishId, personId: 'PERSON-1', userId: 'USER-1', displayName: 'Thành viên', eligibility: 'ACTIONABLE' as const, inResourceScope: true }],
  meta: { page: 1, limit: 500, total: 1, totalPages: 1 },
})

describe('useOperationCandidates', () => {
  beforeEach(() => { vi.resetAllMocks(); setTenantScope({ parishId: 'P1', userId: 'MANAGER-1' }) })
  afterEach(() => setTenantScope(null))

  it('loads the minimal directory for exactly the selected resource', async () => {
    vi.mocked(operationsApi.getCandidates).mockResolvedValue(page())
    const { result } = renderHook(() => useOperationCandidates({ taskId: 'TASK-1' }, true))
    await waitFor(() => expect(result.current.candidates).toHaveLength(1))
    expect(operationsApi.getCandidates).toHaveBeenCalledWith({ taskId: 'TASK-1' })
    expect(parseOperationCandidateValue('person:PERSON-1')).toEqual({ personId: 'PERSON-1' })
    expect(parseOperationCandidateValue('user:USER-1')).toEqual({ userId: 'USER-1' })
  })

  it('fails closed when the response belongs to another parish', async () => {
    vi.mocked(operationsApi.getCandidates).mockResolvedValue(page('P2'))
    const { result } = renderHook(() => useOperationCandidates({ eventId: 'EVENT-1' }, true))
    await waitFor(() => expect(result.current.error).toMatch(/sai phạm vi giáo xứ/i))
    expect(result.current.candidates).toEqual([])
  })

  it('discards a late response after the signed-in account changes', async () => {
    let resolve!: (value: ReturnType<typeof page>) => void
    vi.mocked(operationsApi.getCandidates).mockReturnValue(new Promise(done => { resolve = done }))
    const { result } = renderHook(() => useOperationCandidates({ workstreamId: 'WS-1' }, true))
    setTenantScope({ parishId: 'P1', userId: 'MANAGER-2' })
    resolve(page())
    await Promise.resolve()
    expect(result.current.candidates).toEqual([])
  })
})
