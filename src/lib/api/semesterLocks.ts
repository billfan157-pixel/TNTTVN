import { httpFetch } from './core'

export interface SemesterLockDTO {
  id: string
  academicYear: string
  semester: number
  isLocked: number | boolean
  lockedBy?: string | null
  lockedAt?: string | null
  unlockReason?: string | null
  createdAt: string
  updatedAt: string
}

export interface SetSemesterLockPayload {
  academicYear: string
  semester: number
  isLocked: boolean
  unlockReason?: string
}

/**
 * F2 (audit): Client cho /api/semester-locks — khóa/mở khóa sổ điểm HK1/HK2.
 * Trước đây semester_locks chỉ được ghi từ test; không có đường push nào từ UI,
 * nên "khóa sổ điểm" (điều kiện tiên quyết của xét thăng tiến + chống sửa điểm
 * sau khóa) không bao giờ kích hoạt được trong thực tế.
 */
export const semesterLocksApiClient = {
  async getSemesterLocks(academicYear?: string): Promise<SemesterLockDTO[]> {
    const query = academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : ''
    return httpFetch.get<SemesterLockDTO[]>(`/semester-locks${query}`)
  },

  async setSemesterLock(payload: SetSemesterLockPayload): Promise<{ academicYear: string; semester: number; isLocked: boolean }> {
    return httpFetch.post<{ academicYear: string; semester: number; isLocked: boolean }>('/semester-locks', payload)
  },
}
