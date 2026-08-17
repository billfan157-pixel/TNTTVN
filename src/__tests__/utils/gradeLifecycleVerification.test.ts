import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { calculateGradeAverage, normalizeAcademicYear, matchAcademicYear } from '../../utils/grades'
import { computeWeightedGpa } from '../../../server/src/utils/gradeCalculation'
import { useGradeStore, getCurrentAcademicYear } from '../../stores/gradeStore'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'
import { useSyncStore } from '../../stores/syncStore'
import { upsertGrade, getGrades } from '../../../server/src/services/gradeService'
import { db } from '../../../server/src/db/index'
import { grades, academicYears } from '../../../server/src/db/schema'

describe('Comprehensive End-to-End Grade Lifecycle Verification', () => {
  beforeAll(async () => {
    const testParishId = 'parish-test-e2e-1'
    const yr = getCurrentAcademicYear()
    await db.insert(academicYears).values({
      id: yr,
      startDate: '2026-08-01',
      endDate: '2027-07-31',
      parishId: testParishId,
    }).onConflictDoNothing()
  })

  beforeEach(() => {
    useGradeStore.setState({ grades: [], error: null })
    useDailyGradeStore.setState({ entries: [] })
    vi.clearAllMocks()
  })

  // ─── 1. GPA Parity & Score Clamping Verification ───
  describe('1. GPA Parity & Clamping Verification', () => {
    it('Client and Server produce 100% identical rounded GPA for decimal edge cases', () => {
      const testCases = [
        { scoreOral: 7, score15m: 8, score1Period: 9, scoreMidterm: 8, scoreFinal: 9 }, // 76/9 = 8.444... -> 8.4
        { scoreOral: 9, score15m: 9, score1Period: 9, scoreMidterm: 8.9, scoreFinal: 9 }, // 80.8/9 = 8.977... -> 9.0
        { scoreOral: 5, score15m: 5, score1Period: 5.5, scoreMidterm: 5.5, scoreFinal: 5.5 }, // 48/9 = 5.333... -> 5.3
      ]

      for (const tc of testCases) {
        const clientRes = calculateGradeAverage(tc)
        const serverGpa = computeWeightedGpa(tc)
        expect(clientRes.score).toBe(serverGpa)
      }
    })

    it('Client and Server handle out-of-bound scores [0, 10] identically', () => {
      const invalidScores = {
        scoreOral: 15, // should clamp to 10
        score15m: -2,  // should clamp to 0
        score1Period: 10,
        scoreMidterm: 10,
        scoreFinal: 10,
      }

      const clientRes = calculateGradeAverage(invalidScores)
      const serverGpa = computeWeightedGpa(invalidScores)
      expect(clientRes.score).toBe(8.9)
      expect(serverGpa).toBe(8.9)
      expect(clientRes.score).toBe(serverGpa)
    })
  })

  // ─── 2. Score Source Metadata Persistence Verification ───
  describe('2. Score Source Metadata Persistence', () => {
    it('Persists _source metadata in Server DB and returns it via API', async () => {
      const testStudentId = `st-verify-${Date.now()}`
      const testParishId = 'gia-ton'

      // Clean up previous test entries if any
      await db.delete(grades)

      // Insert dummy branch, academicYear, class, and student
      const { students, classes, academicYears, branches } = await import('../../../server/src/db/schema')
      const testBranchId = `br-verify-${Date.now()}`
      const testYearId = `ay-verify-${Date.now()}`
      const testClassId = `cl-verify-${Date.now()}`

      await db.insert(branches).values({ id: testBranchId, name: 'Ấu Nhi', scarfColor: 'Xanh', ageMin: 6, ageMax: 9, parishId: testParishId }).onConflictDoNothing()
      await db.insert(academicYears).values({ id: testYearId, startDate: '2025-09-01', endDate: '2026-05-31', parishId: testParishId }).onConflictDoNothing()
      await db.insert(classes).values({ id: testClassId, code: `AN-VERIFY-${Date.now()}`, name: 'Ấu 1 Verify', branchId: testBranchId, academicYearId: testYearId, parishId: testParishId }).onConflictDoNothing()
      await db.insert(students).values({
        id: testStudentId,
        code: `TN-VERIFY-${Date.now()}`,
        holyName: 'Giuse',
        fullName: 'Nguyen Van Verify',
        gender: 'Nam',
        dateOfBirth: '2015-01-01',
        parentName: 'Parent',
        parentPhone: '0901234567',
        address: '123 Test',
        branch: 'AuNhi',
        classId: testClassId,
        parishId: testParishId,
      })

      const payload = {
        studentId: testStudentId,
        semester: 1,
        academicYear: testYearId,
        scoreOral: 9.5,
        scoreOral_source: 'manual',
        scoreOral_updated_at: new Date().toISOString(),
        score15m: 8.0,
        score15m_source: 'daily_avg',
        score15m_updated_at: new Date().toISOString(),
        scoreFinal: 9.0,
        scoreFinal_source: 'excel_import',
        scoreFinal_updated_at: new Date().toISOString(),
      }

      // Upsert via server service
      await upsertGrade(payload as any, 'user-admin', testParishId, '127.0.0.1', 'Vitest')

      // Query back via server getGrades service
      const fetchedGrades = await getGrades(testParishId, testStudentId)
      expect(fetchedGrades).toHaveLength(1)

      const saved = fetchedGrades[0]
      expect(saved.scoreOral_source).toBe('manual')
      expect(saved.score15m_source).toBe('daily_avg')
      expect(saved.scoreFinal_source).toBe('excel_import')
    })

    it('DailyGradeStore respects manual source protection after reload/sync', () => {
      const activeAY = getCurrentAcademicYear()
      // Set a grade in gradeStore that has scoreOral_source = 'manual'
      useGradeStore.setState({
        grades: [{
          id: 'GR-M1',
          studentId: 'ST-M1',
          semester: 1,
          academicYear: activeAY,
          scoreOral: 9.0,
          scoreOral_source: 'manual',
          scoreOral_updated_at: new Date().toISOString(),
          score15m: null,
          score15m_source: null,
          score15m_updated_at: null,
          score1Period: null,
          score1Period_source: null,
          score1Period_updated_at: null,
          scoreMidterm: null,
          scoreMidterm_source: null,
          scoreMidterm_updated_at: null,
          scoreFinal: null,
          scoreFinal_source: null,
          scoreFinal_updated_at: null,
          scoreDaoDuc: null,
        }],
      })

      // Add a daily grade entry for ST-M1 with value = 6.0
      useDailyGradeStore.getState().addEntry('ST-M1', 'oral', 6.0, 1)

      // Verify that syncAllToGradeStore did NOT overwrite manual score 9.0 with daily average 6.0
      const currentGrade = useGradeStore.getState().getStudentGrade('ST-M1', 1)
      expect(currentGrade?.scoreOral).toBe(9.0)
      expect(currentGrade?.scoreOral_source).toBe('manual')
    })
  })

  // ─── 3. Single Queue Item (No Double-Save) Verification ───
  describe('3. Single Queue Item (No Double-Save) Verification', () => {
    it('upsertGrade with skipSync=true updates Zustand without queuing sync op', () => {
      const syncStore = useSyncStore.getState()
      const initialOps = syncStore.pendingCount
      const activeAY = getCurrentAcademicYear()

      useGradeStore.getState().upsertGrade({
        studentId: 'ST-NOSYNC',
        semester: 1,
        academicYear: activeAY,
        scoreOral: 8.5,
      }, true) // skipSync = true

      // Verify local store updated
      const updated = useGradeStore.getState().getStudentGrade('ST-NOSYNC', 1)
      expect(updated?.scoreOral).toBe(8.5)

      // Verify pending count did NOT increase
      expect(useSyncStore.getState().pendingCount).toBe(initialOps)
    })
  })

  // ─── 4. Academic Year Normalization Verification ───
  describe('4. Academic Year Normalization Verification', () => {
    it('normalizeAcademicYear produces uniform format across space variations', () => {
      expect(normalizeAcademicYear('2025 - 2026')).toBe('2025-2026')
      expect(normalizeAcademicYear('2025-2026')).toBe('2025-2026')
      expect(normalizeAcademicYear('  2025   -   2026  ')).toBe('2025-2026')
    })

    it('matchAcademicYear correctly matches varying space inputs', () => {
      expect(matchAcademicYear('2025 - 2026', '2025-2026')).toBe(true)
      expect(matchAcademicYear('2025 - 2026', '2024 - 2025')).toBe(false)
    })
  })
})
