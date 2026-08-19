import { describe, expect, it } from 'vitest'
import { detectAnswersFromImage } from '../omr'
import { CORNER_MARKERS, CORNER_SIZE, mcOptionToCell } from '../answerSheetTemplate'

function fakeImageData(width: number, height: number): ImageData {
  return { width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' } as unknown as ImageData
}

function buildBaseSheet(): ImageData {
  const width = 800
  const height = 1130
  const image = fakeImageData(width, height)
  for (let i = 0; i < width * height; i++) {
    image.data[i * 4] = 247
    image.data[i * 4 + 1] = 247
    image.data[i * 4 + 2] = 247
    image.data[i * 4 + 3] = 255
  }
  const fillRect = (x0: number, y0: number, x1: number, y1: number, value: number) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(height, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(width, Math.ceil(x1)); x++) {
        const i = (y * width + x) * 4
        image.data[i] = value
        image.data[i + 1] = value
        image.data[i + 2] = value
      }
    }
  }
  for (const marker of CORNER_MARKERS) {
    const half = CORNER_SIZE * Math.min(width, height) / 2
    fillRect(marker.x * width - half, marker.y * height - half, marker.x * width + half, marker.y * height + half, 10)
  }
  return image
}

function fillBubble(image: ImageData, question: number, option: 'A' | 'B' | 'C' | 'D', ratio: number): void {
  const cell = mcOptionToCell(question, option, 4)
  const radius = Math.floor(0.016 * Math.min(image.width, image.height))
  const x0 = Math.floor(cell.x * image.width - radius)
  const x1 = Math.ceil(cell.x * image.width + radius)
  const y0 = Math.floor(cell.y * image.height - radius)
  const y1 = Math.ceil(cell.y * image.height + radius)
  const cutoff = Math.max(0, Math.min(100, Math.round(ratio * 100)))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue
      // Deterministic dither gives an approximately uniform ink ratio across the ROI.
      if (((x * 17 + y * 31) % 100) >= cutoff) continue
      const i = (y * image.width + x) * 4
      image.data[i] = 25
      image.data[i + 1] = 25
      image.data[i + 2] = 25
    }
  }
}

describe('OMR hardening', () => {
  it('routes a single top answer with too-small top-vs-second margin to review', () => {
    const image = buildBaseSheet()
    // Three unambiguous answers establish the filled cluster for adaptive calibration.
    fillBubble(image, 2, 'B', 1)
    fillBubble(image, 3, 'C', 1)
    fillBubble(image, 4, 'D', 1)

    // A is just above the calibrated fill threshold; B is just below it.
    // Old MC logic could accept A because only the sheet-average confidence was gated.
    fillBubble(image, 1, 'A', 0.50)
    fillBubble(image, 1, 'B', 0.45)

    const result = detectAnswersFromImage(
      image,
      { 1: 'A', 2: 'B', 3: 'C', 4: 'D' },
      4,
      10,
      'full_page',
    )

    expect(result.ok).toBe(true)
    expect(result.status).toBe('review_required')
    expect(result.questions[0].needsReview).toBe(true)
    expect(result.questions[0].selectedAnswer).toBeNull()
    expect(result.questions[0].confidence).toBeLessThan(0.07)
  })
})
