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
  fetchSnapshot: () => Promise<void>
  saveProfile: (data: ParishProfileInput) => Promise<boolean>
  createPerson: (data: ParishPersonInput) => Promise<boolean>
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
  updateAsset: (id: string, data: ParishAssetInput) => Promise<boolean>
  deleteAsset: (id: string) => Promise<boolean>
  clear: () => void
}

export const useParishProfileStore = create<ParishProfileState>((set) => {
  const load = async (showLoading: boolean) => {
    if (showLoading) set({ isLoading: true, error: null })
    try {
      const snapshot = await api.parishProfile.getSnapshot()
      set({ snapshot, isLoading: false, error: null })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể tải Hồ sơ Xứ đoàn'
      set({ isLoading: false, error: message })
      return false
    }
  }

  const mutate = async (action: () => Promise<unknown>) => {
    set({ isSaving: true, error: null })
    try {
      await action()
      const refreshed = await load(false)
      set({ isSaving: false })
      return refreshed
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
    fetchSnapshot: () => load(true).then(() => undefined),
    saveProfile: data => mutate(() => api.parishProfile.updateProfile(data)),
    createPerson: data => mutate(() => api.parishProfile.createPerson(data)),
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
    updateAsset: (id, data) => mutate(() => api.parishProfile.updateAsset(id, data)),
    deleteAsset: id => mutate(() => api.parishProfile.deleteAsset(id)),
    clear: () => set({ snapshot: null, isLoading: false, isSaving: false, error: null }),
  }
})
