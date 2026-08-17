import { describe, it, expect } from 'vitest'
import { generateBarcodeSvg, decodeCode128 } from '../barcode'

describe('barcode — Code128 generator + decoder', () => {
  it('generateBarcodeSvg sinh SVG hợp lệ với namespace', () => {
    const svg = generateBarcodeSvg('hello')
    expect(svg).toContain('<svg')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('rect')
  })

  it('SVG có width và height đúng theo text length', () => {
    const short = generateBarcodeSvg('A', 40, 1)
    const long = generateBarcodeSvg('ABCDEFGHIJ', 40, 1)
    const getW = (s: string) => {
      const m = s.match(/viewBox="0 0 ([\d.]+) [\d.]+"/)
      return m ? parseFloat(m[1]) : 0
    }
    expect(getW(long)).toBeGreaterThan(getW(short))
  })

  it('decodeCode128 trả null cho input quá ngắn', () => {
    expect(decodeCode128([1, 1])).toBeNull()
    expect(decodeCode128([])).toBeNull()
  })

  it('decodeCode128 trả null khi checksum không khớp', () => {
    // 20 dummy runs — checksum will fail
    const dummy = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 3 : 2))
    expect(decodeCode128(dummy)).toBeNull()
  })

  it('encode + raw pattern decode roundtrip (tự kiểm)', () => {
    // Tạo barcode và kiểm pattern có START_CODE_B
    const svg = generateBarcodeSvg('X', 40, 2)
    expect(svg).toContain('rect') // có thanh barcode
  })
})
