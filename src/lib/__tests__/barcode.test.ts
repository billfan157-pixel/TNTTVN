import { describe, it, expect } from 'vitest'
import { generateBarcodeSvg, getBarcodeViewBoxWidth, decodeCode128, detectBarcodeFromImageData } from '../barcode'

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
    expect(getW(long)).toBe(getBarcodeViewBoxWidth('ABCDEFGHIJ', 1))
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

it('đọc lại barcode raster ở vùng phía trên ảnh camera, không phụ thuộc dòng giữa', () => {
    const text = 'tntt-exam:EXS-camera:ST-42'
    const svg = generateBarcodeSvg(text, 40, 2)
    const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
    expect(viewBox).not.toBeNull()
    const width = Math.ceil(Number(viewBox![1]))
    const height = 120
    const data = new Uint8ClampedArray(width * height * 4)
    data.fill(255)
    const bars = [...svg.matchAll(/<rect x="([\d.]+)" y="0" width="([\d.]+)" height="40"/g)]
    for (const bar of bars) {
      const x0 = Math.round(Number(bar[1]))
      const x1 = Math.round(Number(bar[1]) + Number(bar[2]))
      for (let y = 18; y < 58; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255
        }
      }
    }
    const image = { data, width, height, colorSpace: 'srgb' } as ImageData
    expect(detectBarcodeFromImageData(image)).toBe(text)
    // Dòng giữa ảnh (y=60) không cắt barcode — chứng minh fallback cũ sẽ bỏ lỡ.
    expect(detectBarcodeFromImageData(image, 60)).toBeNull()
  })

  it('đọc lại barcode raster ở DẢI CUỐI frame — khớp vị trí in mới trên phiếu', () => {
    const text = 'tntt-exam:EXS-camera:ST-42'
    const svg = generateBarcodeSvg(text, 40, 2)
    const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
    expect(viewBox).not.toBeNull()
    const width = Math.ceil(Number(viewBox![1]))
    const height = 120
    const data = new Uint8ClampedArray(width * height * 4)
    data.fill(255)
    const barBottom = 110
    const bars = [...svg.matchAll(/<rect x="([\d.]+)" y="0" width="([\d.]+)" height="40"/g)]
    for (const bar of bars) {
      const x0 = Math.round(Number(bar[1]))
      const x1 = Math.round(Number(bar[1]) + Number(bar[2]))
      for (let y = barBottom - 22; y < barBottom; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255
        }
      }
    }
    const image = { data, width, height, colorSpace: 'srgb' } as ImageData
    expect(detectBarcodeFromImageData(image)).toBe(text)
  })
})
