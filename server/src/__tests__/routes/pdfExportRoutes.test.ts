import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { generateTokens } from '../../middleware/auth.js'
import { db } from '../../db/index.js'
import { users } from '../../db/schema.js'

// Nhánh PDF export (2026-08-12): POST /api/reports/generate-pdf render HTML → PDF
// qua Puppeteer. Mock `generatePDFFromHTML` — không launch Chromium thật trong test.
vi.mock('../../services/pdfService.js', () => ({
  generatePDFFromHTML: vi.fn(async (_html: string) => new TextEncoder().encode('<pdf-bytes>')),
  closeBrowser: vi.fn(async () => {}),
}))

const { default: reportingRouter } = await import('../../routes/reporting.js')
const { generatePDFFromHTML } = await import('../../services/pdfService.js')

const PARISH = 'parish-pdf-export'
const USER_IDS = {
  admin: 'usr-pdf-export-admin',
  chunhiem: 'usr-pdf-export-chunhiem',
  phuta: 'usr-pdf-export-phuta',
  phuhuynh: 'usr-pdf-export-parent',
} as const

type PdfRole = keyof typeof USER_IDS

function token(role: PdfRole) {
  return generateTokens({ userId: USER_IDS[role], username: `pdf_${role}`, role, parishId: PARISH, tokenVersion: 1 }).accessToken
}

describe('POST /api/reports/generate-pdf (PDF export)', () => {
  beforeAll(async () => {
    await db.insert(users).values([
      { id: USER_IDS.admin, username: 'pdf_export_admin', fullName: 'PDF Export Admin', passwordHash: 'hash', role: 'admin', parishId: PARISH, tokenVersion: 1, status: 'ACTIVE' },
      { id: USER_IDS.chunhiem, username: 'pdf_export_chunhiem', fullName: 'PDF Export Chunhiem', passwordHash: 'hash', role: 'chunhiem', parishId: PARISH, tokenVersion: 1, status: 'ACTIVE' },
      { id: USER_IDS.phuta, username: 'pdf_export_phuta', fullName: 'PDF Export Phuta', passwordHash: 'hash', role: 'phuta', parishId: PARISH, tokenVersion: 1, status: 'ACTIVE' },
      { id: USER_IDS.phuhuynh, username: 'pdf_export_parent', fullName: 'PDF Export Parent', passwordHash: 'hash', role: 'phuhuynh', parishId: PARISH, tokenVersion: 1, status: 'ACTIVE' },
    ]).onConflictDoNothing()
  })

  beforeEach(() => {
    vi.mocked(generatePDFFromHTML).mockClear()
  })

  it('1. admin POST html hợp lệ → 200 PDF bytes + Content-Type application/pdf', async () => {
    const res = await reportingRouter.request('/generate-pdf', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token('admin')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ htmlContent: '<html><body>Phiếu điểm</body></html>' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    const buf = await res.arrayBuffer()
    expect(new Uint8Array(buf).length).toBeGreaterThan(0)
    expect(generatePDFFromHTML).toHaveBeenCalledTimes(1)
  })

  it('2. chunhiem/phuta cũng được phép (in báo cáo lớp)', async () => {
    for (const role of ['chunhiem', 'phuta'] as const) {
      const res = await reportingRouter.request('/generate-pdf', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token(role)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlContent: '<html></html>' }),
      })
      expect(res.status).toBe(200)
    }
  })

  it('3. thiếu htmlContent → 400 BAD_REQUEST (không gọi pdfService)', async () => {
    const res = await reportingRouter.request('/generate-pdf', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token('admin')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.error.code).toBe('BAD_REQUEST')
    expect(generatePDFFromHTML).not.toHaveBeenCalled()
  })

  it('4. pdfService fail → 500 PDF_GENERATION_FAILED', async () => {
    vi.mocked(generatePDFFromHTML).mockRejectedValueOnce(new Error('boom'))
    const res = await reportingRouter.request('/generate-pdf', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token('admin')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ htmlContent: '<html></html>' }),
    })
    expect(res.status).toBe(500)
    const json = (await res.json()) as any
    expect(json.error.code).toBe('PDF_GENERATION_FAILED')
  })

  it('5. phuhuynh → 403 (endpoint chỉ dành staff)', async () => {
    const res = await reportingRouter.request('/generate-pdf', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token('phuhuynh')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ htmlContent: '<html></html>' }),
    })
    expect(res.status).toBe(403)
  })
})
