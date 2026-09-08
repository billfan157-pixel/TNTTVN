export type ParishProfileRole = 'admin' | 'chunhiem' | 'phuta'
export type ParishVisibility = 'STAFF' | 'ADMIN'
export type ParishPersonStatus = 'ACTIVE' | 'FORMER' | 'DECEASED'
export type ParishUnitType = 'BOARD' | 'COMMITTEE' | 'BRANCH' | 'CHAPTER' | 'OTHER'
export type ParishOperationsPositionCode = 'PARISH_LEADER' | 'BRANCH_LEADER' | 'COMMITTEE_LEADER'
export type ParishRecordType = 'MILESTONE' | 'ACTIVITY' | 'ACHIEVEMENT'
export type ParishRecordStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type ParishAssetType = 'IMAGE' | 'VIDEO' | 'POSTER' | 'DOCUMENT' | 'MINUTES' | 'CERTIFICATE' | 'OTHER'

export interface ParishProfileInput {
  displayName: string
  patronName?: string | null
  foundedDate?: string | null
  motto?: string | null
  description?: string | null
}

export interface ParishPersonInput {
  linkedUserId?: string | null
  holyName?: string | null
  fullName: string
  birthYear?: number | null
  biography?: string | null
  serviceStatus: ParishPersonStatus
  visibility: ParishVisibility
}

export interface ParishUnitInput {
  parentId?: string | null
  name: string
  unitType: ParishUnitType
  description?: string | null
  sortOrder: number
  isActive: boolean
}

export interface ParishTermInput {
  personId: string
  unitId?: string | null
  positionTitle: string
  positionCode?: ParishOperationsPositionCode | null
  rankTitle?: string | null
  startDate: string
  endDate?: string | null
  notes?: string | null
}

export interface ParishRecordInput {
  recordType: ParishRecordType
  title: string
  summary?: string | null
  content?: string | null
  occurredOn: string
  endedOn?: string | null
  location?: string | null
  status: ParishRecordStatus
  visibility: ParishVisibility
  showOnTimeline: boolean
  sourceEventId?: string | null
  personIds?: string[]
  assetIds?: string[]
}

export interface ParishAssetInput {
  assetType: ParishAssetType
  title: string
  description?: string | null
  capturedOn?: string | null
  visibility: ParishVisibility
  recordIds?: string[]
}

export interface ParishExternalAssetInput extends ParishAssetInput {
  externalUrl: string
}

export interface ParishUploadedAssetInput extends ParishAssetInput {
  objectKey: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
}

export interface MutationContext {
  userId: string
  parishId: string
  ip: string
  userAgent: string
}
