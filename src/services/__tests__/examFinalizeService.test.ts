import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { evaluateExamFinalizeConflictsAndRoute, SCORE_FIELD_MAP, DAILY_TYPES } from '../examFinalizeService'
import type { ExamResult, ExamSession } from '../../types'

function sessionOf(overrides: Partial<Pick<ExamSession, 'scoreType' | 'academicYear' | 'semester'>> = {}): Pick<ExamSession, 'scoreType' | 'academicYear' | 'semester'> {
  return { scoreType: 'midterm', academicYear: '2025-2026', semester: 1, ...overrides }
}

function resultOf(studentId: string, score: number): ExamResult {
  return {
    id: `EXR-${studentId}`,
    examSessionId: 'SESSION-1',
    studentId,
    score,
    source: 'qr_scan',
    studentName: `Ten ${studentId}`,
  } as ExamResult
}

describe('examFinalizeService', () => {
  it('routes oral/15m/1period qua pipeline daily, midterm/final qua exam_scan', () => {
    const addDailyEntry = vi.fn()
    const upsertGrade = vi.fn()
    const readGrade = vi.fn(() => null)

    const daily = evaluateExamFinalizeConflictsAndRoute({
      results: [resultOf('ST-A', 8)],
      session: sessionOf({ scoreType: '15m' }),
      readGrade,
      addDailyEntry,
      upsertGrade,
    })
    expect(daily.dailyCount).toBe(1)
    expect(addDailyEntry).toHaveBeenCalledWith('ST-A', '15m', 8, 1, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    expect(upsertGrade).not.toHaveBeenCalled()

    const direct = evaluateExamFinalizeConflictsAndRoute({
      results: [resultOf('ST-B', 9)],
      session: sessionOf({ scoreType: 'midterm' }),
      readGrade,
      addDailyEntry,
      upsertGrade,
    })
    expect(direct.directCount).toBe(1)
    expect(upsertGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'ST-B',
        semester: 1,
        academicYear: '2025-2026',
        scoreMidterm: 9,
        scoreMidterm_source: 'exam_scan',
      })
    )
    expect(addDailyEntry).toHaveBeenCalledTimes(1)
  })

  it('chặn ghi đè nguồn manual/override/excel_import và báo conflict', () => {
    const upsertGrade = vi.fn()
    const addDailyEntry = vi.fn()

    const cases: Array<{ source: string; score: number }> = [
      { source: 'manual', score: 7 },
      { source: 'override', score: 7.5 },
      { source: 'excel_import', score: 8 },
    ]
    for (const { source, score } of cases) {
      const readGrade = vi.fn((_sid: string) => ({ scoreOral_source: source, scoreOral: score }))
      const plan = evaluateExamFinalizeConflictsAndRoute({
        results: [resultOf(`ST-${source}`, 9.5)],
        session: sessionOf({ scoreType: 'oral' }),
        readGrade,
        addDailyEntry,
        upsertGrade,
      })
      expect(plan.skipped).toBe(1)
      expect(plan.conflicts).toHaveLength(1)
      expect(plan.conflicts[0]).toMatchObject({
        studentId: `ST-${source}`,
        existingSource: source,
        existingScore: score,
        scannedScore: 9.5,
      })
    }
    expect(addDailyEntry).not.toHaveBeenCalled()
    expect(upsertGrade).not.toHaveBeenCalled()
  })

it('đặt tên conflict qua studentNameResolver khi kết quả scan không có tên', () => {
    const noName: ExamResult = { ...resultOf('ST-D', 8), studentName: undefined as never, studentCode: undefined as never }
    const plan = evaluateExamFinalizeConflictsAndRoute({
      results: [noName],
      session: sessionOf({ scoreType: 'oral' }),
      readGrade: () => ({ scoreOral_source: 'excel_import' }),
      addDailyEntry: () => {},
      upsertGrade: () => {},
      studentNameResolver: (id) => (id === 'ST-D' ? { fullName: 'Trần Văn Dũng', code: 'ST-D' } : null),
    })
    expect(plan.conflicts[0].studentName).toBe('Trần Văn Dũng (ST-D)')

    const withScanName = evaluateExamFinalizeConflictsAndRoute({
      results: [resultOf('ST-D', 8)],
      session: sessionOf({ scoreType: 'oral' }),
      readGrade: () => ({ scoreOral_source: 'excel_import' }),
      addDailyEntry: () => {},
      upsertGrade: () => {},
      studentNameResolver: () => ({ fullName: 'Tên Store', code: 'ZZ' }),
    })
    expect(withScanName.conflicts[0].studentName).toBe('Ten ST-D')
  })

  it('SCORE_FIELD_MAP / DAILY_TYPES chia sẻ từ service', () => {
    expect(SCORE_FIELD_MAP.midterm.field).toBe('scoreMidterm')
    expect(DAILY_TYPES).toEqual(['oral', '15m', '1period'])
  })
})