import { describe, it, expect, beforeAll } from 'vitest'
import { getAttendance, upsertAttendance, upsertAttendanceBatch } from '../../services/attendanceService.js'
import { createStudent } from '../../services/studentService.js'
import { db } from '../../db/index.js'
import { branches, academicYears, classes } from '../../db/schema.js'

describe('Server attendanceService Layer Unit Tests', () => {
  let studentA: string
  let studentB: string

beforeAll(async () => {
     const now = new Date().toISOString()
     await db.insert(branches).values({ id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9, parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
     await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
     await db.insert(classes).values({ id: 'AU1', code: 'AU-01', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYearId: '2025-2026', room: 'Phòng 102', parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()

     const a = await createStudent({ holyName: 'A', fullName: 'A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'AU1' }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
     const b = await createStudent({ holyName: 'B', fullName: 'B', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'AU1' }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
     studentA = a!.id
     studentB = b!.id
   })

it('upsertAttendance saves or updates attendance record', async () => {
     const attendanceData = {
       studentId: studentA,
       date: '2026-07-26',
       type: 'SundayMass' as const,
       status: 'Present' as const,
       note: 'Đi lễ đầy đủ',
     }

     const res = await upsertAttendance(attendanceData, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
     expect(res).not.toBeNull()
     expect(res?.status).toBe('Present')
   })

   it('getAttendance retrieves attendance records for parish', async () => {
     const records = await getAttendance('gia-ton')
     expect(Array.isArray(records)).toBe(true)
     expect(records.length).toBeGreaterThan(0)
   })

   it('upsertAttendanceBatch processes batch attendance records', async () => {
     const records = [
       { studentId: studentA, status: 'Present' as const },
       { studentId: studentB, status: 'AbsentExcused' as const, note: 'Về quê' },
     ]

     const ok = await upsertAttendanceBatch('2026-07-26', 'CatechismClass', records, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
     expect(ok.ok).toBe(true)
     expect(ok.results).toHaveLength(2)
   })

   it('throws VersionConflictError when concurrent update occurs with mismatched version (Fix F12)', async () => {
     const date = '2026-07-27'
     const initial = await upsertAttendance({
       studentId: studentA,
       date,
       type: 'SundayMass',
       status: 'Present',
       note: 'Lễ sáng',
     }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

     expect(initial.version).toBe(1)

     // Concurrent update 1 increments version to 2
     await upsertAttendance({
       studentId: studentA,
       date,
       type: 'SundayMass',
       status: 'AbsentExcused',
       note: 'Nghỉ có phép',
       version: 1,
     }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

     // Concurrent update 2 sending stale version 1 must throw VersionConflictError
     const { VersionConflictError } = await import('../../services/gradeService.js')
     await expect(
       upsertAttendance({
         studentId: studentA,
         date,
         type: 'SundayMass',
         status: 'AbsentUnexcused',
         note: 'Nghỉ không phép',
         version: 1,
       }, 'USR-002', 'gia-ton', '127.0.0.1', 'Vitest')
     ).rejects.toThrow(VersionConflictError)
   })
})
