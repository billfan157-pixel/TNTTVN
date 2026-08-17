import { describe, it, expect } from 'vitest'
import { isInternalOrLocalUrl, sanitizePDFHTML } from '../utils/pdfSanitizer.js'

describe('PDF Sanitizer & SSRF/LFI Protection (A-NEW-42)', () => {
  describe('isInternalOrLocalUrl', () => {
    it('1. Chặn file:// scheme (LFI)', () => {
      expect(isInternalOrLocalUrl('file:///etc/passwd')).toBe(true)
      expect(isInternalOrLocalUrl('FILE:///C:/Windows/win.ini')).toBe(true)
    })

    it('2. Chặn localhost & IPv4 loopback / private IP (SSRF)', () => {
      expect(isInternalOrLocalUrl('http://localhost')).toBe(true)
      expect(isInternalOrLocalUrl('http://localhost:8080/api/health')).toBe(true)
      expect(isInternalOrLocalUrl('http://127.0.0.1/admin')).toBe(true)
      expect(isInternalOrLocalUrl('http://127.0.0.2')).toBe(true)
      expect(isInternalOrLocalUrl('http://10.0.0.1')).toBe(true)
      expect(isInternalOrLocalUrl('http://192.168.1.1')).toBe(true)
      expect(isInternalOrLocalUrl('http://172.16.0.1')).toBe(true)
      expect(isInternalOrLocalUrl('http://172.31.255.255')).toBe(true)
      expect(isInternalOrLocalUrl('http://169.254.169.254/latest/meta-data')).toBe(true)
    })

    it('3. Chặn địa chỉ IPv4 mã hóa dưới dạng Decimal / Hex / Octal / IPv6', () => {
      expect(isInternalOrLocalUrl('http://2130706433')).toBe(true) // 127.0.0.1 decimal
      expect(isInternalOrLocalUrl('http://0x7f000001')).toBe(true) // 127.0.0.1 hex
      expect(isInternalOrLocalUrl('http://[::1]')).toBe(true) // IPv6 loopback
    })

    it('4. Cho phép data: URI và public HTTPS hợp lệ', () => {
      expect(isInternalOrLocalUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(false)
      expect(isInternalOrLocalUrl('about:blank')).toBe(false)
      expect(isInternalOrLocalUrl('https://example.com/logo.png')).toBe(false)
    })
  })

  describe('sanitizePDFHTML', () => {
    it('1. Loại bỏ các thẻ script, iframe, object, embed, frame', () => {
      const input = `<div><h1>Title</h1><script>alert(1)</script><iframe src="file:///etc/passwd"></iframe><object data="http://127.0.0.1"></object></div>`
      const output = sanitizePDFHTML(input)
      expect(output).not.toContain('<script>')
      expect(output).not.toContain('<iframe>')
      expect(output).not.toContain('<object>')
      expect(output).toContain('<h1>Title</h1>')
    })

    it('2. Loại bỏ inline event handlers (onload, onerror,...)', () => {
      const input = `<img src="data:image/png;base64,abc" onload="alert(1)" onerror="console.log(2)" />`
      const output = sanitizePDFHTML(input)
      expect(output).not.toContain('onload')
      expect(output).not.toContain('onerror')
      expect(output).toContain('<img src="data:image/png;base64,abc"')
    })

    it('3. Neutralize thuộc tính src/href trỏ đến file:// hoặc local IP', () => {
      const input = `<img src="file:///etc/passwd" /><a href="http://127.0.0.1/secret">Link</a>`
      const output = sanitizePDFHTML(input)
      expect(output).not.toContain('file:///etc/passwd')
      expect(output).not.toContain('127.0.0.1')
      expect(output).toContain('src="about:blank"')
      expect(output).toContain('href="about:blank"')
    })

    it('4. Giữ nguyên data: URI và HTML tĩnh hợp lệ', () => {
      const input = `<div style="color: red;"><h2>Phiếu điểm</h2><img src="data:image/png;base64,iVBORw0KGgo=" /></div>`
      const output = sanitizePDFHTML(input)
      expect(output).toBe(input)
    })
  })
})
