import { describe, it, expect, beforeAll } from 'vitest'
import { upsertAttendanceBatch, getAttendance } from '../services/attendanceService.js'
import { createStudent } from '../services/studentService.js'
import { db } from '../db/index.js'
import { branches, academicYears, classes } from '../db/schema.js'

describe('Task 2 — Server attendanceService Golden & Benchmark Tests', () => {
  let student1: string
  let student2: string
  let student3: string
  let student4: string
  const validParishId = 'gia-ton'

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9, parishId: validParishId, createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', parishId: validParishId, createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(classes).values({ id: 'AU1', code: 'AU-01', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYearId: '2025-2026', room: 'Phòng 102', parishId: validParishId, createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()

    const s1 = await createStudent({ holyName: 'Anrê', fullName: 'Nguyễn Văn 1', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '0901', address: 'X', branch: 'AuNhi', classId: 'AU1' }, 'USR-001', validParishId, '127.0.0.1', 'Vitest')
    const s2 = await createStudent({ holyName: 'Maria', fullName: 'Trần Thị 2', gender: 'Nữ', dateOfBirth: '2015-02-02', parentName: 'P', parentPhone: '0902', address: 'X', branch: 'AuNhi', classId: 'AU1' }, 'USR-001', validParishId, '127.0.0.1', 'Vitest')
    const s3 = await createStudent({ holyName: 'Giuse', fullName: 'Lê Văn 3', gender: 'Nam', dateOfBirth: '2015-03-03', parentName: 'P', parentPhone: '0903', address: 'X', branch: 'AuNhi', classId: 'AU1' }, 'USR-001', validParishId, '127.0.0.1', 'Vitest')
    const s4 = await createStudent({ holyName: 'Phêrô', fullName: 'Phạm Văn 4', gender: 'Nam', dateOfBirth: '2015-04-04', parentName: 'P', parentPhone: '0904', address: 'X', branch: 'AuNhi', classId: 'AU1' }, 'USR-001', validParishId, '127.0.0.1', 'Vitest')

    student1 = s1!.id
    student2 = s2!.id
    student3 = s3!.id
    student4 = s4!.id
  })

  it('Golden Test: batch of 5 records where 1 studentId does not exist — 4 valid students saved, 1 errored, partial commit preserved', async () => {
    const invalidStudentId = 'ST-NON-EXISTENT-999'
    const records = [
      { studentId: student1, status: 'Present' as const, note: 'Lễ đúng giờ' },
      { studentId: student2, status: 'AbsentExcused' as const, note: 'Bệnh' },
      { studentId: invalidStudentId, status: 'AbsentUnexcused' as const, note: 'Lỗi ID' },
      { studentId: student3, status: 'Present' as const },
      { studentId: student4, status: 'Present' as const },
    ]

    const date = '2026-08-03'
    const res: any = await upsertAttendanceBatch(date, 'CatechismClass', records, 'USR-001', validParishId, '127.0.0.1', 'Vitest')

    expect(res).toBeDefined()
    expect(res.results).toHaveLength(5)

    const validResults = res.results.filter((r: any) => r.status === 'saved')
    const errorResults = res.results.filter((r: any) => r.status === 'error')

    expect(validResults).toHaveLength(4)
    expect(errorResults).toHaveLength(1)
    expect(errorResults[0].studentId).toBe(invalidStudentId)

    // Verify in DB that the 4 valid students have attendance saved
    const dbRows = await getAttendance(validParishId, undefined, date, 'CatechismClass')
    expect(dbRows).toHaveLength(4)
    const savedIds = dbRows.map(r => r.studentId)
    expect(savedIds).toContain(student1)
    expect(savedIds).toContain(student2)
    expect(savedIds).toContain(student3)
    expect(savedIds).toContain(student4)
    expect(savedIds).not.toContain(invalidStudentId)
  })

  it('Benchmark: timing for upsertAttendanceBatch with 50 students', async () => {
    const records: { studentId: string; status: 'Present' | 'AbsentExcused'; note: string }[] = []
    const studentList = [student1, student2, student3, student4]
    for (let i = 0; i < 50; i++) {
      records.push({
        studentId: studentList[i % studentList.length],
        status: i % 2 === 0 ? 'Present' : 'AbsentExcused',
        note: `Bench note ${i}`,
      })
    }

    const start = performance.now()
    await upsertAttendanceBatch('2026-08-04', 'SundayMass', records, 'USR-001', validParishId, '127.0.0.1', 'Vitest')
    const end = performance.now()

    console.log(`[BENCHMARK] upsertAttendanceBatch 50-student time: ${(end - start).toFixed(2)}ms`)
  })
})
