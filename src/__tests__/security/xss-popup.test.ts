import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import {
  generateStudentReportCardHTML,
  generateSacramentCertificateHTML,
  generateClassGradebookHTML,
} from '../../utils/pdfGenerator'
import { buildQrSheetHtml, printQrSheet } from '../../utils/examSheets'
import { ReportExportService } from '../../services/reportExportService'
import { getCurrentAcademicYear } from '../../utils/academicYear'
import type { Student, GradeRecord, AttendanceRecord } from '../../types'
import { buildReceiptHtml, printReceipt, type ReceiptPrintData } from '../../utils/receiptGenerator'
import { useToastStore } from '../../stores/toastStore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// SECURITY_AUDIT_A01 Phase 2 — các builder HTML cho popup/print phải neutral hóa
// dữ liệu user (escapeHtml), KHÔNG document.write dữ liệu thô, popup dùng Blob URL.

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

const EVIL = '<script>alert(1)</script>'
const activeAY = getCurrentAcademicYear()

function makeReceipt(overrides: Partial<ReceiptPrintData> = {}): ReceiptPrintData {
  return {
    type: 'INCOME', receiptNumber: 'PT-001', date: '2026-09-02', personName: 'Nguyễn Văn A',
    amount: 100_000, category: 'Đoàn phí', title: 'Thu đoàn phí', fundName: 'Quỹ chung',
    recordedByName: 'Thủ quỹ', ...overrides,
  }
}

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

  it('buildReceiptHtml escapes every financial and identity field and contains no script', () => {
    const html = buildReceiptHtml(makeReceipt({
      receiptNumber: EVIL, personName: EVIL, personPhone: EVIL, className: EVIL,
      category: EVIL, title: EVIL, description: EVIL, fundName: EVIL,
      targetFundName: EVIL, recordedByName: EVIL, parishName: EVIL,
      dioceseName: EVIL, unitName: EVIL, pastorName: EVIL, leaderName: EVIL,
    }))
    expect(html).not.toContain('<script>')
    expect(html).not.toContain(EVIL)
    expect(html).toContain('&lt;script&gt;')
  })

  it('SEC-XSS-1 — parishName không thể breakout khỏi <style> watermark (CSS rawtext injection)', () => {
    const evilParish = `Xứ Đạo</style><script>alert(document.cookie)</script>`
    const html = generateStudentReportCardHTML(
      makeStudent(), [makeGrade()], [makeAttendance('2026-08-01')],
      { ...options, parishName: evilParish },
    )
    // Chỉ còn đúng 1 thẻ đóng </style> hợp lệ của document — không có breakout.
    expect(html.match(/<\/style>/gi)?.length).toBe(1)
    expect(html).not.toContain('</style><script>')
    expect(html).not.toContain('<script>alert(document.cookie)')
  })
})

describe('FIN-XSS-1 — receipt printing avoids the about:blank document.write sink', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock-receipt'), revokeObjectURL: vi.fn() })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('loads escaped receipt HTML through a Blob URL and never writes the popup document', () => {
    const fakePopup = {
      document: { write: vi.fn(), close: vi.fn(), open: vi.fn() },
      location: { href: '' }, opener: {} as unknown, focus: vi.fn(), print: vi.fn(),
      onload: null as (() => void) | null,
    }
    vi.spyOn(window, 'open').mockReturnValue(fakePopup as unknown as Window)

    printReceipt(makeReceipt({ title: EVIL }))

    expect(fakePopup.document.write).not.toHaveBeenCalled()
    expect(fakePopup.document.open).not.toHaveBeenCalled()
    expect(fakePopup.location.href).toBe('blob:mock-receipt')
    expect(fakePopup.opener).toBeNull()
    fakePopup.onload?.()
    expect(fakePopup.print).toHaveBeenCalledOnce()
  })
})

