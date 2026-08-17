import React from 'react'
import { httpFetch } from '../api'
import type { AttendanceType } from '../../types'

export interface MarkAttendancePayload {
  studentId: string
  date: string // YYYY-MM-DD
  type: AttendanceType
  status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'
  note?: string | null
  /** ADR-016 (S21): Version server của bản ghi — báo conflict thay vì last-write-wins. */
  version?: number
}

export interface AttendanceRecordDTO {
  id: string
  studentId: string
  date: string
  type: string
  status: string
  note?: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface BatchAttendanceItemResultDTO {
  studentId: string
  status: 'saved' | 'skipped' | 'conflict' | 'error'
  reason?: string
  record?: AttendanceRecordDTO
}

export interface BatchAttendanceResponseDTO {
  total: number
  successCount: number
  skippedCount: number
  conflictCount: number
  errorCount: number
  results: BatchAttendanceItemResultDTO[]
}

/**
 * Step F1: Pure Attendance API Client
 */
export const attendanceApiClient = {
  async markAttendance(payload: MarkAttendancePayload): Promise<AttendanceRecordDTO> {
    return httpFetch.post<AttendanceRecordDTO>('/attendance', payload)
  },

  async batchMarkAttendance(
    records: Array<{
      studentId: string
      status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused'
      note?: string
      version?: number
    }>,
    date: string,
    type: AttendanceType
  ): Promise<BatchAttendanceResponseDTO> {
    return httpFetch.post<BatchAttendanceResponseDTO>('/attendance/batch', { records, date, type })
  },
}
