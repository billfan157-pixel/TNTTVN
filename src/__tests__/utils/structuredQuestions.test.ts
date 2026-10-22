import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExamFromExcel, parseExamFromText, scopeExamParseResult } from '../../utils/examParser'
import { mutationFromQuestionForm, questionFormFromItem, EMPTY_QUESTION } from '../../utils/questionEditorModel'
import { generateExamExcelWorkbook, generateExamJsonString, generateExamWordHtml, exportExamToText } from '../../utils/examExporter'
import { buildExamPaperHtml, getEssayAnswerLineCount } from '../../utils/examSheets'
import type { ExamVariantManifestSet, QuestionBankItem } from '../../types'

const sample = `PHẦN I. TRẮC NGHIỆM (2 điểm)
Câu 1: Chọn số hai.
A. Một
B. Hai
C. Ba
D. Bốn
Đáp án: B
PHẦN II. ĐIỀN KHUYẾT (2 điểm)
Câu 2: Điền từ: Chúng ta sống (1) ___ và biết (2) ___.
Từ cho sẵn: yêu thương, tha thứ, chia sẻ
Đáp án: 1: yêu thương | yêu mến; 2: tha thứ
PHẦN III. NỐI CỘT (2 điểm)
Câu 3: Nối mỗi ý ở cột A với cột B.
Cột A | Cột B
1. Mục thứ nhất | A. Ý thứ hai
2. Mục thứ hai | B. Ý thứ nhất
Đáp án: 1-B; 2-A
PHẦN IV. TỰ LUẬN (4 điểm)
Câu 4 (4 điểm): Trình bày:
a) Nêu ý nghĩa. (1 điểm)
b) Liên hệ bản thân. (3 điểm)`

