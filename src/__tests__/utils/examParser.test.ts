import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseExamFromText,
  parseExamFromExcel,
  generateSampleExamTemplateText,
  generateSampleExcelWorkbook,
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
    expect(result.questions[0].options.A).toBe('Bí tích Rửa Tội')
    expect(result.questions[0].options.B).toBe('Bí tích Thánh Thể')
    expect(result.questions[1].options.B).toBe('Bữa Tiệc Ly')
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

  it('4. Parses sample exam template accurately', () => {
    const sample = generateSampleExamTemplateText()
    const result = parseExamFromText(sample)
    expect(result.ok).toBe(true)
    expect(result.questionCount).toBe(10)
    expect(result.answerKey[1]).toBe('B')
    expect(result.answerKey[2]).toBe('B')
    expect(result.answerKey[3]).toBe('B')
    expect(result.answerKey[4]).toBe('A')
    expect(result.answerKey[5]).toBe('C')
    expect(result.answerKey[6]).toBe('B')
    expect(result.answerKey[7]).toBe('A')
    expect(result.answerKey[8]).toBe('B')
    expect(result.answerKey[9]).toBe('B')
    expect(result.answerKey[10]).toBe('C')
  })

  it('5. Parses Excel workbook correctly', async () => {
    const buffer = await generateSampleExcelWorkbook()
    const result = await parseExamFromExcel(buffer)
    expect(result.ok).toBe(true)
    expect(result.questionCount).toBe(5)
    expect(result.answerKey[1]).toBe('B')
    expect(result.answerKey[2]).toBe('B')
    expect(result.answerKey[3]).toBe('A')
    expect(result.answerKey[4]).toBe('C')
    expect(result.answerKey[5]).toBe('A')
    expect(result.questions[0].question).toContain('Bí tích nào là cội nguồn')
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
})
