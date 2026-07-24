import { describe, it, expect } from 'vitest'
import { getAttendance, upsertAttendance, upsertAttendanceBatch } from '../../services/attendanceService.js'

describe('Server attendanceService Layer Unit Tests', () => {
  it('upsertAttendance saves or updates attendance record', async () => {
    const attendanceData = {
      studentId: 'ST-001',
      date: '2026-07-26',
      type: 'SundayMass' as const,
      status: 'Present' as const,
      note: 'Đi lễ đầy đủ',
    }

    const res = await upsertAttendance(attendanceData, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(res).not.toBeNull()
    expect(res?.status).toBe('Present')
  })

  it('getAttendance retrieves attendance records for parish', async () => {
    const records = await getAttendance('thanh-gia')
    expect(Array.isArray(records)).toBe(true)
    expect(records.length).toBeGreaterThan(0)
  })

  it('upsertAttendanceBatch processes batch attendance records', async () => {
    const records = [
      { studentId: 'ST-001', status: 'Present' as const },
      { studentId: 'ST-002', status: 'AbsentExcused' as const, note: 'Về quê' },
    ]

    const ok = await upsertAttendanceBatch('2026-07-26', 'CatechismClass', records, 'USR-001', 'thanh-gia', '127.0.0.1', 'Vitest')
    expect(ok).toBe(true)
  })
})