describe('HTML-PREVIEW-XSS-1 — srcDoc previews are capability sandboxed', () => {
  it.each([
    'src/components/finance/PrintReceiptModal.tsx',
    'src/components/exam/ExamExportModal.tsx',
    'src/components/exam/ExamPaperModal.tsx',
  ])('%s keeps an empty sandbox on its srcDoc iframe', (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8')
    const iframe = source.match(/<iframe[\s\S]*?\/>/)?.[0]
    expect(iframe).toBeTruthy()
    expect(iframe).toContain('srcDoc=')
    expect(iframe).toContain('sandbox=""')
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

  it('print: onload không nổ (production) → polling readyState complete tự in đúng 1 lần', async () => {
    const fakePopup = {
      document: { write: vi.fn(), close: vi.fn(), open: vi.fn(), readyState: 'complete' },
      location: { href: '' },
      opener: {} as unknown,
      closed: false,
      focus: vi.fn(),
      print: vi.fn(),
      onload: null as (() => void) | null,
    }
    vi.spyOn(window, 'open').mockReturnValue(fakePopup as unknown as Window)
    ReportExportService.print('<html><body>x</body></html>')
    expect(fakePopup.onload).toBeTypeOf('function')
    // KHÔNG gọi onload thủ công — polling phải tự phát hiện readyState.
    await vi.waitFor(() => expect(fakePopup.print).toHaveBeenCalledTimes(1), { timeout: 3000, interval: 100 })
    await new Promise((r) => setTimeout(r, 700))
    expect(fakePopup.print).toHaveBeenCalledTimes(1)
  })

  it('print - popup bị chặn: toast hướng dẫn, KHÔNG tạo hidden iframe (CSP-FRAME: frame-src chặn blob)', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const html = '<html><body>fallback</body></html>'
    ReportExportService.print(html)
    // Hidden blob iframe bị frame-src 'none' / default-src 'self' chặn trên production
    // (verified Chromium thật) → không được tạo iframe thất bại im lặng nữa.
    expect(document.querySelector('iframe')).toBeNull()
    const toasts = useToastStore.getState().toasts
    expect(toasts[toasts.length - 1]?.message).toContain('pop-up')
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

  it('popup bị chặn (null) → toast hướng dẫn, không throw', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    useToastStore.setState({ toasts: [] })
    expect(() => printQrSheet('Lớp TN1', [])).not.toThrow()
    const toasts = useToastStore.getState().toasts
    expect(toasts[toasts.length - 1]?.message).toContain('pop-up')
  })
})

describe('CSP-FRAME — exportPdf qua popup (hidden blob iframe bị frame-src chặn production)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useToastStore.setState({ toasts: [] })
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock-pdf'), revokeObjectURL: vi.fn() })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  // jsdom Blob chưa có .text() — đọc qua FileReader.
  function blobText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
  }

  it('popup mở được: Blob URL qua location.href, opener null, onload in đúng 1 lần, title theo filename đã sanitize', async () => {
    const fakePopup = {
      document: { write: vi.fn(), close: vi.fn(), open: vi.fn() },
      location: { href: '' },
      opener: {} as unknown,
      focus: vi.fn(),
      print: vi.fn(),
      onload: null as (() => void) | null,
    }
    vi.spyOn(window, 'open').mockReturnValue(fakePopup as unknown as Window)
    ReportExportService.exportPdf('<html><head><title>old</title></head><body>pdf me</body></html>', 'De_Thi_Toan')
    expect(fakePopup.document.write).not.toHaveBeenCalled()
    expect(fakePopup.location.href).toBe('blob:mock-pdf')
    expect(fakePopup.opener).toBeNull()
    fakePopup.onload?.()
    fakePopup.onload?.()
    expect(fakePopup.print).toHaveBeenCalledTimes(1)
    expect(document.querySelector('iframe')).toBeNull()
    const blobArg = (URL.createObjectURL as unknown as Mock).mock.calls[0][0] as Blob
    await expect(blobText(blobArg)).resolves.toContain('<title>De_Thi_Toan</title>')
  })

  it('popup mở được: filename độc hại không lọt script vào <title> (EP-F1)', async () => {
    const fakePopup = {
      document: { write: vi.fn(), close: vi.fn(), open: vi.fn() },
      location: { href: '' },
      focus: vi.fn(),
      print: vi.fn(),
      onload: null as (() => void) | null,
    }
    vi.spyOn(window, 'open').mockReturnValue(fakePopup as unknown as Window)
    ReportExportService.exportPdf('<html><head><title>t</title></head><body>x</body></html>', 'X</title><img src=x onerror=alert(1)>')
    const blobArg = (URL.createObjectURL as unknown as Mock).mock.calls[0][0] as Blob
    const text = await blobText(blobArg)
    expect(text).not.toContain('<script>')
    expect(text).not.toContain('<img src=x')
  })

  it('popup bị chặn: không tạo iframe, toast hướng dẫn, không throw', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(() => ReportExportService.exportPdf('<html><body>x</body></html>', 'f')).not.toThrow()
    expect(document.querySelector('iframe')).toBeNull()
    const toasts = useToastStore.getState().toasts
    expect(toasts[toasts.length - 1]?.message).toContain('pop-up')
  })
})
