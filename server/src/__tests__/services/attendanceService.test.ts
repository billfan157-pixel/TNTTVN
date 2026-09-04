import { describe, it, expect, beforeAll } from 'vitest'
import { getAttendance } from '../../services/attendanceService.js'
import { attendanceApplicationService } from '../../services/AttendanceApplicationService.js'
import { createStudent } from '../../services/studentService.js'
import { db } from '../../db/index.js'
import { branches, academicYears, classes } from '../../db/schema.js'

// Phase 3: file này chỉ giữ test cho `getAttendance` (read). Các writers
// legacy (upsertAttendance/upsertAttendanceBatch) đã xóa cùng tests của chúng
// — đường ghi duy nhất là AttendanceApplicationService (+ batch service),
// đã có coverage ở AttendanceApplicationService.test.ts.
describe('Server attendanceService read Tests', () => {
  let studentA: string
  let _studentB: string

  beforeAll(async () => {
     const now = new Date().toISOString()
     await db.insert(branches).values({ id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9, parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
     await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
     await db.insert(classes).values({ id: 'AU1', code: 'AU-01', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYearId: '2025-2026', room: 'Phòng 102', parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()

     const a = await createStudent({ holyName: 'A', fullName: 'A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'AU1' }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
     const b = await createStudent({ holyName: 'B', fullName: 'B', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'AU1' }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
     studentA = a!.id
     _studentB = b!.id

     // Seed 1 row qua production writer (không phụ thuộc leftovers file khác).
     await attendanceApplicationService.markAttendance({
       studentId: studentA,
       date: '2026-07-26',
       type: 'SundayMass',
       status: 'Present',
       userId: 'USR-001',
       parishId: 'gia-ton',
       allowedClassIds: null,
       ip: '127.0.0.1',
       userAgent: 'Vitest',
     }).catch(() => {})
   })

   it('getAttendance retrieves attendance records for parish', async () => {
     const records = await getAttendance('gia-ton')
     expect(Array.isArray(records)).toBe(true)
     expect(records.length).toBeGreaterThan(0)
   })
})
