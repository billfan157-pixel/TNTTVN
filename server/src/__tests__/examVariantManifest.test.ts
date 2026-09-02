import { describe, expect, it } from 'vitest'
import { generateExamVariantManifest } from '../services/examVariantManifest.js'

const questions = Array.from({ length: 6 }, (_, index) => ({
  index: index + 1,
  question: `Câu hỏi ${index + 1}`,
  type: 'multiple_choice' as const,
  options: { A: `A${index}`, B: `B${index}`, C: `C${index}`, D: `D${index}` },
  correctOption: 'B' as const,
}))

describe('immutable exam variant manifest generator', () => {
  it('keeps A unchanged and deterministically materializes B-H mappings', () => {
    const first = generateExamVariantManifest({ questions, questionCount: 6, variantCount: 4, seed: 'seed-2026', generatedAt: '2026-09-01T00:00:00.000Z' })
    const second = generateExamVariantManifest({ questions, questionCount: 6, variantCount: 4, seed: 'seed-2026', generatedAt: '2026-09-01T00:00:00.000Z' })
    expect(first).toEqual(second)
    expect(first.variants.A?.sourceQuestionOrder).toEqual([1, 2, 3, 4, 5, 6])
    expect(first.variants.A?.answerKey).toEqual({ 1: 'B', 2: 'B', 3: 'B', 4: 'B', 5: 'B', 6: 'B' })
    expect(first.variants.B?.contentHash).not.toBe(first.variants.A?.contentHash)
    expect(Object.keys(first.variants)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('rejects options whose meaning depends on their position', () => {
    const unsafe = [{ ...questions[0], options: { ...questions[0].options, D: 'Tất cả đáp án trên' } }]
    expect(() => generateExamVariantManifest({ questions: unsafe, questionCount: 1, variantCount: 2, seed: 'seed' }))
      .toThrow('phụ thuộc vị trí')
  })
})
