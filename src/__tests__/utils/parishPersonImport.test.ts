import { describe, expect, it } from 'vitest'
import { MAX_PARISH_PERSON_IMPORT_ROWS, parseParishPersonImport } from '../../utils/parishPersonImport'

describe('parish personnel import parser', () => {
  it('parses quoted CSV and Vietnamese status without truncating commas', () => {
    const [row] = parseParishPersonImport('Giuse,Nguyễn Văn An,1995,Mãn nhiệm,"Phục vụ từ 2018, ngành Thiếu"', 2026)
    expect(row.valid).toBe(true)
    expect(row.data).toMatchObject({
      holyName: 'Giuse',
      fullName: 'Nguyễn Văn An',
      birthYear: 1995,
      serviceStatus: 'FORMER',
      biography: 'Phục vụ từ 2018, ngành Thiếu',
    })
  })

  it.each([
    ['Giuse,Nguyễn Văn An,19xx,Đang phục vụ', /4 chữ số/],
    ['Giuse,Nguyễn Văn An,2027,Đang phục vụ', /1900 đến 2026/],
    ['Giuse,Nguyễn Văn An,1995,Không rõ', /không hợp lệ/],
    ['Giuse,Nguyễn Văn An,1995,Đang phục vụ,a,b', /quá 5 cột/],
    ['Giuse,"Nguyễn Văn An,1995,Đang phục vụ', /chưa đóng/],
  ])('rejects invalid input: %s', (input, error) => {
    const [row] = parseParishPersonImport(input, 2026)
    expect(row.valid).toBe(false)
    expect(row.error).toMatch(error)
  })

  it('rejects the whole preview above the atomic server limit', () => {
    const text = Array.from({ length: MAX_PARISH_PERSON_IMPORT_ROWS + 1 }, (_, index) => `Tên ${index}`).join('\n')
    const rows = parseParishPersonImport(text, 2026)
    expect(rows).toHaveLength(1)
    expect(rows[0].valid).toBe(false)
    expect(rows[0].error).toMatch(/Tối đa 100/)
  })
})
