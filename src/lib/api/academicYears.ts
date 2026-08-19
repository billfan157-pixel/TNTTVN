import { httpFetch } from '../api'

export type AcademicYearStatus = 'OPEN' | 'SEMESTER_1_LOCKED' | 'SEMESTER_2_OPEN' | 'SEMESTER_2_LOCKED' | 'FINALIZED' | 'PROMOTED' | 'ARCHIVED'

export interface AcademicYearLifecycleDTO {
  id: string
  startDate: string
  endDate: string
  isLocked: number
  status: AcademicYearStatus
  currentSemester: number
  semesterLocks: { semester1Locked: boolean; semester2Locked: boolean }
  classCount: number
  studentCount: number
  snapshotCount: number
  createdAt: string
  updatedAt: string
}

export interface CompletenessIssue {
  code: string
  severity: 'error' | 'warning'
  label: string
  items: string[]
}

export interface CompletenessChecklist {
  yearId: string
  status: AcademicYearStatus
  ready: boolean
  totals: { classes: number; students: number; gradeRows: number; openSessions: number }
  issues: CompletenessIssue[]
}

export interface FinalizeSummary {
  yearId: string
  status: AcademicYearStatus
  snapshotCount: number
  finalizedAt: string
}

export interface PromoteSummary {
  yearId: string
  nextYearId: string
  status: AcademicYearStatus
  total: number
  movedToNextYear: number
  retained: number
  graduated: number
  errors: { studentId: string; reason: string }[]
}

export interface CopyYearResult {
  year: { id: string; startDate: string; endDate: string }
  copiedClasses: number
  copiedAssessments: number
}

/**
 * Client cho /api/academic-years — vòng đời năm học (wizard):
 * checklist → khóa HK → finalize (snapshot) → promote → copy năm mới.
 */
export const academicYearsApiClient = {
  async listAcademicYears(): Promise<AcademicYearLifecycleDTO[]> {
    return httpFetch.get<AcademicYearLifecycleDTO[]>('/academic-years')
  },

  async getCompletenessChecklist(yearId: string): Promise<CompletenessChecklist> {
    return httpFetch.get<CompletenessChecklist>(`/academic-years/${encodeURIComponent(yearId)}/completeness`)
  },

  async startSemester2(yearId: string): Promise<{ yearId: string; currentSemester: number }> {
    return httpFetch.post<{ yearId: string; currentSemester: number }>(`/academic-years/${encodeURIComponent(yearId)}/start-semester-2`)
  },

  async finalizeYear(yearId: string): Promise<FinalizeSummary> {
    return httpFetch.post<FinalizeSummary>(`/academic-years/${encodeURIComponent(yearId)}/finalize`)
  },

  async copyAcademicYear(yearId: string, newYearId: string): Promise<CopyYearResult> {
    return httpFetch.post<CopyYearResult>(`/academic-years/${encodeURIComponent(yearId)}/copy`, { newYearId })
  },

  async promoteYear(yearId: string, nextYearId: string): Promise<PromoteSummary> {
    return httpFetch.post<PromoteSummary>(`/academic-years/${encodeURIComponent(yearId)}/promote`, { nextYearId })
  },

  async archiveYear(yearId: string): Promise<{ yearId: string; status: AcademicYearStatus; archivedAt: string }> {
    return httpFetch.post<{ yearId: string; status: AcademicYearStatus; archivedAt: string }>(`/academic-years/${encodeURIComponent(yearId)}/archive`)
  },
}
