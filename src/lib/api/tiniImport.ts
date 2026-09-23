import { httpFetch } from './core'

export type TiniClassification = 'new' | 'identical' | 'conflict' | 'unmapped' | 'unsupported' | 'locked' | 'invalid' | 'stale'

export interface TiniImportObservation {
  externalStudentId: string
  studentName: string
  dateOfBirth?: string | null
  externalClassId: string | null
  className: string
  date: string
  sourceTitle: string
  sourceFingerprint: string
  late: boolean
}

export interface TiniPreviewItem {
  index: number
  observationHash: string
  observation: TiniImportObservation
  classification: TiniClassification
  targetStudentId: string | null
  expectedVersion: number | null
  normalized: { type: 'SundayMass' | 'CatechismClass'; status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused' } | null
}

export interface TiniStudentProfileDifference {
  field: 'displayName' | 'dateOfBirth' | 'classMembership'
  kind: 'formatting' | 'content' | 'birth_date' | 'membership'
  cateviaValue: string
  tiniValue: string
  recommendation: 'review_name_parts' | 'review_birth_date' | 'use_membership_correction_workflow'
  proposedClassId?: string
}

export interface TiniStudentProfileSuggestion {
  externalStudentId: string
  targetStudentId: string
  targetStudentCode: string
  identityBasis: 'reviewed_external_id_link'
  differences: TiniStudentProfileDifference[]
}

export type TiniIdentityEvidence = 'class_name_exact' | 'class_link_reviewed' | 'name_exact'
  | 'date_of_birth_exact' | 'date_of_birth_missing' | 'name_differs' | 'class_differs'
  | 'name_similar' | 'date_of_birth_differs' | 'class_name_similar'

export interface TiniIdentityCandidate {
  targetId: string
  targetCode: string
  targetName: string
  targetClassId: string
  targetClassName: string
  score: number
  evidence: TiniIdentityEvidence[]
}

export interface TiniIdentityLinkSuggestion {
  entityKind: 'student' | 'class'
  externalScope: string
  externalId: string
  sourceName: string
  sourceDateOfBirth?: string | null
  status: 'high_confidence' | 'review' | 'ambiguous' | 'not_found'
  recommendedTargetId: string | null
  candidates: TiniIdentityCandidate[]
}

export interface TiniPreview {
  runId: string
  previewDigest: string
  partial: boolean
  renderedStudentRows: number
  rowErrors: { rowIndex: number; reason: string }[]
  sourceYear: string
  sourceSchemaVersion: 1 | 2 | 3
  profileComparisonAvailable: boolean
  studentProfileSuggestions: TiniStudentProfileSuggestion[]
  identityLinkSuggestions: TiniIdentityLinkSuggestion[]
  counts: Partial<Record<TiniClassification, number>>
  items: TiniPreviewItem[]
}

export interface TiniLink {
  id: string
  provider: string
  entityKind: 'student' | 'class'
  externalScope: string
  externalId: string
  targetId: string
  version: number
}

export interface TiniCandidates {
  classes: { id: string; code: string; name: string }[]
  students: { id: string; code: string; fullName: string; classId: string }[]
}

const base = '/tini-attendance-import'
export const tiniImportApi = {
  preview: (sourceFile: string) => httpFetch.post<TiniPreview>(`${base}/preview`, { sourceFile }),
  commit: (runId: string, sourceFile: string, selectedIndexes: number[]) =>
    httpFetch.post<{ runId: string; receipts: { index: number; outcome: string; attendanceId?: string; version?: number }[] }>(
      `${base}/commit`, { runId, sourceFile, selectedIndexes }),
  links: () => httpFetch.get<TiniLink[]>(`${base}/links`),
  candidates: (year: string) => httpFetch.get<TiniCandidates>(`${base}/candidates?year=${encodeURIComponent(year)}`),
  saveLink: (command: {
    entityKind: 'student' | 'class'; externalScope: string; externalId: string;
    targetId: string; expectedVersion: number; reason: string; sourceYearLabel?: string
  }) => httpFetch.post<{ id: string; version: number }>(`${base}/links`, command),
  saveSuggestedLinks: (command: {
    runId: string
    sourceFile: string
    selected: { entityKind: 'student' | 'class'; externalId: string; targetId: string }[]
    reason: string
  }) => httpFetch.post<{ runId: string; links: { entityKind: 'student' | 'class'; externalId: string;
    targetId: string; id: string; version: number; outcome: 'created' | 'existing' }[] }>(`${base}/links/bulk`, command),
  retireLink: (id: string, expectedVersion: number, reason: string) =>
    httpFetch.post<{ id: string; version: number }>(`${base}/links/${encodeURIComponent(id)}/retire`, { expectedVersion, reason }),
}
