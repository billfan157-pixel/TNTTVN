import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseExamFromText,
  parseExamFromExcel,
  generateSampleExamTemplateText,
  generateSampleExcelWorkbook,
  scopeExamParseResult,
} from '../../utils/examParser'

describe('examParser utility', () => {
  it('1. Parses standard multi-line exam questions with Đáp án: X', () => {
    const text = `
    Câu 1: Bí tích nào là cội nguồn và chóp đỉnh của đời sống Kitô hữu?
    A. Bí tích Rửa Tội
    B. Bí tích Thánh Thể
    C. Bí tích Thêm Sức
    D. Bí tích Hòa Giải
    Đáp án: B

    Câu 2: Chúa Giêsu lập Bí tích Thánh Thể trong dịp nào?
    A. Tiệc cưới Cana
    B. Bữa Tiệc Ly
    C. Sau khi Người sống lại
    D. Trên đồi Can-vê
    Đ/A: B
    `
    const result = parseExamFromText(text)
    expect(result.ok).toBe(true)
    expect(result.questionCount).toBe(2)
    expect(result.answerKey[1]).toBe('B')
    expect(result.answerKey[2]).toBe('B')
    expect(result.questions[0].question).toContain('Bí tích nào là cội nguồn')
    expect(result.questions[0]?.type ?? 'multiple_choice').toBe('multiple_choice')
    expect(result.questions[0]?.options?.A).toBe('Bí tích Rửa Tội')
    expect(result.questions[0]?.options?.B).toBe('Bí tích Thánh Thể')
    expect(result.questions[1]?.options?.B).toBe('Bữa Tiệc Ly')
  })

  it('2. Parses inline marked correct answers (*A, [B])', () => {
    const text = `
    1. Mười Điều Răn Đức Chúa Trời được ban cho ai trên núi Sinai?
    *A. Ông Môsê
    B. Ông Abraham
    C. Vua Đavít
    D. Ngôn sứ Êlia

    2. Màu áo khăn quàng của Ngành Thiếu Nhi là màu gì?
    A. Màu hồng viền đỏ
    [B] Màu xanh biển viền vàng
    C. Màu đỏ viền trắng
    D. Màu tím
    `
    const result = parseExamFromText(text)
    expect(result.ok).toBe(true)
    expect(result.questionCount).toBe(2)
    expect(result.answerKey[1]).toBe('A')
    expect(result.answerKey[2]).toBe('B')
    expect(result.questions[0].correctOption).toBe('A')
    expect(result.questions[1].correctOption).toBe('B')
  })

  it('3. Parses end-of-text answer key summary', () => {
    const text = `
    Câu 1: Câu hỏi thứ nhất
    A. Đáp án 1A
    B. Đáp án 1B
    C. Đáp án 1C
    D. Đáp án 1D

    Câu 2: Câu hỏi thứ hai
    A. Đáp án 2A
    B. Đáp án 2B
    C. Đáp án 2C
    D. Đáp án 2D

    BẢNG ĐÁP ÁN TRẮC NGHIỆM:
    1C 2D
    `
    const result = parseExamFromText(text)
    expect(result.ok).toBe(true)
    expect(result.questionCount).toBe(2)
    expect(result.answerKey[1]).toBe('C')
    expect(result.answerKey[2]).toBe('D')
  })

  it('4. Parses sample exam template accurately (mẫu mixed 6 TN + 2 TL)', () => {
    const sample = generateSampleExamTemplateText()
    const result = parseExamFromText(sample)
    expect(result.ok).toBe(true)
    expect(result.questionCount).toBe(8)
    expect(result.mcQuestionCount).toBe(6)
    expect(result.essayQuestionCount).toBe(2)
    // Key chỉ gồm câu TN
    expect(result.answerKey[1]).toBe('B')
    expect(result.answerKey[2]).toBe('B')
    expect(result.answerKey[3]).toBe('B')
    expect(result.answerKey[4]).toBe('C')
    expect(result.answerKey[5]).toBe('B')
    expect(result.answerKey[6]).toBe('A')
    expect(result.answerKey[7]).toBeUndefined()
    expect(result.answerKey[8]).toBeUndefined()
    // Điểm: PHẦN I 3đ chia 6 câu = 0.5đ/câu; PHẦN II: câu 7 tự khai 3đ, câu 8 4đ
    expect(result.mcPoints).toBe(3)
    expect(result.essayPoints).toBe(7)
  })

  it('5. Parses Excel workbook correctly (mẫu 9 cột có Loại/Điểm gồm cả câu tự luận)', async () => {
    const buffer = await generateSampleExcelWorkbook()
    const result = await parseExamFromExcel(buffer)
    expect(result.ok).toBe(true)
    expect(result.questionCount).toBe(6)
    expect(result.mcQuestionCount).toBe(4)
    expect(result.essayQuestionCount).toBe(2)
    // Chỉ câu TN có đáp án trong key
    expect(result.answerKey[1]).toBe('B')
    expect(result.answerKey[2]).toBe('B')
    expect(result.answerKey[3]).toBe('A')
    expect(result.answerKey[4]).toBe('C')
    expect(result.answerKey[5]).toBeUndefined()
    expect(result.questions[0].question).toContain('Bí tích nào là cội nguồn')
    expect(result.questions[4]?.type).toBe('essay')
    expect(result.questions[4]?.points).toBe(4)
  })

  it('6. Handles empty text gracefully with error message', () => {
    const result = parseExamFromText('')
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  // QB-F1 (audit 2026-08-21): ô đáp án trống/không hợp lệ KHÔNG được trích chữ
  // [A-D] từ nội dung phương án A ("Bác Hồ" từng → B, "Du lịch biển" → D im lặng).
  it('7. QB-F1: Excel đáp án TRỐNG → mặc định A + warning, không trích chữ từ phương án', async () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Câu Số', 'Nội Dung', 'Lựa Chọn A', 'Lựa Chọn B', 'Lựa Chọn C', 'Lựa Chọn D', 'Đáp Án Đúng'],
      [1, 'Câu hỏi 1', 'Bác Hồ', 'Đáp án B', 'Đáp án C', 'Đáp án D', ''],
      [2, 'Câu hỏi 2', 'Du lịch biển', 'Đáp án B', 'Đáp án C', 'Đáp án D', null],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'S')
    const result = await parseExamFromExcel(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer)

    expect(result.questions[0].correctOption).toBe('A')
    expect(result.answerKey[1]).toBe('A')
    expect(result.questions[1].correctOption).toBe('A')
    expect(result.warnings.filter(w => w.includes('Mặc định gán là A'))).toHaveLength(2)
  })

  it('8. QB-F1: Excel đáp án dạng dài hợp lệ "Đáp án: C" → C; rác hoàn toàn → A + warning', async () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Câu Số', 'Nội Dung', 'Lựa Chọn A', 'Lựa Chọn B', 'Lựa Chọn C', 'Lựa Chọn D', 'Đáp Án Đúng'],
      [1, 'Câu 1', 'PA A', 'PA B', 'PA C', 'PA D', 'Đáp án: C'],
      [2, 'Câu 2', 'PA A', 'PA B', 'PA C', 'PA D', 'xyz'],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'S')
    const result = await parseExamFromExcel(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer)

    expect(result.answerKey[1]).toBe('C')
    expect(result.questions[1].correctOption).toBe('A')
    expect(result.warnings.some(w => w.includes('không hợp lệ'))).toBe(true)
  })

  // ─── EXAM-MIXED (2026-08-24): đề kết hợp trắc nghiệm + tự luận ───

  it('9. EXAM-MIXED: text PHẦN TN + PHẦN TL — tách loại câu, key chỉ gồm câu TN', () => {
    const text = `ĐỀ KIỂM TRA THỬ
PHẦN I. TRẮC NGHIỆM (2 điểm)

Câu 1: Chúa lập bí tích nào?
A. Rửa Tội
*B. Thánh Thể
C. Thêm Sức
D. Hòa Giải

Câu 2: Ai truyền chức linh mục?
A. Cha quản xứ
B. Đức Giám Mục
Đáp án: B

PHẦN II. TỰ LUẬN (8 điểm)

Câu 3: Trình bày ý nghĩa Bí tích Thánh Thể.

Câu 4 (5 điểm): Nêu 4 khẩu hiệu của Phong trào TNTT.
`
    const result = parseExamFromText(text)
    expect(result.ok).toBe(true)
    expect(result.mcQuestionCount).toBe(2)
    expect(result.essayQuestionCount).toBe(2)
    expect(result.questionCount).toBe(4)
    // Key CHỈ gồm câu TN
    expect(Object.keys(result.answerKey).sort()).toEqual(['1', '2'])
    expect(result.answerKey[1]).toBe('B')
    expect(result.answerKey[2]).toBe('B')
    // Câu TL không có options/correctOption
    const essay = result.questions.find(q => q.index === 3)
    expect(essay?.type).toBe('essay')
    expect(essay?.options).toBeUndefined()
    expect(essay?.correctOption).toBeUndefined()
    // Điểm: phần TN chia đều 1đ/câu; phần TL chia đều 8đ/2 câu = 4đ;
    // câu 4 khai báo riêng 5đ → câu 3 nhận trọn 8đ từ tiêu đề phần.
    expect(result.questions.find(q => q.index === 1)?.points).toBe(1)
    expect(result.questions.find(q => q.index === 4)?.points).toBe(5)
    expect(result.essayPoints).toBe(13)
    expect(result.totalPoints).toBe(15)
  })

  it('10. EXAM-MIXED: đề thuần TN KHÔNG có tiêu đề phần giữ nguyên behavior cũ', () => {
    const pureMcText = `ĐỀ KIỂM TRA THUẦN TRẮC NGHIỆM
Câu 1: Chúa lập bí tích nào?
A. Rửa Tội
*B. Thánh Thể
C. Thêm Sức
D. Hòa Giải

Câu 2: Ai truyền chức linh mục?
A. Cha quản xứ
B. Đức Giám Mục
Đáp án: B
`
    const result = parseExamFromText(pureMcText)
    expect(result.ok).toBe(true)
    expect(result.essayQuestionCount).toBe(0)
    expect(result.mcQuestionCount).toBe(result.questionCount)
    expect(Object.keys(result.answerKey)).toHaveLength(result.mcQuestionCount)
    // Tương thích ngược: câu hỏi cũ không bị gắn type 'essay'
    expect(result.questions[0]?.type ?? 'multiple_choice').toBe('multiple_choice')
  })

  it('11. EXAM-MIXED: mẫu đề mẫu text = 6 TN + 2 TL với điểm đúng', () => {
    const result = parseExamFromText(generateSampleExamTemplateText())
    expect(result.mcQuestionCount).toBe(6)
    expect(result.essayQuestionCount).toBe(2)
    expect(result.answerKey[7]).toBeUndefined()
    const essay7 = result.questions.find(q => q.index === 7)
    expect(essay7?.type).toBe('essay')
    expect(essay7?.points).toBe(3)
    // Gỡ chú thích "(3 điểm)" khỏi nội dung hiển thị
    expect(essay7?.question).not.toContain('(3 điểm)')
  })

  it('12. detectSectionMode: nhận diện tiêu đề phần, không bắt nhầm nội dung câu hỏi', async () => {
    const { detectSectionMode } = await import('../../utils/examParser')
    expect(detectSectionMode('PHẦN I. TRẮC NGHIỆM (3 điểm)')).toBe('multiple_choice')
    expect(detectSectionMode('II. TỰ LUẬN')).toBe('essay')
    expect(detectSectionMode('Phần tự luận')).toBe('essay')
    expect(detectSectionMode('BÀI LÀM')).toBeNull()
    expect(detectSectionMode('Câu 5: Kể lại phép tính lòng nhân hậu của Chúa (7 điểm)')).toBeNull()
  })

  // ─── ESSAY-DECODE (2026-09-23): đề tự luận KHÔNG tiêu đề phần ───
  // Lỗi gốc: decode thành TN với phương án giả + đáp án A → ô "Phần Tự Luận"
  // báo "Không tìm thấy câu hỏi tự luận nào" (không import được).

  it('13. ESSAY-DECODE: đề tự luận không tiêu đề — intent essay → toàn bộ là TL', () => {
    const text = `Câu 1 (3 điểm): Trình bày ý nghĩa của Bí tích Thánh Thể đối với đời sống thiếu nhi TNTT.

Câu 2 (4 điểm): Nêu 4 khẩu hiệu của Phong trào TNTT và ý nghĩa với đời sống hằng ngày.
`
    const result = parseExamFromText(text, { intent: 'essay' })
    expect(result.ok).toBe(true)
    expect(result.questionCount).toBe(2)
    expect(result.essayQuestionCount).toBe(2)
    expect(result.mcQuestionCount).toBe(0)
    // Không phương án giả, không đáp án giả
    expect(Object.keys(result.answerKey)).toHaveLength(0)
    expect(result.questions[0]?.type).toBe('essay')
    expect(result.questions[0]?.points).toBe(3)
    expect(result.questions[1]?.points).toBe(4)
    expect(result.detectedForm).toBe('essay')
  })

  it('14. ESSAY-DECODE: đề tự luận đánh số trần "1." "2." với câu hỏi con — không tách nhầm', () => {
    const text = `Câu 1: Trình bày các nội dung sau (6 điểm):
1. Ý nghĩa của Bí tích Rửa Tội.
2. Vai trò của người đỡ đầu.

Câu 2 (4 điểm): Nêu 4 khẩu hiệu TNTT.
`
    const result = parseExamFromText(text, { intent: 'essay' })
    expect(result.ok).toBe(true)
    // Câu hỏi con "1."/"2." trong Câu 1 KHÔNG bị tách thành câu mới
    expect(result.questionCount).toBe(2)
    expect(result.essayQuestionCount).toBe(2)
    expect(result.questions[0]?.question).toContain('Ý nghĩa của Bí tích Rửa Tội')
    expect(result.totalPoints).toBe(10)
  })

  it('15. ESSAY-DECODE: khối BIỂU ĐIỂM/ĐÁP ÁN cuối đề + dòng "Đáp án:" trong câu → tách sang Lời giải', () => {
    const text = `Câu 1 (5 điểm): Nêu 4 khẩu hiệu TNTT.
Đáp án: Cầu Nguyện - Rước Lễ - Hy Sinh - Làm Tông Đồ (mỗi ý 1,25đ).

BIỂU ĐIỂM VÀ HƯỚNG DẪN CHẤM:
Câu 1: 4 ý đúng được 5 điểm.
`
    const result = parseExamFromText(text, { intent: 'essay' })
    expect(result.ok).toBe(true)
    // Khối biểu điểm cuối đề KHÔNG thành câu hỏi rác
    expect(result.questionCount).toBe(1)
    expect(result.questions[0]?.type).toBe('essay')
    // Dòng "Đáp án: ..." tách khỏi đề cho học sinh, chuyển vào Lời giải
    expect(result.questions[0]?.question).not.toContain('Đáp án:')
    expect(result.questions[0]?.explanation).toContain('Cầu Nguyện')
    expect(result.warnings.some(w => w.includes('Lời giải'))).toBe(true)
  })

  it('16. ESSAY-DECODE: đề gộp dán chung không tiêu đề — dãy TL cuối được cứu (intent essay)', () => {
    const text = `Câu 1: Chúa lập bí tích nào?
A. Rửa Tội
*B. Thánh Thể
C. Thêm Sức
D. Hòa Giải

Câu 2 (4 điểm): Nêu 4 khẩu hiệu TNTT và ý nghĩa với đời sống hằng ngày.
`
    const result = parseExamFromText(text, { intent: 'essay' })
    expect(result.ok).toBe(true)
    const scoped = scopeExamParseResult(result, 'essay')
    expect(scoped.ok).toBe(true)
    expect(scoped.essayQuestionCount).toBe(1)
    expect(scoped.questions[0]?.points).toBe(4)
  })

  it('17. ESSAY-DECODE: Excel 2 cột (Câu, Nội dung) không Loại/A–D → toàn bộ là TL', async () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Câu Số', 'Nội Dung Câu Hỏi'],
      [1, 'Trình bày ý nghĩa Bí tích Thánh Thể.'],
      [2, 'Nêu 4 khẩu hiệu TNTT.'],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'TuLuan')
    const result = await parseExamFromExcel(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer)
    expect(result.ok).toBe(true)
    expect(result.questionCount).toBe(2)
    expect(result.essayQuestionCount).toBe(2)
    expect(result.mcQuestionCount).toBe(0)
    expect(Object.keys(result.answerKey)).toHaveLength(0)
    expect(result.questions[0]?.question).toContain('Thánh Thể')
  })

  it('18. ESSAY-DECODE: Excel cột Nội dung ở vị trí khác (STT, Loại, Đề bài...) → vẫn đọc đúng', async () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['STT', 'Loại', 'Đề bài tự luận', 'Điểm'],
      [1, 'Tự luận', 'Trình bày ý nghĩa Bí tích Thánh Thể.', 4],
      [2, 'Tự luận', 'Nêu 4 khẩu hiệu TNTT.', 6],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'TuLuan')
    const result = await parseExamFromExcel(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer)
    expect(result.ok).toBe(true)
    expect(result.essayQuestionCount).toBe(2)
    expect(result.questions[0]?.question).toContain('Thánh Thể')
    expect(result.questions[1]?.points).toBe(6)
  })
})

