import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { useParishProfileStore } from '../../stores/parishProfileStore'
import type { ParishProfileSnapshot, ParishUploadAssetInput } from '../../types/parishProfile'
import { setTenantScope } from '../../lib/tenantScope'

const snapshot: ParishProfileSnapshot = {
  profile: {
    parishId: 'parish-a', displayName: 'Xứ đoàn A', patronName: null, foundedDate: null,
    motto: null, description: null, updatedBy: null, createdAt: null, updatedAt: null,
  },
  people: [], units: [], terms: [], records: [], assets: [], timeline: [], accounts: [],
  permissions: { canManage: true, canUpload: true },
}

describe('parishProfileStore server acknowledgement semantics', () => {
  const uploads = [1, 2].map(id => ({ title: `File ${id}`, file: new File(['test'], `${id}.txt`), assetType: 'DOCUMENT', description: null, capturedOn: null, visibility: 'STAFF', recordIds: [] })) as ParishUploadAssetInput[]
  beforeEach(() => {
    vi.restoreAllMocks()
    useParishProfileStore.getState().clear()
    setTenantScope({ parishId: 'parish-a', userId: 'admin-a' })
  })

  it('discards a response after logout and a return to the same account', async () => {
    let resolve!: (value: ParishProfileSnapshot) => void
    vi.spyOn(api.parishProfile, 'getSnapshot').mockReturnValue(new Promise(done => { resolve = done }))
    const pending = useParishProfileStore.getState().fetchSnapshot()
    useParishProfileStore.getState().clear()
    resolve(snapshot)
    await pending
    expect(useParishProfileStore.getState().snapshot).toBeNull()
  })

  it('rejects a snapshot from another parish', async () => {
    vi.spyOn(api.parishProfile, 'getSnapshot').mockResolvedValue({ ...snapshot, profile: { ...snapshot.profile, parishId: 'foreign' } })
    await useParishProfileStore.getState().fetchSnapshot()
    expect(useParishProfileStore.getState().snapshot).toBeNull()
    expect(useParishProfileStore.getState().error).toContain('phạm vi')
  })

  it('keeps the newer snapshot when requests complete out of order', async () => {
    let resolve!: (value: ParishProfileSnapshot) => void
    const latest = { ...snapshot, profile: { ...snapshot.profile, displayName: 'Tên mới' } }
    vi.spyOn(api.parishProfile, 'getSnapshot')
      .mockReturnValueOnce(new Promise(done => { resolve = done }))
      .mockResolvedValueOnce(latest)
    const older = useParishProfileStore.getState().fetchSnapshot()
    await useParishProfileStore.getState().fetchSnapshot()
    resolve(snapshot)
    await older
    expect(useParishProfileStore.getState().snapshot).toEqual(latest)
  })

  it('does not publish a late error into a cleared session', async () => {
    let reject!: (error: Error) => void
    vi.spyOn(api.parishProfile, 'getSnapshot').mockReturnValue(new Promise((_resolve, fail) => { reject = fail }))
    const pending = useParishProfileStore.getState().fetchSnapshot()
    useParishProfileStore.getState().clear()
    reject(new Error('Previous session'))
    await pending
    expect(useParishProfileStore.getState().error).toBeNull()
  })

  it('does not refresh the next account after a committed mutation from the previous account', async () => {
    let resolve!: (value: unknown) => void
    vi.spyOn(api.parishProfile, 'createPerson').mockReturnValue(new Promise(done => { resolve = done }))
    const refresh = vi.spyOn(api.parishProfile, 'getSnapshot')
    const pending = useParishProfileStore.getState().createPerson({ linkedUserId: null, holyName: null, fullName: 'Test', birthYear: null, biography: null, serviceStatus: 'ACTIVE', visibility: 'STAFF' })
    useParishProfileStore.getState().clear()
    setTenantScope({ parishId: 'parish-b', userId: 'admin-b' })
    resolve({})
    expect(await pending).toBe(true)
    expect(refresh).not.toHaveBeenCalled()
    expect(useParishProfileStore.getState().snapshot).toBeNull()
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

  it('refreshes committed files and reports partial upload failure', async () => {
    vi.spyOn(api.parishProfile, 'uploadAsset').mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Offline'))
    const refresh = vi.spyOn(api.parishProfile, 'getSnapshot').mockResolvedValue(snapshot)
    const progress = vi.fn()
    expect(await useParishProfileStore.getState().uploadAssets(uploads, progress)).toBe(false)
    expect(progress).toHaveBeenCalledExactlyOnceWith(1, 2)
    expect(refresh).toHaveBeenCalledOnce()
    expect(useParishProfileStore.getState().error).toContain('1/2')
    expect(useParishProfileStore.getState().isSaving).toBe(false)
  })

  it('stops the remaining batch when the session resets during upload', async () => {
    const upload = vi.spyOn(api.parishProfile, 'uploadAsset').mockImplementation(async () => {
      useParishProfileStore.getState().clear()
      setTenantScope({ parishId: 'parish-b', userId: 'other' })
      return {}
    })
    const progress = vi.fn()
    expect(await useParishProfileStore.getState().uploadAssets(uploads, progress)).toBe(false)
    expect(upload).toHaveBeenCalledOnce()
    expect(progress).not.toHaveBeenCalled()
  })

  it('reconciles even when the first upload loses its response', async () => {
    vi.spyOn(api.parishProfile, 'uploadAsset').mockRejectedValue(new Error('Network timeout'))
    const refresh = vi.spyOn(api.parishProfile, 'getSnapshot').mockResolvedValue(snapshot)
    expect(await useParishProfileStore.getState().uploadAssets(uploads)).toBe(false)
    expect(refresh).toHaveBeenCalledOnce()
    expect(useParishProfileStore.getState().error).toContain('có thể đã được lưu')
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
