import { describe, expect, it, vi } from 'vitest'
import { parseQuestionBankFile, toQuestionBankImportItems } from '../utils/questionBankImport'

const extractDocxText = vi.fn(async (_buffer: ArrayBuffer) => ({
  value: `
Câu 1: Bí tích nào là nguồn mạch đời sống Kitô hữu?
A. Rửa Tội
B. Thánh Thể
C. Thêm Sức
D. Hòa Giải
Đáp án: B

PHẦN II. TỰ LUẬN
Câu 2: Trình bày ý nghĩa Bí tích Thánh Thể.
`,
  messages: [{ type: 'warning', message: 'Ảnh trong file không được nhập.' }],
}))

vi.mock('../utils/examDocxText', () => ({ extractExamDocxText: (buffer: ArrayBuffer) => extractDocxText(buffer) }))

describe('Question Bank document import', () => {
  it('extracts DOCX raw text lazily and maps a mixed file to draft import inputs', async () => {
    const file = new File(['docx-placeholder'], 'de-thieu-nhi.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(16) })

    const parsed = await parseQuestionBankFile(file)
    expect(extractDocxText).toHaveBeenCalledWith(expect.any(ArrayBuffer))
    expect(parsed.kind).toBe('word')
    expect(parsed.parsed.ok).toBe(true)
    expect(parsed.parsed.mcQuestionCount).toBe(1)
    expect(parsed.parsed.essayQuestionCount).toBe(1)
    expect(parsed.extractorWarnings).toEqual(['Ảnh trong file không được nhập.'])

    const items = toQuestionBankImportItems(parsed, {
      branchId: 'branch-thieu-nhi',
      curriculumLevel: 'Thiếu Nhi 1',
      difficulty: 'understanding',
      tags: ['thánh thể'],
      lesson: 'Bài 3',
    })
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      questionType: 'multiple_choice',
      branchId: 'branch-thieu-nhi',
      curriculumLevel: 'Thiếu Nhi 1',
      provenance: 'import',
      answerData: { correctOptionIds: ['B'] },
    })
    expect(items[1]).toMatchObject({ questionType: 'essay', answerData: { rubric: null }, provenance: 'import' })
  })

  it('preserves multipart stems and the detached marking rubric in bank inputs', async () => {
    extractDocxText.mockResolvedValueOnce({ value: 'PHẦN TỰ LUẬN\nCâu 1 (4 điểm): Trình bày:\na) Ý nghĩa.\nb) Liên hệ.\nHướng dẫn chấm: a) Đúng khái niệm. b) Có ví dụ.', messages: [] })
    const file = new File(['placeholder'], 'multipart.docx')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(16) })
    const result = await parseQuestionBankFile(file)
    const [item] = toQuestionBankImportItems(result, { branchId: 'branch-thieu', curriculumLevel: 'Thiếu Nhi 1', difficulty: 'understanding' })
    expect(item.questionType).toBe('essay')
    expect(item.stem).toBe('Trình bày:\na) Ý nghĩa.\nb) Liên hệ.')
    expect(item.answerData).toEqual({ rubric: 'a) Đúng khái niệm.\nb) Có ví dụ.' })
    expect(item.explanation).toBe('a) Đúng khái niệm.\nb) Có ví dụ.')
  })

  it('rejects unsupported and oversized files before parsing', async () => {
    await expect(parseQuestionBankFile(new File(['legacy'], 'de-thi.doc'))).rejects.toThrow('Chỉ hỗ trợ')
    const oversized = new File(['x'], 'de-thi.docx')
    Object.defineProperty(oversized, 'size', { value: 5 * 1024 * 1024 + 1 })
    await expect(parseQuestionBankFile(oversized)).rejects.toThrow('5 MB')
    expect(extractDocxText).toHaveBeenCalledTimes(2)
  })
})
