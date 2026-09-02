import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import type { ParishProfileSnapshot } from '../../types/parishProfile'

const snapshot: ParishProfileSnapshot = {
  profile: {
    parishId: 'parish-a', displayName: 'Xứ đoàn A', patronName: null, foundedDate: null,
    motto: null, description: null, updatedBy: null, createdAt: null, updatedAt: null,
  },
  people: [], units: [], terms: [], records: [], assets: [], timeline: [], accounts: [],
  permissions: { canManage: true, canUpload: true },
}

describe('parishProfileStore server acknowledgement semantics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useParishProfileStore.getState().clear()
  })

  it('uses one atomic endpoint and one refresh for a personnel batch', async () => {
    vi.spyOn(api.parishProfile, 'createPeople').mockResolvedValue({ people: [] })
    vi.spyOn(api.parishProfile, 'getSnapshot').mockResolvedValue(snapshot)
    const input = [{
      linkedUserId: null, holyName: null, fullName: 'Nguyễn Văn An', birthYear: null,
      biography: null, serviceStatus: 'ACTIVE' as const, visibility: 'STAFF' as const,
    }]

    await expect(useParishProfileStore.getState().createPeople(input)).resolves.toBe(true)
    expect(api.parishProfile.createPeople).toHaveBeenCalledOnce()
    expect(api.parishProfile.getSnapshot).toHaveBeenCalledOnce()
  })

  it('reports a committed mutation as successful while marking a failed refresh stale', async () => {
    useParishProfileStore.setState({ snapshot })
    vi.spyOn(api.parishProfile, 'createPerson').mockResolvedValue({})
    vi.spyOn(api.parishProfile, 'getSnapshot').mockRejectedValue(new Error('Network offline'))

    const ok = await useParishProfileStore.getState().createPerson({
      linkedUserId: null, holyName: null, fullName: 'Trưởng An', birthYear: null,
      biography: null, serviceStatus: 'ACTIVE', visibility: 'STAFF',
    })

    expect(ok).toBe(true)
    expect(useParishProfileStore.getState().isStale).toBe(true)
    expect(useParishProfileStore.getState().error).toBe('Network offline')
  })
})
