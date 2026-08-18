import { describe, expect, it } from 'vitest'
import { assessScanQuality } from '../scanQuality'

function image(width: number, height: number, pixel: (x: number, y: number) => number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const value = pixel(x, y)
      data[index] = value
      data[index + 1] = value
      data[index + 2] = value
      data[index + 3] = 255
    }
  }
  return { width, height, data, colorSpace: 'srgb' } as ImageData
}

describe('scan quality aggregate metrics', () => {
  it('đánh dấu frame tối/phẳng là bad mà không lưu pixel', () => {
    const result = assessScanQuality(image(120, 160, () => 8))
    expect(result.status).toBe('bad')
    expect(result.reasons).toContain('TOO_DARK')
    expect(result.reasons).toContain('LOW_DETAIL')
    expect(result).not.toHaveProperty('data')
  })

  it('frame sáng có chi tiết tương phản không bị coi là low detail', () => {
    const result = assessScanQuality(image(120, 160, (x, y) => ((x + y) % 16 < 8 ? 80 : 225)))
    expect(result.edgeEnergy).toBeGreaterThan(3)
    expect(result.reasons).not.toContain('LOW_DETAIL')
  })
})
