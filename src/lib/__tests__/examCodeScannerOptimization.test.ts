import { beforeEach, describe, expect, it, vi } from 'vitest'

const { jsQrMock, barcodeMock } = vi.hoisted(() => ({
  jsQrMock: vi.fn(),
  barcodeMock: vi.fn(),
}))

vi.mock('jsqr', () => ({ default: jsQrMock }))
vi.mock('../barcode', () => ({ detectBarcodeFromImageData: barcodeMock }))

import { scanExamCode } from '../examCodeScanner'

function frame(width = 1000, height = 1400): ImageData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: 'srgb',
  } as ImageData
}

describe('exam code scanner staged attempts', () => {
  beforeEach(() => {
    jsQrMock.mockReset()
    barcodeMock.mockReset()
    barcodeMock.mockReturnValue(null)
  })

  it('dừng ngay ở focused standard QR fast-path', () => {
    jsQrMock.mockReturnValue({ data: 'TE:0123ABCD:89ABCDEF' })
    const result = scanExamCode(frame())
    expect(result.payload).toEqual({ sessionId: 'EXS-0123abcd', studentId: 'ST-89abcdef' })
    expect(jsQrMock).toHaveBeenCalledTimes(1)
    expect(jsQrMock.mock.calls[0][3]).toEqual({ inversionAttempts: 'dontInvert' })
    expect(jsQrMock.mock.calls[0][1]).toBe(480)
    expect(jsQrMock.mock.calls[0][2]).toBe(532)
  })

  it('chỉ chạy inverted recovery sau khi standard path thất bại', () => {
    jsQrMock.mockImplementation((_data, _width, _height, options) => (
      options.inversionAttempts === 'invertFirst' ? { data: 'TE:0123ABCD:89ABCDEF' } : null
    ))
    expect(scanExamCode(frame()).payload?.studentId).toBe('ST-89abcdef')
    expect(jsQrMock).toHaveBeenCalledTimes(10)
    expect(jsQrMock.mock.calls.slice(0, 9).every(call => call[3].inversionAttempts === 'dontInvert')).toBe(true)
    expect(jsQrMock.mock.calls[9][3]).toEqual({ inversionAttempts: 'invertFirst' })
  })

  it('giới hạn negative path rồi mới thử Code128', () => {
    jsQrMock.mockReturnValue(null)
    barcodeMock.mockReturnValue('TE:0123ABCD:89ABCDEF')
    const result = scanExamCode(frame())
    expect(jsQrMock).toHaveBeenCalledTimes(13)
    expect(barcodeMock).toHaveBeenCalledTimes(1)
    expect(result.source).toBe('barcode')
  })

  it('live fast thử 3 ROI chuẩn; recovery chỉ upscale crop focus một lần, không inversion', () => {
    jsQrMock.mockReturnValue(null)
    expect(scanExamCode(frame(), 'live_fast').rawText).toBeNull()
    expect(jsQrMock).toHaveBeenCalledTimes(3)
    expect(jsQrMock.mock.calls.every(call => call[3].inversionAttempts === 'dontInvert')).toBe(true)

    jsQrMock.mockClear()
    expect(scanExamCode(frame(), 'live_recovery').rawText).toBeNull()
    expect(jsQrMock).toHaveBeenCalledTimes(1)
    expect(jsQrMock.mock.calls.every(call => call[3].inversionAttempts === 'dontInvert')).toBe(true)
  })
})
