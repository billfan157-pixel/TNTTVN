import { describe, it, expect } from 'vitest'
import { sanitizeFilename, applyPdfTitle } from '../../services/reportExportService'

describe('EP-F1/F2 (audit 2026-08-21) — filename & PDF title sanitization', () => {
  it('sanitizeFilename thay ký tự bất hợp lệ Windows và không đổi tên sạch', () => {
    expect(sanitizeFilename('De_Thi_Giao_Ly')).toBe('De_Thi_Giao_Ly')
    expect(sanitizeFilename('A<B>C:D"E/F\\G|H?I*J')).toBe('A_B_C_D_E_F_G_H_I_J')
    expect(sanitizeFilename('Đề : Kỳ 1/2026')).toBe('Đề _ Kỳ 1_2026')
    expect(sanitizeFilename('')).toBe('')
  })

  it('EP-F1: applyPdfTitle chặn XSS payload từ subject qua <title>', () => {
    const malicious = 'X</title><img src=x onerror=alert(1)><script>fetch("/api")</script>'
    const html = `<!DOCTYPE html><html><head><title>Old</title></head><body></body></html>`
    const out = applyPdfTitle(html, `De_Thi_${malicious}`)

    // Không còn thẻ đóng title sớm / event handler / script trong <title>
    expect(out).not.toContain('</title><img')
    expect(out).not.toContain('<script>fetch')
    expect(out).toContain('<title>')
    // Title xuất hiện đúng một lần và nằm trong head
    expect(out.match(/<title>/g)).toHaveLength(1)
  })

  it('applyPdfTitle chèn title khi HTML thiếu <title>', () => {
    const html = `<!DOCTYPE html><html><head><style>body{}</style></head><body></body></html>`
    const out = applyPdfTitle(html, 'De_Thi_Mon.pdf')
    expect(out).toContain('<title>De_Thi_Mon</title>')
  })

  it('applyPdfTitle giữ nguyên HTML sạch', () => {
    const html = `<html><head><title>OK</title></head></html>`
    expect(applyPdfTitle(html, 'Ten_File')).toContain('<title>Ten_File</title>')
  })
})
