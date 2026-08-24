import type * as XLSXTypes from 'xlsx'
import type { Student } from '../types'
import { loadXlsx } from '../lib/xlsxLoader'

export class GradeTemplateBuilder {
  public static async createWorksheet(className: string, roster: Student[]): Promise<XLSXTypes.WorkBook> {
    // PERF-XLSX-1: lazy-load xlsx — chunk chỉ tải khi user tải mẫu.
    const XLSX = await loadXlsx()
    const headers = [
      'STT',
      'Mã Thiếu Nhi',
      'Tên Thánh',
      'Họ và Tên',
      'Điểm Miệng',
      '15 Phút',
      '1 Tiết',
      'Thi Giữa Kỳ',
      'Thi Cuối Kỳ',
      'Đạo Đức',
      'Ghi Chú',
    ]

    const activeRoster = roster.filter((s) => !s.deletedAt && s.classId === className)
    const rows = activeRoster.map((s, idx) => [
      idx + 1,
      s.code,
      s.holyName || '',
      s.fullName,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ])

    const wsData = [headers, ...rows]
    const worksheet = XLSX.utils.aoa_to_sheet(wsData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, `Bảng Điểm ${className}`)
    return workbook
  }
}

export class StudentTemplateBuilder {
  public static async createWorksheet(): Promise<XLSXTypes.WorkBook> {
    const XLSX = await loadXlsx()
    const headers = [
      'Mã TN',
      'Tên Thánh',
      'Họ và Tên',
      'Phái',
      'Ngày Sinh (YYYY-MM-DD)',
      'Phụ Huynh',
      'SĐT Phụ Huynh',
      'Địa Chỉ',
      'Lớp',
      'Ngành',
    ]

    const sampleRow = [
      'TN001',
      'Phêrô',
      'Nguyễn Văn A',
      'Nam',
      '2015-05-15',
      'Nguyễn Văn B',
      '0901234567',
      '123 Đường Lớn',
      'AU1',
      'AuNhi',
    ]

    const wsData = [headers, sampleRow]
    const worksheet = XLSX.utils.aoa_to_sheet(wsData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mẫu Nhập Thiếu Nhi')
    return workbook
  }
}
