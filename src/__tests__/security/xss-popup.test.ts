import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateStudentReportCardHTML,
  generateSacramentCertificateHTML,
  generateClassGradebookHTML,
} from '../../utils/pdfGenerator'
import { buildQrSheetHtml, printQrSheet } from '../../utils/examSheets'
import { ReportExportService } from '../../services/reportExportService'
import { getCurrentAcademicYear } from '../../utils/academicYear'
import type { Student, GradeRecord, AttendanceRecord } from '../../types'

// SECURITY_AUDIT_A01 Phase 2 — các builder HTML cho popup/print phải neutral hóa
// dữ liệu user (escapeHtml), KHÔNG document.write dữ liệu thô, popup dùng Blob URL.

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

const EVIL = '<script>alert(1)</script>'
const activeAY = getCurrentAcademicYear()

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'ST-1', code: 'TN001', holyName: 'Giuse', fullName: 'Nguyễn Văn A',
    gender: 'Nam', dateOfBirth: '2015-01-01', parentName: 'Phụ Huynh A',
    parentPhone: '0901234567', address: 'X', branch: 'ThieuNhi', classId: 'CL-TN1',
    status: 'Đang học', ...overrides,
  }
}

function makeGrade(): GradeRecord {
  return {
    id: 'GR-1', studentId: 'ST-1', academicYear: activeAY, semester: 1,
    scoreOral: 9.0, scoreOral_source: 'manual', scoreOral_updated_at: null,
    score15m: null, score15m_source: null, score15m_updated_at: null,
    score1Period: null, score1Period_source: null, score1Period_updated_at: null,
    scoreMidterm: null, scoreMidterm_source: null, scoreMidterm_updated_at: null,
    scoreFinal: null, scoreFinal_source: null, scoreFinal_updated_at: null,
    scoreDaoDuc: null,
  }
}

function makeAttendance(date: string): AttendanceRecord {
  return { id: `ATT-${date}`, studentId: 'ST-1', date, type: 'CatechismClass', status: 'Present' }
}

const options = { academicYear: activeAY, parishName: 'Giáo Xứ Gia Tôn', dioceseName: 'Giáo Phận Xuân Lộc' }

describe('A01 Phase 2 — popup HTML builders không nhúng dữ liệu user thô', () => {
  it('generateStudentReportCardHTML escape họ tên/ghi chú độc hại — không còn thẻ <script>', () => {
    const evilStudent = makeStudent({ fullName: EVIL, holyName: EVIL, parentName: EVIL, parentPhone: EVIL })
    const html = generateStudentReportCardHTML(evilStudent, [makeGrade()], [makeAttendance('2026-08-01')], options)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain(EVIL)
    expect(html).toContain('&lt;script&gt;')
  })

  it('generateSacramentCertificateHTML escape họ tên', () => {
    const html = generateSacramentCertificateHTML(makeStudent({ fullName: EVIL, holyName: EVIL }), options)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('generateClassGradebookHTML escape toàn bộ học sinh trong sổ điểm', () => {
    const students = [
      makeStudent({ id: 'ST-1', fullName: EVIL }),
      makeStudent({ id: 'ST-2', holyName: `"><img src=x onerror=alert(1)>`, fullName: 'Bình' }),
    ]
    const html = generateClassGradebookHTML('CL-TN1', students, [], [], options)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
  })

  it('buildQrSheetHtml escape title/name/code/payload (popup about:blank không CSP)', () => {
    const qr = [{ payload: `"><script>alert(1)</script>`, svg: '<rect width="1"/>', name: `<script>alert('x')</script>`, code: `"><svg onload=alert(1)>` }]
    const html = buildQrSheetHtml(`Lớp ${EVIL}`, qr)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<svg onload=')
    expect(html).toContain('&lt;script&gt;')
    // SVG do app sinh (qrcode-generator) vẫn được giữ nguyên — chỉ có <rect>
    expect(html).toContain('<rect width="1"/>')
  })
})

describe('A01 Phase 2 — ReportExportService không còn document.write', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock-report'), revokeObjectURL: vi.fn() })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('preview: popup nhận Blob URL qua location.href — document.write không được gọi', () => {
    const fakePopup = {
      document: { write: vi.fn(), close: vi.fn(), open: vi.fn() },
      location: { href: '' },
      focus: vi.fn(),
    }
    vi.spyOn(window, 'open').mockReturnValue(fakePopup as unknown as Window)
    const ok = ReportExportService.preview('<html><body>hello</body></html>')
    expect(ok).toBe(true)
    expect(fakePopup.document.write).not.toHaveBeenCalled()
    expect(fakePopup.document.open).not.toHaveBeenCalled()
    expect(fakePopup.location.href).toBe('blob:mock-report')
    expect(fakePopup.focus).toHaveBeenCalled()
  })

  it('print: popup dùng Blob URL + onload in đúng 1 lần — không document.write', () => {
    const fakePopup = {
      document: { write: vi.fn(), close: vi.fn(), open: vi.fn() },
      location: { href: '' },
      focus: vi.fn(),
      print: vi.fn(),
    }
    vi.spyOn(window, 'open').mockReturnValue(fakePopup as unknown as Window)
    ReportExportService.print('<html><body>print me</body></html>')
    expect(fakePopup.document.write).not.toHaveBeenCalled()
    expect(fakePopup.location.href).toBe('blob:mock-report')
    // mô phỏng load event của popup
    ;(fakePopup as any).onload?.()
    expect(fakePopup.print).toHaveBeenCalledTimes(1)
  })

  it('print - popup bị chặn: fallback iframe dùng Blob URL (không srcdoc kế thừa CSP), không document.write', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const html = '<html><body>fallback</body></html>'
    ReportExportService.print(html)
    const iframe = document.querySelector('iframe')
    expect(iframe).toBeTruthy()
    // A-NEW-23: srcdoc kế thừa CSP parent (style-src 'self' chặn <style> element) →
    // fallback phải dùng Blob URL — document riêng, <style> inline vẫn chạy.
    expect((iframe as HTMLIFrameElement).srcdoc).toBe('')
    expect((iframe as HTMLIFrameElement).src).toBe('blob:mock-report')
    expect(document.body.innerHTML).toContain('iframe')
  })
})

describe('A-NEW-03 — printQrSheet (ExamSessionView) không còn document.write', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock-qr-sheet'), revokeObjectURL: vi.fn() })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('popup nhận HTML qua Blob URL + onload in đúng 1 lần — document.write không được gọi', () => {
    const fakePopup = {
      document: { write: vi.fn(), close: vi.fn(), open: vi.fn() },
      location: { href: '' },
      focus: vi.fn(),
      print: vi.fn(),
      onload: null as (() => void) | null,
    }
    vi.spyOn(window, 'open').mockReturnValue(fakePopup as unknown as Window)
    printQrSheet('Lớp TN1', [{ payload: 'ST-1', svg: '<rect width="1"/>', name: 'A', code: 'TN001' }])
    expect(fakePopup.document.write).not.toHaveBeenCalled()
    expect(fakePopup.location.href).toBe('blob:mock-qr-sheet')
    fakePopup.onload?.()
    expect(fakePopup.print).toHaveBeenCalledTimes(1)
  })

  it('popup bị chặn (null) → không throw', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(() => printQrSheet('Lớp TN1', [])).not.toThrow()
  })
})
