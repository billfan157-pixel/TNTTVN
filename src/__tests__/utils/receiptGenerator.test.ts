import { describe, it, expect } from 'vitest'
import {
  numberToVietnameseWords,
  formatVND,
  buildReceiptHtml,
} from '../../utils/receiptGenerator'

describe('Vietnamese Currency & Receipt Generator Utility', () => {
  it('converts small amounts into accurate Vietnamese words', () => {
    expect(numberToVietnameseWords(0)).toBe('Không đồng')
    expect(numberToVietnameseWords(50000)).toBe('Năm mươi nghìn đồng chẵn.')
    expect(numberToVietnameseWords(100000)).toBe('Một trăm nghìn đồng chẵn.')
    expect(numberToVietnameseWords(150000)).toBe('Một trăm năm mươi nghìn đồng chẵn.')
  })

  it('converts million and complex amounts correctly', () => {
    expect(numberToVietnameseWords(1250000)).toBe('Một triệu hai trăm năm mươi nghìn đồng chẵn.')
    expect(numberToVietnameseWords(15005000)).toBe('Mười lăm triệu không trăm lẻ năm nghìn đồng chẵn.')
  })

  it('formats currency with VND symbol and thousand separators', () => {
    const formatted = formatVND(150000)
    expect(formatted).toContain('150.000')
  })

  it('builds official Catholic receipt HTML voucher with 4 signatures', () => {
    const html = buildReceiptHtml({
      type: 'INCOME',
      receiptNumber: 'PT-2026-001',
      date: '2026-08-15',
      personName: 'Ông Giuse Trần Văn B',
      amount: 500000,
      category: 'Ủng hộ',
      title: 'Tài trợ liên hoan Trung Thu',
      fundName: 'Quỹ Chung Xứ Đoàn',
      recordedByName: 'Thủ Quỹ Maria',
    })

    expect(html).toContain('PHIẾU THU')
    expect(html).toContain('PT-2026-001')
    expect(html).toContain('Ông Giuse Trần Văn B')
    expect(html).toContain('Năm trăm nghìn đồng chẵn.')
    expect(html).toContain('Cha Tuyên Úy')
    expect(html).toContain('Xứ Đoàn Trưởng')
    expect(html).toContain('Thủ Quỹ')
  })
})
