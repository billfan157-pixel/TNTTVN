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

  it('preserves the legacy v2 gate for definitions regenerated under that algorithm', () => {
    const unsafe = [{ ...questions[0], options: { ...questions[0].options, D: 'Tất cả đáp án trên' } }]
    expect(() => generateExamVariantManifest({ questions: unsafe, questionCount: 1, variantCount: 2, seed: 'seed', algorithmVersion: 'catevia-variant-v2' }))
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

  it.each((['question', 'explanation', 'option'] as const).flatMap(field => [
    'Câu chuyện về lòng tốt.', 'Các cách thể hiện tình yêu thương.', 'Câu chuyện về lòng tốt.'.normalize('NFD'),
  ].map(text => ({ field, text }))))('keeps a complete Vietnamese word literal in $field: $text', ({ field, text }) => {
    const question: VariantQuestion = { ...questions[0], question: 'Ai tạo dựng con người?',
      explanation: 'Thiên Chúa yêu thương con người.', options: { A: 'Một', B: 'Hai', C: 'Ba', D: 'Bốn' } }
    if (field === 'option') question.options!.D = text
    else question[field] = text
    const manifest = generateExamVariantManifest({ questions: [question], questionCount: 1, variantCount: 8,
      shuffleMode: 'options_only', seed: 'whole-word-reference' })
    expect(manifest.questionPlans?.[0]).toMatchObject({ status: 'free', validOrderCount: 24, references: [] })
    expect(new Set(Object.values(manifest.variants).map(entry => JSON.stringify(entry.questions[0].options))).size).toBe(8)
    for (const entry of Object.values(manifest.variants)) {
      const materialized = entry.questions[0]
      expect(materialized.question).toBe(question.question)
      expect(materialized.explanation).toBe(question.explanation)
      expect(Object.values(materialized.options!).sort()).toEqual(Object.values(question.options!).sort())
      expect(materialized.options![entry.answerKey[1]]).toBe('Hai')
    }
  })

  it.each([
    'Cả A và B đúng.', 'Cả (A) và (B) đúng.', 'A, C đều đúng.', 'Đáp án B.',
    'Phương án C đúng.', 'Tất cả các đáp án trên.', 'Cả ba phương án đều đúng.',
    'Không có đáp án nào đúng.', 'Các ý ở trên.', 'Tất cả ở trên đều đúng.', 'Tất cả đều đúng.',
    'All of the above.', 'None of the above.', 'Both A and B.', 'Neither A nor C.',
    'Ta\u0302\u0301t ca\u0309 ca\u0301c đa\u0301p a\u0301n tre\u0302n.',
  ])('preserves the legacy positional rejection when explicitly regenerating v2: %s', option => {
    const source = [{ ...questions[0], options: { ...questions[0].options, D: option } }]
    for (const shuffleMode of ['questions_and_options', 'options_only'] as const) {
      expect(() => generateExamVariantManifest({ questions: source, questionCount: 1, variantCount: 2, seed: 'actual-reference', shuffleMode, algorithmVersion: 'catevia-variant-v2' }))
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

  it.each([
    'Tất cả đáp đều đúng.', 'Tất cả các đáp án trên đều đúng.', 'Cả ba phương án đều đúng.',
    'Không có đáp án nào ở trên đúng.', 'All of the above.', 'None of the above.',
    'Ta\u0302\u0301t ca\u0309 ca\u0301c đa\u0301p a\u0301n tre\u0302n.',
  ])('pins the aggregate and enumerates exactly six safe orders: %s', aggregate => {
    const source = [{ ...questions[0], options: { ...questions[0].options, D: aggregate } }]
    const input = { questions: source, questionCount: 1, seed: 'fixed-aggregate', shuffleMode: 'options_only' as const }
    const manifest = generateExamVariantManifest({ ...input, variantCount: 6 })
    expect(manifest.algorithmVersion).toBe('catevia-variant-v3')
    expect(manifest.questionPlans?.[0]).toMatchObject({ status: 'constrained', validOrderCount: 6,
      aggregates: [{ choice: 'D', targets: ['A', 'B', 'C'], operator: /^(?:Không|None)/u.test(aggregate) ? 'none' : 'all' }] })
    for (const entry of Object.values(manifest.variants)) {
      expect(entry.questions[0].options!.D).toBe(aggregate)
      expect(entry.optionOrders[1][3]).toBe('D')
      // An aggregate distractor must not silently replace the source B key.
      expect(entry.questions[0].options![entry.answerKey[1]]).toBe('B0')
    }
    expect(new Set(Object.values(manifest.variants).map(entry => JSON.stringify(entry.questions[0].options))).size).toBe(6)
    expect(() => generateExamVariantManifest({ ...input, variantCount: 7 })).toThrow('6 mã đề khác nhau')
  })

  it('keeps the exact AB prefix for an above-aggregate at C', () => {
    const source = [{ ...questions[0], correctOption: 'C' as const,
      options: { A: 'Biết nhận lỗi', B: 'Biết sửa lỗi', C: 'Tất cả các đáp án trên đều đúng.', D: 'Không cần sửa lỗi' } }]
    const input = { questions: source, questionCount: 1, seed: 'above-at-c', shuffleMode: 'options_only' as const }
    const manifest = generateExamVariantManifest({ ...input, variantCount: 2 })
    for (const entry of Object.values(manifest.variants)) {
      expect(entry.optionOrders[1].slice(0, 2).sort()).toEqual(['A', 'B'])
      expect(entry.questions[0].options!.C).toBe(source[0].options.C)
      expect(entry.questions[0].options!.D).toBe(source[0].options.D)
      expect(entry.answerKey[1]).toBe('C')
    }
    expect(() => generateExamVariantManifest({ ...input, variantCount: 3 })).toThrow('2 mã đề khác nhau')
  })

  it('combines constrained choices across every question instead of only varying the first', () => {
    const source = questions.slice(0, 2).map(q => ({ ...q, options: { ...q.options, D: 'Tất cả đáp đều đúng.' } }))
    const manifest = generateExamVariantManifest({ questions: source, questionCount: 2, variantCount: 8,
      seed: 'combine-fixed-questions', shuffleMode: 'options_only' })
    expect(new Set(Object.values(manifest.variants).map(entry => JSON.stringify(entry.questions.map(q => q.options)))).size).toBe(8)
    expect(new Set(Object.values(manifest.variants).map(entry => entry.optionOrders[1].join(''))).size).toBeGreaterThan(1)
    expect(new Set(Object.values(manifest.variants).map(entry => entry.optionOrders[2].join(''))).size).toBeGreaterThan(1)
  })

  it.each(['Cả A và B đúng.', 'Cả (A) và (B) đúng.', 'Both A and B.', 'Neither A nor B.'])(
    'rewrites only the labels and keeps the referenced source choices: %s', reference => {
      const source = [{ ...questions[0], correctOption: 'D' as const, options: { ...questions[0].options, D: reference },
        explanation: 'Đáp án D đúng vì cả A và B đúng.' }]
      const original = JSON.stringify(source)
      const manifest = generateExamVariantManifest({ questions: source, questionCount: 1, variantCount: 8, seed: 'explicit-labels' })
      expect(manifest.questionPlans?.[0]).toMatchObject({ status: 'constrained', validOrderCount: 24 })
      for (const entry of Object.values(manifest.variants)) {
        const q = entry.questions[0]
        const text = q.options![entry.answerKey[1]]
        const labels = text.match(/(?<![\p{L}\p{N}_])[A-D](?![\p{L}\p{N}_])/gu)!
        expect(labels.map(label => q.options![label as 'A' | 'B' | 'C' | 'D'])).toEqual(['A0', 'B0'])
        expect(q.explanation).toContain('Đáp án ' + entry.answerKey[1] + ' đúng vì')
        expect(text.replace(/(?<![\p{L}\p{N}_])[A-D](?![\p{L}\p{N}_])/gu, '#'))
          .toBe(reference.replace(/(?<![\p{L}\p{N}_])[A-D](?![\p{L}\p{N}_])/gu, '#'))
      }
      expect(JSON.stringify(source)).toBe(original)
    })

  it.each([
    { A: 'Cả B và C đúng.', B: 'Cả A và C đúng.', C: 'Một', D: 'Hai' },
    { A: 'Một', B: 'Hai', C: 'Ba', D: 'Cả A và D đúng.' },
    { A: 'Một', B: 'Hai', C: 'Ba', D: 'Cả A và E đúng.' },
    { A: 'Một', B: 'Hai', C: 'Ba', D: 'Tất cả đáp trên trừ phương án B.' },
  ])('holds unresolved/cyclic choices while still shuffling other questions', options => {
    const source = [{ ...questions[0], options }, questions[1]]
    const manifest = generateExamVariantManifest({ questions: source, questionCount: 2, variantCount: 8,
      shuffleMode: 'options_only', seed: 'hold-one-question' })
    expect(manifest.questionPlans?.[0]).toMatchObject({ status: 'held', validOrderCount: 1 })
    for (const entry of Object.values(manifest.variants)) {
      expect(entry.questions[0].options).toEqual(options)
      expect(entry.optionOrders[1]).toEqual(['A', 'B', 'C', 'D'])
    }
    expect(new Set(Object.values(manifest.variants).map(entry => JSON.stringify(entry.questions[1].options))).size).toBe(8)
  })

  it('preserves literal vitamin and ordinary quantified text', () => {
    const source = [{ ...questions[0], options: { A: 'Vitamin A', B: 'Có cả nam và nữ.', C: 'Biết trước tất cả mọi sự.', D: 'Tất cả mọi người đều có hình dáng giống nhau.' } }]
    const manifest = generateExamVariantManifest({ questions: source, questionCount: 1, variantCount: 8, seed: 'literal-content' })
    expect(manifest.questionPlans?.[0]).toMatchObject({ status: 'free', validOrderCount: 24 })
    for (const entry of Object.values(manifest.variants)) expect(Object.values(entry.questions[0].options!).sort()).toEqual(Object.values(source[0].options).sort())
  })

  it('moves an approved aggregate by replacing its relative scope with the same explicit set', () => {
    const source = [{ ...questions[0], correctOption: 'D' as const,
      options: { ...questions[0].options, D: 'Tất cả các đáp án trên đều đúng.' } }]
    const manifest = generateExamVariantManifest({ questions: source, questionCount: 1, variantCount: 8,
      shufflePolicy: 'rewrite_aggregates', seed: 'approved-rewrite' })
    expect(manifest.questionPlans?.[0].validOrderCount).toBe(24)
    expect(manifest.variants.A!.questions).toEqual(source)
    let changed = false
    for (const entry of Object.values(manifest.variants)) {
      const q = entry.questions[0]
      const correct = q.options![entry.answerKey[1]]
      if (entry.answerKey[1] === 'D') expect(correct).toBe(source[0].options.D)
      else {
        changed = true
        const labels = correct.match(/(?<![\p{L}\p{N}_])[A-D](?![\p{L}\p{N}_])/gu)!
        expect(labels.map(label => q.options![label as 'A' | 'B' | 'C' | 'D']).sort()).toEqual(['A0', 'B0', 'C0'])
        expect(labels).not.toContain(entry.answerKey[1])
      }
    }
    expect(changed).toBe(true)
  })

  it('keeps cross-question references in place while allowing option shuffles', () => {
    const source = [{ ...questions[0], question: 'Dựa vào câu 2, chọn một nhận định.' }, questions[1]]
    const manifest = generateExamVariantManifest({ questions: source, questionCount: 2, variantCount: 8, seed: 'cross-question' })
    expect(manifest.orderReasons).toHaveLength(1)
    for (const entry of Object.values(manifest.variants)) expect(entry.sourceQuestionOrder).toEqual([1, 2])
    expect(() => generateExamVariantManifest({ questions: source, questionCount: 2, variantCount: 2, seed: 'cross-question', shuffleMode: 'questions_only' }))
      .toThrow('1 mã đề khác nhau')
  })
})
