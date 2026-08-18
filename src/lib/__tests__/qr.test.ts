import { describe, it, expect } from 'vitest'
import jsQR from 'jsqr'
import {
  buildExamQrPayload,
  parseExamQrPayload,
  generateExamQrSvg,
  generateExamQrMatrix,
  getExamQrModuleCount,
  getExamQrViewBoxSize,
  QR_QUIET_ZONE_MODULES,
  EXAM_QR_COMPACT_PREFIX,
  EXAM_QR_PREFIX,
  EXAM_QR_V2_PREFIX,
} from '../qr'
import { scanExamCode } from '../examCodeScanner'

/**
 * Roundtrip encode → bitmap → jsQR decode (không cần canvas:
 * dựng ImageData từ ma trận module, scale ×4, đen=0 / trắng=255).
 */
function matrixToImageData(matrix: number[][]): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = 4
  const size = matrix.length * scale
  const data = new Uint8ClampedArray(size * size * 4)
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix.length; col++) {
      const dark = matrix[row][col] === 1
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (row * scale + dy) * size + (col * scale + dx)
          const v = dark ? 0 : 255
          data[px * 4] = v
          data[px * 4 + 1] = v
          data[px * 4 + 2] = v
          data[px * 4 + 3] = 255
        }
      }
    }
  }
  return { data, width: size, height: size }
}

describe('Smart Exam Grading — QR (Phase 1)', () => {
  it('payload format tntt-exam:{sessionId}:{studentId} và parse ngược được', () => {
    const payload = buildExamQrPayload('EXS-abc123', 'ST-xyz789')
    expect(payload.startsWith(EXAM_QR_PREFIX)).toBe(true)
    const parsed = parseExamQrPayload(payload)
    expect(parsed).toEqual({ sessionId: 'EXS-abc123', studentId: 'ST-xyz789' })
  })

  it('reject payload sai prefix / thiếu phần', () => {
    expect(parseExamQrPayload('random:EXS-1:ST-2')).toBeNull()
    expect(parseExamQrPayload('tntt-exam:EXS-1')).toBeNull()
    expect(parseExamQrPayload('')).toBeNull()
  })

  it('studentId chứa dấu ":" vẫn parse đúng (join các phần sau sessionId)', () => {
    const payload = buildExamQrPayload('EXS-1', 'ST-a:b:c')
    const parsed = parseExamQrPayload(payload)
    expect(parsed).toEqual({ sessionId: 'EXS-1', studentId: 'ST-a:b:c' })
  })

  it('generateExamQrSvg trả SVG hợp lệ', () => {
    const payload = buildExamQrPayload('EXS-1', 'ST-1')
    const svg = generateExamQrSvg(payload)
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    const size = getExamQrViewBoxSize(payload)
    expect(svg).toContain(`viewBox="0 0 ${size} ${size}"`)
    expect(size).toBe(getExamQrModuleCount(payload) + QR_QUIET_ZONE_MODULES * 2)
    expect(svg).toContain('shape-rendering="crispEdges"')
  })

  it('ID production dùng payload compact và parse lại đúng ID đầy đủ', () => {
    const payload = buildExamQrPayload('EXS-7e8f7985', 'ST-12345678')
    expect(payload).toBe(`${EXAM_QR_COMPACT_PREFIX}:7E8F7985:12345678`)
    expect(parseExamQrPayload(payload)).toEqual({
      sessionId: 'EXS-7e8f7985',
      studentId: 'ST-12345678',
    })
    expect(parseExamQrPayload('te:not-hex:12345678')).toBeNull()
  })

  it('protocol v2 ràng buộc loại mẫu + số câu và từ chối checksum sai', () => {
    const payload = buildExamQrPayload('EXS-7e8f7985', 'ST-12345678', {
      templateMode: 'full_page',
      questionCount: 50,
    })
    expect(payload.startsWith(`${EXAM_QR_V2_PREFIX}:`)).toBe(true)
    expect(parseExamQrPayload(payload)).toMatchObject({
      sessionId: 'EXS-7e8f7985',
      studentId: 'ST-12345678',
      protocolVersion: 2,
      templateMode: 'full_page',
      questionCount: 50,
    })
    expect(parseExamQrPayload(payload.replace(/.$/, payload.endsWith('0') ? '1' : '0'))).toBeNull()
  })

  it('trả đúng kích thước viewBox cho payload dài, tránh cắt QR khi in phiếu', () => {
    const payload = buildExamQrPayload(`EXS-${'s'.repeat(80)}`, `ST-${'t'.repeat(80)}`)
    const matrix = generateExamQrMatrix(payload)
    expect(getExamQrModuleCount(payload)).toBe(matrix.length)
    expect(matrix.length).toBeGreaterThan(37)
  })

  it('roundtrip: ma trận QR decode được bằng jsQR ra đúng payload', () => {
    const payload = buildExamQrPayload('EXS-roundtrip', 'ST-042')
    const matrix = generateExamQrMatrix(payload)
    const bitmap = matrixToImageData(matrix)
    const decoded = jsQR(bitmap.data, bitmap.width, bitmap.height)
    expect(decoded).not.toBeNull()
    expect(decoded!.data).toBe(payload)
  })

  it('đọc được QR ở góc trên phải của frame camera có nhiều lề', () => {
    const payload = buildExamQrPayload('EXS-camera', 'ST-0842')
    const qr = matrixToImageData(generateExamQrMatrix(payload))
    const width = 640
    const height = 900
    const data = new Uint8ClampedArray(width * height * 4)
    data.fill(255)
    const offsetX = 430
    const offsetY = 90
    for (let y = 0; y < qr.height; y++) {
      for (let x = 0; x < qr.width; x++) {
        const source = (y * qr.width + x) * 4
        const target = ((offsetY + y) * width + offsetX + x) * 4
        data.set(qr.data.subarray(source, source + 4), target)
      }
    }

    const result = scanExamCode({ data, width, height, colorSpace: 'srgb' } as ImageData)
    expect(result.source).toBe('qr')
    expect(result.rawText).toBe(payload)
    expect(result.payload).toEqual({ sessionId: 'EXS-camera', studentId: 'ST-0842' })
  })
})