// ─── UI-POLISH 2026-08-25: 2 ô import riêng (Trắc nghiệm / Tự luận) ───
describe('scopeExamParseResult (import theo phần)', () => {
  const combined = parseExamFromText(generateSampleExamTemplateText()) // 6 TN + 2 TL

  it('1. scope multiple_choice: giữ 6 câu TN, bỏ TL kèm warning, answerKey nguyên vẹn', () => {
    const scoped = scopeExamParseResult(combined, 'multiple_choice')
    expect(scoped.ok).toBe(true)
    expect(scoped.mcQuestionCount).toBe(6)
    expect(scoped.essayQuestionCount).toBe(0)
    expect(scoped.questionCount).toBe(6)
    expect(scoped.answerKey[1]).toBe('B')
    expect(scoped.answerKey[6]).toBe('A')
    expect(scoped.questions.every(q => (q.type ?? 'multiple_choice') === 'multiple_choice')).toBe(true)
    expect(scoped.warnings.some(w => w.includes('tự luận'))).toBe(true)
  })

  it('2. scope essay: giữ 2 câu TL đánh lại index 1..2, answerKey rỗng, điểm đúng', () => {
    const scoped = scopeExamParseResult(combined, 'essay')
    expect(scoped.ok).toBe(true)
    expect(scoped.essayQuestionCount).toBe(2)
    expect(scoped.mcQuestionCount).toBe(0)
    expect(scoped.questionCount).toBe(2)
    expect(Object.keys(scoped.answerKey)).toHaveLength(0)
    expect(scoped.questions[0]?.index).toBe(1)
    expect(scoped.questions[0]?.type).toBe('essay')
    expect(scoped.questions[0]?.points).toBe(3)
    expect(scoped.questions[1]?.index).toBe(2)
    expect(scoped.essayPoints).toBe(7)
    expect(scoped.warnings.some(w => w.includes('trắc nghiệm'))).toBe(true)
  })

  it('3. scope both: trả nguyên kết quả (same reference)', () => {
    expect(scopeExamParseResult(combined, 'both')).toBe(combined)
  })

  it('4. Đề chỉ có TN + scope essay → ok=false với lỗi hướng dẫn', () => {
    const mcOnly = parseExamFromText(`Câu 1: Test?
A. A
*B. B
C. C
D. D
`)
    const scoped = scopeExamParseResult(mcOnly, 'essay')
    expect(scoped.ok).toBe(false)
    expect(scoped.questions).toHaveLength(0)
    expect(scoped.errors[0]).toContain('tự luận')
  })

  it('5. Đề chỉ có TL + scope multiple_choice → ok=false với lỗi hướng dẫn', () => {
    const essayOnly = parseExamFromText(`PHẦN TỰ LUẬN (7 điểm)
Câu 1 (3 điểm): Trình bày ý nghĩa Bí tích Thánh Thể.
`)
    const scoped = scopeExamParseResult(essayOnly, 'multiple_choice')
    expect(scoped.ok).toBe(false)
    expect(scoped.errors[0]).toContain('trắc nghiệm')
  })

  it('6. Mẫu đề theo scope: TN-only / TL-only parse đúng phần tương ứng', () => {
    const mcSample = parseExamFromText(generateSampleExamTemplateText('multiple_choice'))
    expect(mcSample.mcQuestionCount).toBe(6)
    expect(mcSample.essayQuestionCount).toBe(0)

    const essaySample = parseExamFromText(generateSampleExamTemplateText('essay'))
    expect(essaySample.essayQuestionCount).toBe(2)
    expect(essaySample.mcQuestionCount).toBe(0)
    expect(essaySample.essayPoints).toBe(7)
  })
})
