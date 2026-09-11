export type ParishVisibility = 'STAFF' | 'ADMIN'
export type ParishPersonStatus = 'ACTIVE' | 'FORMER' | 'DECEASED'
export type ParishUnitType = 'BOARD' | 'COMMITTEE' | 'BRANCH' | 'CHAPTER' | 'OTHER'
export type ParishOperationsPositionCode = 'PARISH_LEADER' | 'BRANCH_LEADER' | 'COMMITTEE_LEADER'
export type ParishRecordType = 'MILESTONE' | 'ACTIVITY' | 'ACHIEVEMENT'
export type ParishRecordStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type ParishAssetType = 'IMAGE' | 'VIDEO' | 'POSTER' | 'DOCUMENT' | 'MINUTES' | 'CERTIFICATE' | 'OTHER'

export interface ParishProfile {
  parishId: string
  displayName: string
  patronName: string | null
  foundedDate: string | null
  motto: string | null
  description: string | null
  updatedBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface ParishPerson {
  id: string
  parishId: string
  linkedUserId: string | null
  holyName: string | null
  fullName: string
  birthYear: number | null
  biography: string | null
  serviceStatus: ParishPersonStatus
  visibility: ParishVisibility
  createdAt: string
  updatedAt: string
}

export interface ParishOrganizationUnit {
  managedByAcademic?: boolean
  sourceClassId?: string | null
  academicYearId?: string | null
  chapterLeaderName?: string | null
  id: string
  parishId: string
  parentId: string | null
  name: string
  unitType: ParishUnitType
  description: string | null
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ParishServiceTerm {
  id: string
  parishId: string
  personId: string
  unitId: string | null
  positionTitle: string
  positionCode: ParishOperationsPositionCode | null
  rankTitle: string | null
  startDate: string
  endDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface ParishRecord {
  id: string
  parishId: string
  recordType: ParishRecordType
  title: string
  summary: string | null
  content: string | null
  occurredOn: string
  endedOn: string | null
  location: string | null
  status: ParishRecordStatus
  visibility: ParishVisibility
  showOnTimeline: boolean
  sourceEventId: string | null
  personIds: string[]
  assetIds: string[]
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ParishArchiveAsset {
  id: string
  parishId: string
  assetType: ParishAssetType
  title: string
  description: string | null
  capturedOn: string | null
  storageType: 'UPLOAD' | 'EXTERNAL'
  externalUrl: string | null
  originalFilename: string | null
  mimeType: string | null
  sizeBytes: number | null
  visibility: ParishVisibility
  createdAt: string
  updatedAt: string
}

export interface ParishTimelineItem {
  id: string
  kind: 'FOUNDING' | 'RECORD' | 'TERM_START' | 'TERM_END'
  date: string
  endDate: string | null
  title: string
  summary: string | null
  recordType: ParishRecordType | null
}

export interface ParishAccountOption {
  id: string
  fullName: string
  holyName: string | null
  role: 'admin' | 'chunhiem' | 'phuta'
  status: string
}

export interface ParishProfileSnapshot {
  profile: ParishProfile
  people: ParishPerson[]
  units: ParishOrganizationUnit[]
  terms: ParishServiceTerm[]
  records: ParishRecord[]
  assets: ParishArchiveAsset[]
  timeline: ParishTimelineItem[]
  accounts: ParishAccountOption[]
  permissions: { canManage: boolean; canUpload: boolean }
}

export type ParishProfileInput = Pick<ParishProfile, 'displayName' | 'patronName' | 'foundedDate' | 'motto' | 'description'>
export type ParishPersonInput = Pick<ParishPerson, 'linkedUserId' | 'holyName' | 'fullName' | 'birthYear' | 'biography' | 'serviceStatus' | 'visibility'>
export type ParishUnitInput = Pick<ParishOrganizationUnit, 'parentId' | 'name' | 'unitType' | 'description' | 'sortOrder' | 'isActive'>
export type ParishTermInput = Pick<ParishServiceTerm, 'personId' | 'unitId' | 'positionTitle' | 'positionCode' | 'rankTitle' | 'startDate' | 'endDate' | 'notes'>
export type ParishAuthorityConfirmation = { adminPassword: string; authorityReason: string }
export type ParishTermMutationInput = ParishTermInput & ParishAuthorityConfirmation
export type ParishRecordInput = Pick<ParishRecord, 'recordType' | 'title' | 'summary' | 'content' | 'occurredOn' | 'endedOn' | 'location' | 'status' | 'visibility' | 'showOnTimeline' | 'sourceEventId' | 'personIds' | 'assetIds'>
export type ParishAssetInput = Pick<ParishArchiveAsset, 'assetType' | 'title' | 'description' | 'capturedOn' | 'visibility'> & { recordIds: string[] }
export type ParishExternalAssetInput = ParishAssetInput & { externalUrl: string }

export interface ParishUploadAssetInput extends ParishAssetInput {
  file: File
}
