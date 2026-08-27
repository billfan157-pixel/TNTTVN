import { describe, expect, it } from 'vitest'
import { escapeSpreadsheetCell, rowsToSafeCsv } from '../../utils/csv'

describe('CSV spreadsheet injection hardening', () => {
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)', '\t=1+1', '＝1+1'])(
    'forces formula-looking value %s to text',
    (value) => expect(escapeSpreadsheetCell(value)).toBe(`"\t${value}"`),
  )

  it('quotes fields and doubles embedded quotes', () => {
    expect(escapeSpreadsheetCell('Nguyễn "An", A')).toBe('"Nguyễn ""An"", A"')
  })

  it('exports every header and cell through the safe encoder', () => {
    const csv = rowsToSafeCsv([{ name: '=HYPERLINK("x")', error: 'Sai, dữ liệu' }])
    expect(csv).toContain('"\t=HYPERLINK(""x"")"')
    expect(csv).toContain('"Sai, dữ liệu"')
  })
})
