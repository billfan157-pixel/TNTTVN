import { describe, it, expect, beforeAll } from 'vitest'
import { getGrades, upsertGrade, undoGradeImport } from '../../services/gradeService.js'
import { createStudent } from '../../services/studentService.js'
import { db } from '../../db/index.js'
import { branches, academicYears, classes, auditLogs } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'

describe('Server undoGradeImport Layer Tests (ADR-028)', () => {
  let studentA: string
  let studentB: string
  let studentC: string
  let studentD: string
  let studentE: string

  const semester = 1
  const academicYear = '2025 - 2026'

  beforeAll(async () => {
    const now = new Date().toISOString()
    await db.insert(branches).values({ id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9, parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.insert(classes).values({ id: 'AU1', code: 'AU-01', name: 'Ấu Nhi 1', branchId: 'AuNhi', academicYearId: '2025-2026', room: 'Phòng 102', parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
    await db.update(classes).set({ parishId: 'gia-ton' }).where(eq(classes.id, 'AU1'))

    const createWithRetry = async (data: any) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await createStudent(data, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
        } catch (err: any) {
          const busy = err?.code === 'SQLITE_BUSY' || err?.cause?.code === 'SQLITE_BUSY'
          if (busy && attempt < 2) {
            await new Promise(r => setTimeout(r, 1000))
            continue
          }
          throw err
        }
      }
    }

    const base = { gender: 'Nam' as const, dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'AU1' }
    const a = await createWithRetry({ holyName: 'UndoA', fullName: 'UndoA', ...base })
    const b = await createWithRetry({ holyName: 'UndoB', fullName: 'UndoB', ...base })
    const c = await createWithRetry({ holyName: 'UndoC', fullName: 'UndoC', ...base })
    const d = await createWithRetry({ holyName: 'UndoD', fullName: 'UndoD', ...base })
    const e = await createWithRetry({ holyName: 'UndoE', fullName: 'UndoE', ...base })
    studentA = a!.id
    studentB = b!.id
    studentC = c!.id
    studentD = d!.id
    studentE = e!.id
  })

  it('restores a grade row to its pre-import state (UPDATE entry)', async () => {
    await upsertGrade({ studentId: studentA, academicYear, semester, scoreOral: 5, scoreFinal: 5 }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    await upsertGrade({ studentId: studentA, academicYear, semester, scoreOral: 9, scoreFinal: 9 }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

    const [res] = await undoGradeImport([{ studentId: studentA }], semester, academicYear, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(res.status).toBe('restored')

    const grades = await getGrades('gia-ton', studentA, semester)
    const row = grades.find(g => g.studentId === studentA)
    expect(row).toBeDefined()
    expect(row.scoreOral).toBe(5)
    expect(row.scoreFinal).toBe(5)
  })

  it('GRADE-UNDO-F1: chặn undo khi lần ghi gần nhất là CHỈNH TAY (_source manual) sau import', async () => {
    // 1) "Import" tạo row
    await upsertGrade({ studentId: studentE, academicYear, semester, scoreOral: 3 }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    // 2) Giáo lý viên sửa tay (source manual) — trước đây undo vẫn chạy và xóa luôn sửa tay
    await upsertGrade(
      { studentId: studentE, academicYear, semester, scoreOral: 7, scoreOral_source: 'manual' },
      'USR-001', 'gia-ton', '127.0.0.1', 'Vitest',
    )

    const [res] = await undoGradeImport([{ studentId: studentE }], semester, academicYear, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(res.status).toBe('not-clean')
    expect(res.message).toMatch(/chỉnh tay/i)

    // Sửa tay của GV phải còn nguyên
    const grades = await getGrades('gia-ton', studentE, semester)
    const row = grades.find(g => g.studentId === studentE)
    expect(row?.scoreOral).toBe(7)
  })

  it('deletes a grade row created by the import (CREATE entry)', async () => {
    await upsertGrade({ studentId: studentB, academicYear, semester, scoreMidterm: 8 }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

    const [res] = await undoGradeImport([{ studentId: studentB }], semester, academicYear, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(res.status).toBe('deleted')

    const grades = await getGrades('gia-ton', studentB, semester)
    expect(grades.find(g => g.studentId === studentB)).toBeUndefined()
  })

  it('rejects undo when the newest entry is older than 7 days', async () => {
    await upsertGrade({ studentId: studentC, academicYear, semester, scoreOral: 7 }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    const grades = await getGrades('gia-ton', studentC, semester)
    const grade = grades.find(g => g.studentId === studentC)
    expect(grade).toBeDefined()

    const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    await db
      .update(auditLogs)
      .set({ createdAt: stale })
      .where(and(eq(auditLogs.entityType, 'grade'), eq(auditLogs.entityId, grade!.id), eq(auditLogs.parishId, 'gia-ton')))

    const [res] = await undoGradeImport([{ studentId: studentC }], semester, academicYear, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(res.status).toBe('expired')
  })

  it('rejects a second undo (newest entry is GRADE_UNDO, not CREATE/UPDATE)', async () => {
    await upsertGrade({ studentId: studentD, academicYear, semester, scoreOral: 6 }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    await upsertGrade({ studentId: studentD, academicYear, semester, scoreOral: 8 }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')

    const [first] = await undoGradeImport([{ studentId: studentD }], semester, academicYear, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(first.status).toBe('restored')

    const [second] = await undoGradeImport([{ studentId: studentD }], semester, academicYear, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(second.status).toBe('not-clean')
  })

  it('returns not-found for unknown students', async () => {
    const [res] = await undoGradeImport([{ studentId: 'KHONG-TON-TAI' }], semester, academicYear, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(res.status).toBe('not-found')
  })

  it('blocks a chunhiem without access to the student class', async () => {
    await upsertGrade({ studentId: studentC, academicYear, semester, scoreFinal: 6 }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    const [res] = await undoGradeImport([{ studentId: studentC }], semester, academicYear, 'USR-002', 'gia-ton', '127.0.0.1', 'Vitest', ['LOP-KHAC'])
    expect(res.status).toBe('forbidden')
  })
})