describe('structured exam recognition, authoring and output', () => {
  it('keeps four response formats, nested parts and exact OMR numbering in one paper', () => {
    const result = parseExamFromText(sample)
    expect(result.ok).toBe(true)
    expect(result.questions).toHaveLength(4)
    expect(result.totalPoints).toBe(10)
    expect(result.answerKey).toEqual({ 1: 'B' })
    expect(result.questions[1]).toMatchObject({ index: 2, type: 'essay', responseFormat: 'fill_blank', points: 2,
      answerData: { blanks: [{ id: '1', acceptedAnswers: ['yêu thương', 'yêu mến'] }, { id: '2', acceptedAnswers: ['tha thứ'] }], wordBank: ['yêu thương', 'tha thứ', 'chia sẻ'] } })
    expect(result.questions[2]).toMatchObject({ index: 3, responseFormat: 'matching', points: 2,
      answerData: { left: [{ id: '1', text: 'Mục thứ nhất' }, { id: '2', text: 'Mục thứ hai' }], right: [{ id: 'A', text: 'Ý thứ hai' }, { id: 'B', text: 'Ý thứ nhất' }], pairs: [{ leftId: '1', rightId: 'B' }, { leftId: '2', rightId: 'A' }] } })
    expect(result.questions[3].answerData?.subparts).toEqual([{ label: 'a)', text: 'Nêu ý nghĩa. (1 điểm)', points: 1 }, { label: 'b)', text: 'Liên hệ bản thân. (3 điểm)', points: 3 }])
    expect(scopeExamParseResult(result, 'multiple_choice').questions).toHaveLength(3)
    expect(scopeExamParseResult(result, 'essay').questions).toHaveLength(1)
  })

  it('recognizes headerless matching without breaking numbered column items into questions', () => {
    const result = parseExamFromText('Câu 1: Ghép cột:\nCột A\n1. Một\n2. Hai\nCột B\nA. First\nB. Second\nĐáp án: 1-A; 2-B')
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toMatchObject({ responseFormat: 'matching', answerData: { pairs: [{ leftId: '1', rightId: 'A' }, { leftId: '2', rightId: 'B' }] } })
    expect(result.answerKey).toEqual({})
  })

  it('keeps a matching section without a parent question marker as one question', () => {
    const result = parseExamFromText('PHẦN III. NỐI CỘT (2 điểm)\nCột A | Cột B\n1. Một | A. Second\n2. Hai | B. First\nĐáp án: 1-B; 2-A')
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]).toMatchObject({ points: 2, responseFormat: 'matching', answerData: { pairs: [{ leftId: '1', rightId: 'B' }, { leftId: '2', rightId: 'A' }] } })
  })

  it('attaches explicit structured keys at the end of the paper by parent question number', () => {
    const result = parseExamFromText('Câu 1: Điền từ: Em biết {{1}}.\nCâu 2: Ghép cột.\n1. Một | A. Second\n2. Hai | B. First\nBẢNG ĐÁP ÁN:\nCâu 1: chia sẻ\nCâu 2: 1-B; 2-A')
    expect(result.questions[0].answerData?.blanks?.[0].acceptedAnswers).toEqual(['chia sẻ'])
    expect(result.questions[1].answerData?.pairs).toEqual([{ leftId: '1', rightId: 'B' }, { leftId: '2', rightId: 'A' }])
    expect(result.answerKey).toEqual({})
  })

  it.each([
    ['a) Ý thứ nhất.\nb) Ý thứ hai.', 2],
    ['a. Ý thứ nhất.\nb. Ý thứ hai.', 2],
    ['(a) Ý thứ nhất.\n(b) Ý thứ hai.', 2],
    ['i) Ý thứ nhất.\nii) Ý thứ hai.', 2],
    ['1.1 Ý thứ nhất.\n1.2 Ý thứ hai.', 2],
    ['a) Ý thứ nhất. b) Ý thứ hai.', 2],
  ])('organizes essay subparts inside their parent: %s', (parts, count) => {
    const result = parseExamFromText(`PHẦN TỰ LUẬN\nCâu 1 (2 điểm): Trình bày:\n${parts}`)
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0].answerData?.subparts).toHaveLength(count)
    expect(result.questions[0].points).toBe(2)
    expect(result.answerKey).toEqual({})
  })

  it('does not fabricate a key for missing answers or confuse answer lines with gaps', () => {
    const blank = parseExamFromText('Câu 1: Điền từ còn thiếu: Em sống {{1}}.')
    expect(blank.questions[0].answerData?.blanks).toEqual([{ id: '1', acceptedAnswers: [] }])
    expect(blank.answerKey).toEqual({})
    expect(blank.warnings.join(' ')).toContain('chưa có đáp án')
    const essay = parseExamFromText('PHẦN TỰ LUẬN\nCâu 1: Trình bày ý nghĩa.\n...................................................\na) Giải thích.\n.........................................')
    expect(essay.questions[0].responseFormat).toBeUndefined()
  })

  it('keeps four-choice cloze as OMR and moves OMR items before manual formats', () => {
    const result = parseExamFromText('Câu 1: Điền từ: Em sống ___.\nĐáp án: tốt\nCâu 2: Điền từ: Em sống ___.\nA. tốt\nB. xấu\nC. khác\nD. sai\nĐáp án: A')
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0]).toMatchObject({ index: 1, type: 'multiple_choice', correctOption: 'A' })
    expect(result.questions[1]).toMatchObject({ index: 2, responseFormat: 'fill_blank' })
    expect(result.answerKey).toEqual({ 1: 'A' })
  })

  it('round-trips matching authoring without flattening its columns or answers', () => {
    const input = mutationFromQuestionForm({ ...EMPTY_QUESTION, questionType: 'matching', stem: 'Ghép cột.\n1. Một | A. Second\n2. Hai | B. First', structuredAnswers: '1-B; 2-A' })
    const item = { current: input, tags: [] } as unknown as QuestionBankItem
    const edited = questionFormFromItem(item, [])
    expect(mutationFromQuestionForm(edited).answerData).toEqual(input.answerData)
    expect(edited.questionType).toBe('matching')
  })

  it('prints both columns, hides answer mappings, and allocates space per essay subpart', () => {
    const questions = parseExamFromText(sample).questions
    const html = buildExamPaperHtml({ subject: 'Đề hỗn hợp', classLabel: 'Lớp 1', academicYear: '2026-2027', questions })
    expect(html).toContain('data-response-format="fill_blank"')
    expect(html).toContain('data-response-format="matching"')
    expect(html).toContain('Mục thứ nhất')
    expect(html).not.toContain('1-B')
    expect(html).not.toContain('yêu mến')
    expect(html).toContain('data-essay-answer-lines="9"')
    const teacher = buildExamPaperHtml({ subject: 'Đề', classLabel: 'Lớp 1', academicYear: '2026-2027', questions, showAnswerKey: true })
    expect(teacher).toContain('1-B; 2-A')
    const noKey = generateExamJsonString({ subject: 'Đề', questions, includeAnswerKey: false })
    expect(noKey).not.toContain('yêu mến')
    expect(noKey).not.toContain('leftId')
    expect(exportExamToText({ subject: 'Đề', questions, includeAnswerKey: false })).toContain('1. Mục thứ nhất | A. Ý thứ hai')
  })

  it('round-trips the new formats through the actual Excel export and import', async () => {
    const questions = parseExamFromText(sample).questions
    const buffer = await generateExamExcelWorkbook({ subject: 'Đề', questions })
    const result = await parseExamFromExcel(buffer)
    expect(result.questions.map(q => q.responseFormat)).toEqual([undefined, 'fill_blank', 'matching', undefined])
    expect(result.questions[1].answerData).toEqual(questions[1].answerData)
    expect(result.questions[2].answerData).toEqual(questions[2].answerData)
    const studentWorkbook = XLSX.read(await generateExamExcelWorkbook({ subject: 'Đề', questions, includeAnswerKey: false }), { type: 'array' })
    const studentContent = JSON.stringify(studentWorkbook.Sheets)
    expect(studentContent).not.toContain('yêu mến')
    expect(studentContent).not.toContain('1-B')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Loại', 'Nội dung', 'Đáp án'], ['Điền khuyết', 'Điền từ: Em sống {{1}}.', 'tốt']]), 'Đề')
    const reordered = await parseExamFromExcel(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
    expect(reordered.questions[0]).toMatchObject({ responseFormat: 'fill_blank', answerData: { blanks: [{ id: '1', acceptedAnswers: ['tốt'] }] } })
  })

  it.each([0, 1, 18, 100])('uses exactly %i writing lines instead of the automatic estimate', answerLineCount => {
    const q = { ...parseExamFromText(sample).questions[3], index: 1, answerLineCount }
    const html = buildExamPaperHtml({ subject: 'Số dòng', classLabel: 'Lớp 1', academicYear: '2026-2027', questions: [q] })
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelector('[data-essay-answer-lines]')?.getAttribute('data-essay-answer-lines')).toBe(String(answerLineCount))
    expect(doc.querySelectorAll('.essay-answer-line')).toHaveLength(answerLineCount)
    expect(getEssayAnswerLineCount({ ...q, answerLineCount: undefined })).toBe(9)
  })

  it('preserves explicit zero and a large writing area through Excel and bank editing', async () => {
    const essay = parseExamFromText(sample).questions[3]
    const questions = [0, 100].map((answerLineCount, idx) => ({ ...essay, index: idx + 1, answerLineCount }))
    const imported = await parseExamFromExcel(await generateExamExcelWorkbook({ subject: 'Dòng trả lời', questions }))
    expect(imported.questions.map(q => q.answerLineCount)).toEqual([0, 100])
    const mutation = mutationFromQuestionForm({ ...EMPTY_QUESTION, questionType: 'essay', stem: essay.question, answerLineCount: '0' })
    const edited = questionFormFromItem({ current: mutation, tags: [] } as unknown as QuestionBankItem, [])
    expect(edited.answerLineCount).toBe('0')
    expect(mutationFromQuestionForm(edited).answerData.answerLineCount).toBe(0)
    expect(mutationFromQuestionForm({ ...edited, answerLineCount: '' }).answerData.answerLineCount).toBeUndefined()
  })

  it('applies print-only overrides after resolving every variant without altering its saved manifest', () => {
    const questions = parseExamFromText(sample).questions.map(q => q.type === 'essay' && !q.responseFormat ? { ...q, answerLineCount: 12 } : q)
    const entry = { sourceQuestionOrder: [1, 2, 3, 4], sourceQuestionIds: ['q1', 'q2', 'q3', 'q4'], optionOrders: { 1: ['A', 'B', 'C', 'D'] }, questions, answerKey: { 1: 'B' }, contentHash: 'saved-content' }
    const manifest = { schemaVersion: 1, algorithmVersion: 'catevia-variant-v1', seed: 'lines', sourceHash: 'saved-source', generatedAt: '2026-10-22', variants: { A: { ...entry, version: 'A' }, B: { ...entry, version: 'B' } } } as ExamVariantManifestSet
    const saved = JSON.stringify(manifest)
    const options = { subject: 'Dòng in', questions, variantManifests: manifest, selectedVersion: 'ALL' as const, answerLineOverrides: { 4: 0 } }
    const doc = new DOMParser().parseFromString(generateExamWordHtml(options), 'text/html')
    expect(doc.querySelectorAll('[data-essay-answer-lines="0"]')).toHaveLength(2)
    expect(doc.querySelectorAll('.essay-answer-line')).toHaveLength(0)
    expect(generateExamWordHtml({ ...options, answerLineOverrides: { 4: null } })).toContain('data-essay-answer-lines="9"')
    expect(JSON.stringify(manifest)).toBe(saved)
  })

  it('marks answer-key-only imports so creation can skip synthetic bank content', () => {
    const imported = parseExamFromText('BẢNG ĐÁP ÁN:\n1B 2A')
    expect(imported.ok).toBe(true)
    expect(imported.questions).toHaveLength(2)
    expect(imported.questions.every(q => q.isPlaceholder)).toBe(true)
  })
})
