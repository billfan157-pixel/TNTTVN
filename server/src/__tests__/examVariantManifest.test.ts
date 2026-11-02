import { describe, expect, it } from 'vitest'
import { EXAM_SHUFFLE_MODES, generateExamVariantManifest, type VariantQuestion } from '../services/examVariantManifest.js'

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

  it.each(EXAM_SHUFFLE_MODES)('accepts ordinary quantifiers in the reported questions 10 and 12 with %s', shuffleMode => {
    const source: VariantQuestion[] = [
      {
        index: 10, question: 'Theo sách Sáng thế, Thiên Chúa tạo dựng con người như thế nào? (x. St 1,27)',
        options: { A: 'Chỉ có người nam.', B: 'Chỉ có người nữ.', C: 'Có cả nam và nữ.', D: 'Tất cả mọi người đều có hình dáng giống nhau.' },
        correctOption: 'C',
      },
      {
        index: 12, question: 'Thiên Chúa ban cho con người khả năng nào để có thể đáp lại tình yêu của Người?',
        options: { A: 'Khả năng biết trước tất cả mọi sự.', B: 'Khả năng nhận biết và yêu mến Thiên Chúa cách tự do.', C: 'Khả năng không phải đau khổ và không phải chết.', D: 'Khả năng tạo dựng như Thiên Chúa.' },
        correctOption: 'B',
      },
    ]
    const original = JSON.stringify(source)
    const expectedAnswer = new Map([[10, 'Có cả nam và nữ.'], [12, 'Khả năng nhận biết và yêu mến Thiên Chúa cách tự do.']])
    const manifest = generateExamVariantManifest({ questions: source, questionCount: 2, variantCount: 2, seed: 'reported-quantifiers', shuffleMode })
    expect(manifest.variants.A!.answerKey).toEqual({ 1: 'C', 2: 'B' })
    for (const entry of Object.values(manifest.variants)) {
      entry.questions.forEach((question, i) => {
        const originalQuestion = source.find(q => q.index === entry.sourceQuestionOrder[i])!
        expect(Object.values(question.options!).sort()).toEqual(Object.values(originalQuestion.options!).sort())
        expect(question.options![entry.answerKey[question.index]]).toBe(expectedAnswer.get(originalQuestion.index))
      })
    }
    expect(JSON.stringify(source)).toBe(original)
  })

  it.each([
    'Có cả nam và nữ.', 'Cả bạn và tôi đều được yêu thương.', 'Cả bố và mẹ.',
    'All of humanity is loved.', 'None of us knows everything.', 'Both a man and a woman.',
  ])('does not mistake ordinary content for an option reference: %s', option => {
    const source = [{ ...questions[0], options: { ...questions[0].options, D: option } }]
    expect(() => generateExamVariantManifest({ questions: source, questionCount: 1, variantCount: 2, seed: 'ordinary-content' })).not.toThrow()
  })

  it.each([
    'Cả A và B đúng.', 'Cả (A) và (B) đúng.', 'A, C đều đúng.', 'Đáp án B.',
    'Phương án C đúng.', 'Tất cả các đáp án trên.', 'Cả ba phương án đều đúng.',
    'Không có đáp án nào đúng.', 'Các ý ở trên.', 'Tất cả ở trên đều đúng.', 'Tất cả đều đúng.',
    'All of the above.', 'None of the above.', 'Both A and B.', 'Neither A nor C.',
    'Ta\u0302\u0301t ca\u0309 ca\u0301c đa\u0301p a\u0301n tre\u0302n.',
  ])('rejects real answer references when options move: %s', option => {
    const source = [{ ...questions[0], options: { ...questions[0].options, D: option } }]
    for (const shuffleMode of ['questions_and_options', 'options_only'] as const) {
      expect(() => generateExamVariantManifest({ questions: source, questionCount: 1, variantCount: 2, seed: 'actual-reference', shuffleMode }))
        .toThrow('Phương án D phụ thuộc vị trí')
    }
  })

  it('keeps referenced A/B/C/D labels unchanged when only question order moves', () => {
    const source = [{ ...questions[0], options: { ...questions[0].options, D: 'Cả A và B đúng.' } }, questions[1]]
    const manifest = generateExamVariantManifest({ questions: source, questionCount: 2, variantCount: 2, seed: 'preserve-references', shuffleMode: 'questions_only' })
    expect(manifest.variants.B!.sourceQuestionOrder).toEqual([2, 1])
    for (const entry of Object.values(manifest.variants)) {
      entry.questions.forEach((question, i) => {
        const originalQuestion = source[entry.sourceQuestionOrder[i] - 1]
        expect(question.options).toEqual(originalQuestion.options)
        expect(entry.optionOrders[question.index]).toEqual(['A', 'B', 'C', 'D'])
        expect(entry.answerKey[question.index]).toBe(originalQuestion.correctOption)
      })
    }
  })

  it.each(EXAM_SHUFFLE_MODES)('preserves the correct answer content, weight and provenance with %s', shuffleMode => {
    const source: VariantQuestion[] = questions.map((q, index) => ({ ...q, correctOption: (['A', 'B', 'C', 'D'] as const)[index % 4],
      points: index + 1, sourceQuestionId: `bank-${index}`, sourceVersionId: `version-${index}` }))
    source.push({ index: 7, type: 'essay', question: 'Tự luận', points: 9, answerLineCount: 4 })
    const original = JSON.stringify(source)
    for (let seedIndex = 0; seedIndex < 12; seedIndex++) {
      const input = { questions: source, questionCount: 6, variantCount: 8, seed: `mapping-${seedIndex}`, shuffleMode, generatedAt: '2026-10-30T00:00:00Z' }
      const manifest = generateExamVariantManifest(input)
      expect(generateExamVariantManifest(input)).toEqual(manifest)
      expect(manifest.variants.A!.questions).toEqual(source)
      for (const entry of Object.values(manifest.variants)) {
        expect(entry.questions[6]).toEqual(source[6])
        expect([...entry.sourceQuestionOrder].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])
        if (shuffleMode === 'options_only') expect(entry.sourceQuestionOrder).toEqual([1, 2, 3, 4, 5, 6, 7])
        entry.questions.slice(0, 6).forEach((q, i) => {
          const originalQuestion = source[entry.sourceQuestionOrder[i] - 1]
          expect(q.options![entry.answerKey[q.index]]).toBe(originalQuestion.options![originalQuestion.correctOption!])
          expect(q).toMatchObject({ points: originalQuestion.points, sourceQuestionId: originalQuestion.sourceQuestionId, sourceVersionId: originalQuestion.sourceVersionId })
          expect(entry.sourceQuestionIds[i]).toBe(originalQuestion.sourceQuestionId)
          expect(entry.optionOrders[q.index].map(code => originalQuestion.options![code])).toEqual(Object.values(q.options!))
          if (shuffleMode === 'questions_only') expect(q.options).toEqual(originalQuestion.options)
        })
      }
      expect(new Set(Object.values(manifest.variants).map(entry => JSON.stringify(entry.questions.map(q => [q.question, q.options])))).size).toBe(8)
    }
    expect(JSON.stringify(source)).toBe(original)
  })

  it.each(['questions_and_options', 'options_only'] as const)('makes eight distinct papers even with one question using %s', shuffleMode => {
    for (let i = 0; i < 24; i++) {
      const manifest = generateExamVariantManifest({ questions: questions.slice(0, 1), questionCount: 1, variantCount: 8, seed: `short-${i}`, shuffleMode })
      expect(new Set(Object.values(manifest.variants).map(entry => JSON.stringify(entry.questions[0].options))).size).toBe(8)
      expect(manifest.variants.A!.answerKey).toEqual({ 1: 'B' })
    }
  })

  it.each([[1, 1], [2, 2], [3, 6]] as const)('uses every distinct question order for %i questions and rejects excess codes', (count, capacity) => {
    const input = { questions: questions.slice(0, count), questionCount: count, seed: 'short-order', shuffleMode: 'questions_only' as const }
    const manifest = generateExamVariantManifest({ ...input, variantCount: capacity })
    expect(new Set(Object.values(manifest.variants).map(entry => entry.sourceQuestionOrder.join(','))).size).toBe(capacity)
    expect(() => generateExamVariantManifest({ ...input, variantCount: capacity + 1 })).toThrow(`${capacity} mã đề khác nhau`)
  })

  it('does not count question IDs, hidden explanations or scoring weights as different printed papers', () => {
    const duplicates = [{ ...questions[0], points: 1, sourceQuestionId: 'one', explanation: 'one' }, { ...questions[0], index: 2, points: 9, sourceQuestionId: 'two', explanation: 'two' }]
    expect(() => generateExamVariantManifest({ questions: duplicates, questionCount: 2, variantCount: 2, seed: 'duplicates', shuffleMode: 'questions_only' })).toThrow('1 mã đề khác nhau')
  })

  it.each([
    { ...questions[0], isPlaceholder: true },
    { ...questions[0], question: '' },
    { ...questions[0], correctOption: 'E' },
    { ...questions[0], options: { A: 'One', B: ' one ', C: 'Three', D: 'Four' } },
    { ...questions[0], options: { A: 'One', B: 'Two', C: 'Three' } },
  ])('rejects incomplete or unsafe content with a validation error', question => {
    expect(() => generateExamVariantManifest({ questions: [question as VariantQuestion], questionCount: 1, variantCount: 2, seed: 'invalid-content' })).toThrow(expect.objectContaining({ status: 400 }))
  })

  it('rejects duplicated source indexes rather than producing ambiguous provenance', () => {
    expect(() => generateExamVariantManifest({ questions: [questions[0], { ...questions[1], index: 1 }], questionCount: 2, variantCount: 2, seed: 'duplicate-index' })).toThrow('không trùng nhau')
  })
})
