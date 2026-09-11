import { request } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const parishProfileApi = {
    getSnapshot: () => request<import('../../types/parishProfile').ParishProfileSnapshot>('POST', '/parish-profile/organization/refresh'),
    updateProfile: (data: import('../../types/parishProfile').ParishProfileInput) => request('PUT', '/parish-profile/profile', data),
    createPerson: (data: import('../../types/parishProfile').ParishPersonInput) => request('POST', '/parish-profile/people', data),
    createPeople: (people: import('../../types/parishProfile').ParishPersonInput[]) => request<{ people: import('../../types/parishProfile').ParishPerson[] }>('POST', '/parish-profile/people/import', { people }),
    updatePerson: (id: string, data: import('../../types/parishProfile').ParishPersonInput) => request('PUT', `/parish-profile/people/${encodeURIComponent(id)}`, data),
    deletePerson: (id: string) => request('DELETE', `/parish-profile/people/${encodeURIComponent(id)}`),
    createUnit: (data: import('../../types/parishProfile').ParishUnitInput) => request('POST', '/parish-profile/units', data),
    updateUnit: (id: string, data: import('../../types/parishProfile').ParishUnitInput) => request('PUT', `/parish-profile/units/${encodeURIComponent(id)}`, data),
    deleteUnit: (id: string) => request('DELETE', `/parish-profile/units/${encodeURIComponent(id)}`),
    createTerm: (data: import('../../types/parishProfile').ParishTermMutationInput) => request('POST', '/parish-profile/terms', data),
    updateTerm: (id: string, data: import('../../types/parishProfile').ParishTermMutationInput) => request('PUT', `/parish-profile/terms/${encodeURIComponent(id)}`, data),
    deleteTerm: (id: string, confirmation: import('../../types/parishProfile').ParishAuthorityConfirmation) => request('DELETE', `/parish-profile/terms/${encodeURIComponent(id)}`, confirmation),
    createRecord: (data: import('../../types/parishProfile').ParishRecordInput) => request('POST', '/parish-profile/records', data),
    updateRecord: (id: string, data: import('../../types/parishProfile').ParishRecordInput) => request('PUT', `/parish-profile/records/${encodeURIComponent(id)}`, data),
    deleteRecord: (id: string) => request('DELETE', `/parish-profile/records/${encodeURIComponent(id)}`),
    createExternalAsset: (data: import('../../types/parishProfile').ParishExternalAssetInput) => request('POST', '/parish-profile/assets/external', data),
    uploadAsset: (data: import('../../types/parishProfile').ParishUploadAssetInput) => {
      const form = new FormData()
      form.set('file', data.file)
      form.set('assetType', data.assetType)
      form.set('title', data.title)
      if (data.description) form.set('description', data.description)
      if (data.capturedOn) form.set('capturedOn', data.capturedOn)
      form.set('visibility', data.visibility)
      form.set('recordIds', JSON.stringify(data.recordIds))
      return request('POST', '/parish-profile/assets/upload', form)
    },
    updateAsset: (id: string, data: import('../../types/parishProfile').ParishAssetInput) => request('PUT', `/parish-profile/assets/${encodeURIComponent(id)}`, data),
    deleteAsset: (id: string) => request('DELETE', `/parish-profile/assets/${encodeURIComponent(id)}`),
    downloadAsset: (id: string) => request<Blob>('GET', `/parish-profile/assets/${encodeURIComponent(id)}/download`, undefined, 0, undefined, false, 'blob'),
}
