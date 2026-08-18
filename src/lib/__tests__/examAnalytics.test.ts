import { describe, expect, it } from 'vitest'
import { computeExamAnalytics } from '../examAnalytics'
import type { ExamResult } from '../../types'

function result(id: string, score: number, examVersion: 'A' | 'B', answers: Record<number, 'A' | 'B' | 'C' | 'D' | null>): ExamResult {
  return { id, examSessionId: 'EXS-1', studentId: `ST-${id}`, score, source: 'omr', createdAt: '2026-08-19T00:00:00Z', examVersion, answers }
}

describe('exam analytics', () => {
  it('tính phổ điểm và chấm item theo đúng đáp án từng mã đề', () => {
    const analytics = computeExamAnalytics([
      result('1', 10, 'A', { 1: 'A', 2: 'B' }),
      result('2', 5, 'B', { 1: 'C', 2: null }),
      result('3', 0, 'A', { 1: 'D', 2: 'A' }),
    ], 2, 10, {
      A: { 1: 'A', 2: 'B' },
      B: { 1: 'C', 2: 'D' },
    })

    expect(analytics).toMatchObject({ count: 3, mean: 5, median: 5, min: 0, max: 10, passRate: 0.667 })
    expect(analytics.versions).toEqual([{ version: 'A', count: 2 }, { version: 'B', count: 1 }])
    expect(analytics.items[0]).toMatchObject({ correctRate: 0.667, blankRate: 0 })
    expect(analytics.items[1]).toMatchObject({ correctRate: 0.333, blankRate: 0.333 })
  })

  it('không bịa độ phân biệt khi dưới 5 bài', () => {
    const analytics = computeExamAnalytics([result('1', 10, 'A', { 1: 'A' })], 1, 10, { A: { 1: 'A' } })
    expect(analytics.items[0].discrimination).toBeNull()
  })
})
