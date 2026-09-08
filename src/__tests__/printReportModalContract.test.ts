import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(process.cwd(), 'src/components/common/PrintReportModal.tsx'), 'utf-8')

describe('PrintReportModal design-system contract', () => {
  it('uses the standard ModalShell (no custom portal shell)', () => {
    expect(src).toContain("from './ModalShell'")
    expect(src).not.toContain('ModalPortal')
    expect(src).not.toContain('useAccessibleDialog')
  })

  it('preserves legacy close behavior (no overlay-click close)', () => {
    expect(src).toContain('closeOnOverlay={false}')
  })

  it('keeps standard width and title', () => {
    expect(src).toContain('maxWidth="576px"')
    expect(src).toContain('In Báo Cáo & Sổ Điểm Nhà Xứ')
  })

  it('uses semantic tokens instead of raw business colors', () => {
    expect(src).not.toMatch(/(?:text|bg|border)-(?:amber|emerald|sky|slate)-\d/)
  })

  it('footer actions meet the 44px touch target', () => {
    expect(src).toContain('min-h-[44px]')
  })

  it('preview passes filename for popup-blocked fallback download', () => {
    expect(src).toContain('ReportExportService.preview(html, filename)')
  })
})
