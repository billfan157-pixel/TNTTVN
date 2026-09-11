import { create } from 'zustand'
import { api } from '../lib/api'
import { getTenantScope, getTenantScopeKey } from '../lib/tenantScope'
import type {
  ParishAssetInput,
  ParishExternalAssetInput,
  ParishPersonInput,
  ParishProfileInput,
  ParishProfileSnapshot,
  ParishRecordInput,
  ParishAuthorityConfirmation,
  ParishTermMutationInput,
  ParishUnitInput,
  ParishUploadAssetInput,
} from '../types/parishProfile'

interface ParishProfileState {
  snapshot: ParishProfileSnapshot | null
  isLoading: boolean
  isSaving: boolean
  error: string | null
  isStale: boolean
  fetchSnapshot: () => Promise<void>
  saveProfile: (data: ParishProfileInput) => Promise<boolean>
  createPerson: (data: ParishPersonInput) => Promise<boolean>
  createPeople: (data: ParishPersonInput[]) => Promise<boolean>
  updatePerson: (id: string, data: ParishPersonInput) => Promise<boolean>
  deletePerson: (id: string) => Promise<boolean>
  createUnit: (data: ParishUnitInput) => Promise<boolean>
  updateUnit: (id: string, data: ParishUnitInput) => Promise<boolean>
  deleteUnit: (id: string) => Promise<boolean>
  createTerm: (data: ParishTermMutationInput) => Promise<boolean>
  updateTerm: (id: string, data: ParishTermMutationInput) => Promise<boolean>
  deleteTerm: (id: string, confirmation: ParishAuthorityConfirmation) => Promise<boolean>
  createRecord: (data: ParishRecordInput) => Promise<boolean>
  updateRecord: (id: string, data: ParishRecordInput) => Promise<boolean>
  deleteRecord: (id: string) => Promise<boolean>
  createExternalAsset: (data: ParishExternalAssetInput) => Promise<boolean>
  uploadAsset: (data: ParishUploadAssetInput) => Promise<boolean>
  uploadAssets: (data: ParishUploadAssetInput[], onProgress?: (current: number, total: number) => void) => Promise<boolean>
  updateAsset: (id: string, data: ParishAssetInput) => Promise<boolean>
  deleteAsset: (id: string) => Promise<boolean>
  clear: () => void
}

export const useParishProfileStore = create<ParishProfileState>((set, get) => {
  let epoch = 0
  let request = 0
  const load = async (showLoading: boolean) => {
    const scope = getTenantScopeKey()
    const parishId = getTenantScope()?.parishId
    const generation = epoch
    const sequence = ++request
    const current = () => generation === epoch && sequence === request && scope === getTenantScopeKey()
    if (!scope) return false
    if (showLoading) set({ isLoading: true, error: null })
    try {
      const snapshot = await api.parishProfile.getSnapshot()
      if (!current()) return false
      if (snapshot.profile.parishId !== parishId || [snapshot.people, snapshot.units, snapshot.terms, snapshot.records, snapshot.assets].some(rows => rows.some(row => row.parishId !== parishId))) {
        throw new Error('Dữ liệu Hồ sơ Xứ đoàn không đúng phạm vi giáo xứ')
      }
      set({ snapshot, isLoading: false, error: null, isStale: false })
      return true
    } catch (error) {
      if (!current()) return false
      const message = error instanceof Error ? error.message : 'Không thể tải Hồ sơ Xứ đoàn'
      set({ isLoading: false, error: message, isStale: get().snapshot !== null })
      return false
    }
  }

  const mutate = async (action: () => Promise<unknown>) => {
    const scope = getTenantScopeKey()
    const generation = epoch
    const current = () => generation === epoch && scope === getTenantScopeKey()
    if (!scope) return false
    set({ isSaving: true, error: null })
    try {
      await action()
      if (!current()) return true
      await load(false)
      if (current()) set({ isSaving: false })
      // The server mutation has committed. A failed refresh makes the visible
      // snapshot stale, but must not be reported as a failed write (which could
      // prompt a duplicate retry).
      return true
    } catch (error) {
      if (!current()) return false
      const message = error instanceof Error ? error.message : 'Không thể lưu thay đổi Hồ sơ Xứ đoàn'
      set({ isSaving: false, error: message })
      return false
    }
  }

  return {
    snapshot: null,
    isLoading: false,
    isSaving: false,
    error: null,
    isStale: false,
    fetchSnapshot: () => load(true).then(() => undefined),
    saveProfile: data => mutate(() => api.parishProfile.updateProfile(data)),
    createPerson: data => mutate(() => api.parishProfile.createPerson(data)),
    createPeople: data => mutate(() => api.parishProfile.createPeople(data)),
    updatePerson: (id, data) => mutate(() => api.parishProfile.updatePerson(id, data)),
    deletePerson: id => mutate(() => api.parishProfile.deletePerson(id)),
    createUnit: data => mutate(() => api.parishProfile.createUnit(data)),
    updateUnit: (id, data) => mutate(() => api.parishProfile.updateUnit(id, data)),
    deleteUnit: id => mutate(() => api.parishProfile.deleteUnit(id)),
    createTerm: data => mutate(() => api.parishProfile.createTerm(data)),
    updateTerm: (id, data) => mutate(() => api.parishProfile.updateTerm(id, data)),
    deleteTerm: (id, confirmation) => mutate(() => api.parishProfile.deleteTerm(id, confirmation)),
    createRecord: data => mutate(() => api.parishProfile.createRecord(data)),
    updateRecord: (id, data) => mutate(() => api.parishProfile.updateRecord(id, data)),
    deleteRecord: id => mutate(() => api.parishProfile.deleteRecord(id)),
    createExternalAsset: data => mutate(() => api.parishProfile.createExternalAsset(data)),
    uploadAsset: data => mutate(() => api.parishProfile.uploadAsset(data)),
    uploadAssets: async (data, onProgress) => {
      const scope = getTenantScopeKey()
      const generation = epoch
      const current = () => generation === epoch && scope === getTenantScopeKey()
      if (!scope || get().isSaving) return false
      set({ isSaving: true, error: null })
      let completed = 0
      try {
        for (const input of data) {
          if (!current()) return false
          await api.parishProfile.uploadAsset(input)
          completed += 1
          if (!current()) return false
          onProgress?.(completed, data.length)
        }
        await load(false)
        return true
      } catch (error) {
        if (!current()) return false
        // Even the first failed request may have committed before its response
        // was lost. Refresh for reconciliation, not as proof of failure.
        await load(false)
        if (current()) set({ error: `Đã xác nhận ${completed}/${data.length} tệp. ${error instanceof Error ? error.message : 'Không thể tải tệp tiếp theo'}. Kiểm tra kho tư liệu trước khi thử lại vì tệp lỗi có thể đã được lưu.` })
        return false
      } finally {
        if (current()) set({ isSaving: false })
      }
    },
    updateAsset: (id, data) => mutate(() => api.parishProfile.updateAsset(id, data)),
    deleteAsset: id => mutate(() => api.parishProfile.deleteAsset(id)),
    clear: () => {
      epoch += 1
      set({ snapshot: null, isLoading: false, isSaving: false, error: null, isStale: false })
    },
  }
})
