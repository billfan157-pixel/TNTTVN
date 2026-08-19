import { describe, expect, it } from 'vitest'
import { detectAnswersFromImage, detectScoreFromImage } from '../omr'
import {
  CORNER_MARKERS,
  CORNER_SIZE,
  INTEGRATED_CORNER_SIZE,
  integratedFrameAspectRatio,
  integratedMcOptionToCellForRect,
  mcOptionToCell,
  scoreToCell,
  type FrameRect,
} from '../answerSheetTemplate'

function fakeImageData(width = 800, height = 1130): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 247
    data[i * 4 + 1] = 247
    data[i * 4 + 2] = 247
    data[i * 4 + 3] = 255
  }
  return { width, height, data, colorSpace: 'srgb' } as ImageData
}

function fillRect(img: ImageData, cx: number, cy: number, half: number, luma: number): void {
  const x0 = Math.max(0, Math.floor(cx - half))
  const x1 = Math.min(img.width - 1, Math.ceil(cx + half))
  const y0 = Math.max(0, Math.floor(cy - half))
  const y1 = Math.min(img.height - 1, Math.ceil(cy + half))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const offset = (y * img.width + x) * 4
      img.data[offset] = luma
      img.data[offset + 1] = luma
      img.data[offset + 2] = luma
      img.data[offset + 3] = 255
    }
  }
}

function rotate180(img: ImageData): ImageData {
  const out = fakeImageData(img.width, img.height)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const src = (y * img.width + x) * 4
      const dstX = img.width - 1 - x
      const dstY = img.height - 1 - y
      const dst = (dstY * img.width + dstX) * 4
      out.data[dst] = img.data[src]
      out.data[dst + 1] = img.data[src + 1]
      out.data[dst + 2] = img.data[src + 2]
      out.data[dst + 3] = img.data[src + 3]
    }
  }
  return out
}

function fullPageWritten(score: number): ImageData {
  const img = fakeImageData()
  const markerHalf = (CORNER_SIZE / 2) * Math.min(img.width, img.height)
  for (const marker of CORNER_MARKERS) {
    fillRect(img, marker.x * img.width, marker.y * img.height, markerHalf, 8)
  }
  const cell = scoreToCell(score)
  fillRect(img, cell.x * img.width, cell.y * img.height, Math.min(img.width, img.height) * 0.010, 20)
  return img
}

function fullPageMc(): ImageData {
  const img = fakeImageData()
  const markerHalf = (CORNER_SIZE / 2) * Math.min(img.width, img.height)
  for (const marker of CORNER_MARKERS) {
    fillRect(img, marker.x * img.width, marker.y * img.height, markerHalf, 8)
  }
  const answers = ['A', 'B', 'C', 'D'] as const
  for (let q = 1; q <= 4; q++) {
    const cell = mcOptionToCell(q, answers[q - 1], 4)
    fillRect(img, cell.x * img.width, cell.y * img.height, Math.min(img.width, img.height) * 0.009, 20)
  }
  return img
}

function integratedMc(totalQuestions = 20): ImageData {
  const img = fakeImageData()
  // Construct a realistic integrated frame in the upper half. Width/height is
  // derived from the same SSOT aspect-ratio function used by the detector gate.
  const x0 = 0.08
  const x1 = 0.92
  const frameWidthPx = (x1 - x0) * img.width
  const frameHeightPx = frameWidthPx / integratedFrameAspectRatio(totalQuestions)
  const y0 = 0.20
  const y1 = y0 + frameHeightPx / img.height
  const frame: FrameRect = { x0, y0, x1, y1 }
  const markerHalf = (INTEGRATED_CORNER_SIZE / 2) * Math.min(img.width, img.height)
  const markers = [
    [x0, y0], [x1, y0], [x1, y1], [x0, y1],
  ] as const
  for (const [x, y] of markers) fillRect(img, x * img.width, y * img.height, markerHalf, 8)

  const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
  for (let q = 1; q <= totalQuestions; q++) {
    const option = (['A', 'B', 'C', 'D'] as const)[(q - 1) % 4]
    answerKey[q] = option
    const cell = integratedMcOptionToCellForRect(q, option, totalQuestions, frame)
    fillRect(img, cell.x * img.width, cell.y * img.height, Math.min(img.width, img.height) * 0.0055, 20)
  }
  return img
}

describe('OMR orientation fail-closed guards', () => {
  it('full-page written sheet is accepted upright but rejected after 180° rotation', () => {
    const upright = detectScoreFromImage(fullPageWritten(8))
    expect(upright.ok).toBe(true)
    expect(upright.score).toBe(8)

    const rotated = detectScoreFromImage(rotate180(fullPageWritten(8)))
    expect(rotated.ok).toBe(false)
    expect(rotated.score).toBeNull()
  })

  it('full-page MC is accepted upright but not auto-accepted after 180° rotation', () => {
    const key = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' } as const
    const upright = detectAnswersFromImage(fullPageMc(), key, 4, 10, 'full_page')
    expect(upright.status).toBe('accepted')

    const rotated = detectAnswersFromImage(rotate180(fullPageMc()), key, 4, 10, 'full_page')
    expect(rotated.status).not.toBe('accepted')
  })

  it('integrated MC is accepted upright but not auto-accepted after 180° rotation', () => {
    const totalQuestions = 20
    const key: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
    for (let q = 1; q <= totalQuestions; q++) key[q] = (['A', 'B', 'C', 'D'] as const)[(q - 1) % 4]

    const upright = detectAnswersFromImage(integratedMc(totalQuestions), key, totalQuestions, 10, 'integrated')
    expect(upright.status).toBe('accepted')

    const rotated = detectAnswersFromImage(rotate180(integratedMc(totalQuestions)), key, totalQuestions, 10, 'integrated')
    expect(rotated.status).not.toBe('accepted')
  })
})
