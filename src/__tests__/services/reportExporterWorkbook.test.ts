import { describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'

const { writeFileMock } = vi.hoisted(() => ({ writeFileMock: vi.fn() }))

vi.mock('../../lib/xlsxLoader', () => ({
  loadXlsx: async () => ({ ...XLSX, writeFile: writeFileMock }),
}))

import { exportXlsx } from '../../services/reportExporter'

describe('real XLSX worksheet serialization', () => {
  it('keeps formula-looking student text as string cells with no formula', async () => {
    await exportXlsx('gradebook', 'Bảng điểm', [
      { 'Mã TN': '=HYPERLINK("https://example.invalid")', 'Họ và Tên': '+cmd', 'ĐTB': 9 },
    ])

    expect(writeFileMock).toHaveBeenCalledOnce()
    const [workbook, filename] = writeFileMock.mock.calls[0] as [XLSX.WorkBook, string]
    expect(filename).toBe('gradebook.xlsx')
    const worksheet = workbook.Sheets['Bảng điểm']
    expect(worksheet.A2).toMatchObject({ t: 's', v: '=HYPERLINK("https://example.invalid")' })
    expect(worksheet.B2).toMatchObject({ t: 's', v: '+cmd' })
    expect(worksheet.C2).toMatchObject({ t: 'n', v: 9 })
    expect(worksheet.A2.f).toBeUndefined()
    expect(worksheet.B2.f).toBeUndefined()

    const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    const readBack = XLSX.read(bytes, { type: 'buffer' }).Sheets['Bảng điểm']
    expect(readBack.A2.f).toBeUndefined()
    expect(readBack.A2.v).toBe('=HYPERLINK("https://example.invalid")')
  })
})
