import { create } from 'zustand'
import { api } from '../lib/api'
import type {
  ParishAssetInput,
  ParishExternalAssetInput,
  ParishPersonInput,
  ParishProfileInput,
  ParishProfileSnapshot,
  ParishRecordInput,
  ParishTermInput,
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
  createTerm: (data: ParishTermInput) => Promise<boolean>
  updateTerm: (id: string, data: ParishTermInput) => Promise<boolean>
  deleteTerm: (id: string) => Promise<boolean>
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
  const load = async (showLoading: boolean) => {
    if (showLoading) set({ isLoading: true, error: null })
    try {
      const snapshot = await api.parishProfile.getSnapshot()
      set({ snapshot, isLoading: false, error: null, isStale: false })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể tải Hồ sơ Xứ đoàn'
      set({ isLoading: false, error: message, isStale: get().snapshot !== null })
      return false
    }
  }

  const mutate = async (action: () => Promise<unknown>) => {
    set({ isSaving: true, error: null })
    try {
      await action()
      await load(false)
      set({ isSaving: false })
      // The server mutation has committed. A failed refresh makes the visible
      // snapshot stale, but must not be reported as a failed write (which could
      // prompt a duplicate retry).
      return true
    } catch (error) {
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
    deleteTerm: id => mutate(() => api.parishProfile.deleteTerm(id)),
    createRecord: data => mutate(() => api.parishProfile.createRecord(data)),
    updateRecord: (id, data) => mutate(() => api.parishProfile.updateRecord(id, data)),
    deleteRecord: id => mutate(() => api.parishProfile.deleteRecord(id)),
    createExternalAsset: data => mutate(() => api.parishProfile.createExternalAsset(data)),
    uploadAsset: data => mutate(() => api.parishProfile.uploadAsset(data)),
    uploadAssets: (data, onProgress) => mutate(async () => {
      for (let i = 0; i < data.length; i++) {
        await api.parishProfile.uploadAsset(data[i])
        onProgress?.(i + 1, data.length)
      }
    }),
    updateAsset: (id, data) => mutate(() => api.parishProfile.updateAsset(id, data)),
    deleteAsset: id => mutate(() => api.parishProfile.deleteAsset(id)),
    clear: () => set({ snapshot: null, isLoading: false, isSaving: false, error: null, isStale: false }),
  }
})
