import { describe, expect, it } from 'vitest'
import {
  formatExamVersionLabel,
  getConfiguredExamVersions,
  getExamVersionNumericAlias,
  normalizeAnswerVariants,
} from '../examVariants'

describe('exam variants', () => {
  it('chuẩn hóa JSON và giữ fallback legacy ở mã A', () => {
    expect(normalizeAnswerVariants(undefined, '{"1":"A","2":"B"}', 2)).toEqual({ A: { 1: 'A', 2: 'B' } })
    expect(normalizeAnswerVariants('{"A":{"1":"C"},"B":{"1":"D"}}', undefined, 1)).toEqual({
      A: { 1: 'C' },
      B: { 1: 'D' },
    })
  })

  it('chỉ trả mã A-H có đáp án hợp lệ', () => {
    expect(getConfiguredExamVersions({ A: { 1: 'A' }, C: { 1: 'B' }, Z: { 1: 'D' } }, undefined, 1)).toEqual(['A', 'C'])
  })

  it('ánh xạ mã A-H sang mã số 3 chữ số thân thiện (101-108)', () => {
    expect(getExamVersionNumericAlias('A')).toBe(101)
    expect(getExamVersionNumericAlias('B')).toBe(102)
    expect(getExamVersionNumericAlias('C')).toBe(103)
    expect(getExamVersionNumericAlias('D')).toBe(104)
    expect(getExamVersionNumericAlias('H')).toBe(108)
    expect(getExamVersionNumericAlias('A', 200)).toBe(201)
  })

  it('định dạng nhãn mã đề hiển thị đồng thời mã chữ và mã số', () => {
    expect(formatExamVersionLabel('A')).toBe('Mã A (101)')
    expect(formatExamVersionLabel('B')).toBe('Mã B (102)')
    expect(formatExamVersionLabel('B', false)).toBe('Mã B')
  })
})
