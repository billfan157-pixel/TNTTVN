import { describe, it, expect, beforeAll, vi } from 'vitest'
import { getGrades, upsertGrade, upsertGradeBatch } from '../../services/gradeService.js'
import { createStudent } from '../../services/studentService.js'
import { db } from '../../db/index.js'
import { branches, academicYears, classes } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

describe('Server gradeService Layer Unit Tests', () => {
  let studentA: string
  let studentB: string
  let studentC: string
  let studentP5: string
  let studentTx: string

beforeAll(async () => {
     const now = new Date().toISOString()
     const { getCurrentAcademicYear } = await import('../../utils/academicYear.js')
     const currentYr = getCurrentAcademicYear()
     await db.insert(branches).values({ id: 'AuNhi', name: 'Ấu Nhi', scarfColor: '#16A34A', ageMin: 7, ageMax: 9, parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
     await db.insert(academicYears).values({ id: '2025-2026', startDate: '2025-08-01', endDate: '2026-07-31', parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
     await db.insert(academicYears).values({ id: currentYr, startDate: '2026-08-01', endDate: '2027-07-31', parishId: 'gia-ton', createdAt: now, updatedAt: now, updatedBy: 'test' }).onConflictDoNothing()
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
     const a = await createWithRetry({ holyName: 'A', fullName: 'A', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'AU1' })
     const b = await createWithRetry({ holyName: 'B', fullName: 'B', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'AU1' })
     const c = await createWithRetry({ holyName: 'C', fullName: 'C', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'AU1' })
     const p5 = await createWithRetry({ holyName: 'P5', fullName: 'P5', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'AU1' })
     const tx = await createWithRetry({ holyName: 'TX', fullName: 'TX', gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'P', parentPhone: '000', address: 'X', branch: 'AuNhi', classId: 'AU1' })
     studentA = a!.id
     studentB = b!.id
     studentC = c!.id
     studentP5 = p5!.id
     studentTx = tx!.id
   })

  it('upsertGrade inserts or updates a grade record', async () => {
    const gradeData = {
      studentId: studentA,
      academicYear: '2025 - 2026',
      semester: 1 as const,
      scoreOral: 10,
      score15m: 9,
      score1Period: 9,
      scoreMidterm: 10,
      scoreFinal: 10,
      comments: 'Chăm chỉ, đạt điểm cao',
    }

    const res = await upsertGrade(gradeData, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(res).not.toBeNull()
    expect(res?.scoreFinal).toBe(10)
  })

  it('D4: resolves policy version through the grade transaction executor', async () => {
    const globalSelect = vi.spyOn(db, 'select')
    try {
      const result = await upsertGrade({
        studentId: studentTx,
        academicYear: '2025-2026',
        semester: 1,
        scoreFinal: 8,
      }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
      expect(result.studentId).toBe(studentTx)
      expect(globalSelect).not.toHaveBeenCalled()
    } finally {
      globalSelect.mockRestore()
    }
  })

  it('getGrades fetches list of grade records for parish', async () => {
    const grades = await getGrades('gia-ton')
    expect(Array.isArray(grades)).toBe(true)
    expect(grades.length).toBeGreaterThan(0)
  })

  it('upsertGradeBatch upserts multiple grade records in a single batch', async () => {
    const batchData = [
      { studentId: studentB, semester: 1 as const, academicYear: '2025 - 2026', scoreOral: 8, scoreFinal: 8.5 },
      { studentId: studentC, semester: 1 as const, academicYear: '2025 - 2026', scoreOral: 9, scoreFinal: 9.5 },
    ]

    const results = await upsertGradeBatch(batchData, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(results).toHaveLength(2)
    expect(results[0].status).toBe('saved')
    // ADR-016 (offline-sync audit #2): 'saved' phải kèm record server (id + version)
    // để client rehydrate bản ghi tạm — nếu không, lần sửa kế tiếp gửi temp id → 409.
    expect(results[0].record).toBeTruthy()
    expect(results[0].record?.id).toMatch(/^GR-/)
    expect(results[0].record?.version).toBe(1)
    expect(results[1].status).toBe('saved')
    expect(results[1].record?.id).toMatch(/^GR-/)
  })

  it('increments version on update and throws VersionConflictError on stale version', async () => {
    const initial = await upsertGrade({
      studentId: studentA,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 8,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(initial.version).toBe(1)

    const updated = await upsertGrade({
      studentId: studentA,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 9,
      version: 1,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(updated.version).toBe(2)

    // Stale version should throw VersionConflictError
    await expect(upsertGrade({
      studentId: studentA,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 10,
      version: 1, // Stale version! Current version is 2
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')).rejects.toThrow('Điểm đã bị thay đổi bởi người khác')
  })

  it('does not overwrite unmentioned score fields with null and clears fields specified in clearFields', async () => {
    // 1. Initial set: scoreOral = 8, score15m = 9
    const step1 = await upsertGrade({
      studentId: studentB,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 8,
      score15m: 9,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(step1.scoreOral).toBe(8)
    expect(step1.score15m).toBe(9)

    // 2. Partial update: scoreOral = 10, omitted score15m -> score15m MUST remain 9
    const step2 = await upsertGrade({
      studentId: studentB,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 10,
      version: step1.version,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(step2.scoreOral).toBe(10)
    expect(step2.score15m).toBe(9)

    // 3. Clear score15m explicitly via clearFields
    const step3 = await upsertGrade({
      studentId: studentB,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      clearFields: ['score15m'],
      version: step2.version,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(step3.scoreOral).toBe(10)
    expect(step3.score15m).toBeNull()
  })

  it('rejects upsertGrade when semester is locked (Fix F9)', async () => {
    // Lock semester 1 for 2025-2026
    const { drizzleSemesterLockRepository } = await import('../../repositories/DrizzleSemesterLockRepository.js')
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, true, 'USR-001', 'gia-ton')

    await expect(upsertGrade({
      studentId: studentA,
      academicYear: '2025 - 2026',
      semester: 1,
      scoreOral: 5,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')).rejects.toThrow('đã bị khóa sổ điểm')

    // Unlock semester 1 for cleanup
    await drizzleSemesterLockRepository.setLockState('2025-2026', 1, false, 'USR-001', 'gia-ton')
  })

  it('rejects grade update when version is omitted on existing record with version > 1 (Item 1)', async () => {
    // 1. Create initial grade (v1)
    const v1 = await upsertGrade({
      studentId: studentC,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 7,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(v1.version).toBe(1)

    // 2. Update to v2
    const v2 = await upsertGrade({
      studentId: studentC,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 8,
      version: 1,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(v2.version).toBe(2)

    // 3. Attempt update without version -> must reject
    await expect(upsertGrade({
      studentId: studentC,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 9,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')).rejects.toThrow('Thiếu thông tin phiên bản (version) để cập nhật điểm')
  })

  it('payload thiếu academicYear → dùng năm học hiện tại, KHÔNG rơi về hằng số cũ (finding #5)', async () => {
    const { getCurrentAcademicYear } = await import('../../utils/academicYear.js')
    const res = await upsertGrade({
      studentId: studentA,
      semester: 2 as const,
      scoreOral: 9,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(res.academicYear).toBe(getCurrentAcademicYear())
  })

  it('allowedClassIds loại trừ class của học sinh → 403/TOCTOU (finding #12)', async () => {
    await expect(upsertGrade({
      studentId: studentA,
      academicYear: '2025 - 2026',
      semester: 1 as const,
      scoreOral: 6,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest', undefined, ['CLASS-KHONG-PHEP'])).rejects.toThrow('Bạn không có quyền nhập điểm cho thiếu nhi này')
  })

  it('AUDIT P5: nguồn tự động KHÔNG ghi đè manual override — chỉ manual mới được ghi', async () => {
    // 1. Grade baseline (source auto)
    const v1 = await upsertGrade({
      studentId: studentP5,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 7,
      scoreOral_source: 'auto',
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(v1.scoreOral).toBe(7)

    // 2. Teacher chỉnh tay (source manual) → override được tạo, field bảo vệ
    const v2 = await upsertGrade({
      studentId: studentP5,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 9.5,
      scoreOral_source: 'manual',
      version: v1.version,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(v2.scoreOral).toBe(9.5)
    expect(v2.scoreOralSource).toBe('manual')

    // 3. Sync tự động (source auto) gửi giá trị mới → BỊ CHẶN: giữ 9.5/manual
    const v3 = await upsertGrade({
      studentId: studentP5,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 6,
      scoreOral_source: 'auto',
      version: v2.version,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(v3.scoreOral).toBe(9.5)
    expect(v3.scoreOralSource).toBe('manual')

    // 4. Teacher sửa lại tay lần nữa → vẫn được ghi (manual = priority cao nhất)
    const v4 = await upsertGrade({
      studentId: studentP5,
      academicYear: '2025 - 2026',
      semester: 2 as const,
      scoreOral: 8,
      scoreOral_source: 'manual',
      version: v3.version,
    }, 'USR-001', 'gia-ton', '127.0.0.1', 'Vitest')
    expect(v4.scoreOral).toBe(8)
    expect(v4.scoreOralSource).toBe('manual')
  })
})

