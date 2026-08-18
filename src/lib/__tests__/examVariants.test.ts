import { describe, expect, it } from 'vitest'
import { getConfiguredExamVersions, normalizeAnswerVariants } from '../examVariants'

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
})
