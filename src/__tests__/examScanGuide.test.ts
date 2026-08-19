import { describe, expect, it } from 'vitest'
import {
  getIntegratedScanGuideLayout,
  getIntegratedScanGuideRect,
  INTEGRATED_SCAN_GUIDE_CENTER_Y_FRACTION,
  INTEGRATED_SCAN_GUIDE_WIDTH_FRACTION,
} from '../lib/examScanGuide'

const PORTRAIT_W = 810
const PORTRAIT_H = 1080

// Current integrated locator bands from omr.ts. The guide represents the four
// printed marker centers, so a correctly aligned sheet should place its guide
// edges safely inside these bands rather than on their boundaries.
const LEFT_MARKER_X = { min: 0.02, max: 0.38 }
const RIGHT_MARKER_X = { min: 0.62, max: 0.98 }
const TOP_MARKER_Y = { min: 0.05, max: 0.45 }
const BOTTOM_MARKER_Y = { min: 0.18, max: 0.82 }

function normalizedEdges(questionCount: number) {
  const rect = getIntegratedScanGuideRect(PORTRAIT_W, PORTRAIT_H, questionCount)
  return {
    left: rect.x / PORTRAIT_W,
    right: (rect.x + rect.width) / PORTRAIT_W,
    top: rect.y / PORTRAIT_H,
    bottom: (rect.y + rect.height) / PORTRAIT_H,
  }
}

describe('integrated exam scan guide placement', () => {
  it('uses the benchmarked portrait target without changing printed geometry', () => {
    expect(INTEGRATED_SCAN_GUIDE_WIDTH_FRACTION).toBe(0.86)
    expect(INTEGRATED_SCAN_GUIDE_CENTER_Y_FRACTION).toBe(0.42)

    const q20 = getIntegratedScanGuideLayout(20)
    const q50 = getIntegratedScanGuideLayout(50)
    expect(q20.widthFraction).toBe(0.86)
    expect(q50.widthFraction).toBe(0.86)
    expect(q20.centerYFraction).toBe(0.42)
    expect(q50.centerYFraction).toBe(0.42)
    expect(q20.aspectRatio).toBeGreaterThan(q50.aspectRatio)
  })

  it.each([20, 50])('keeps %i-question marker targets inside locator bands', questionCount => {
    const edge = normalizedEdges(questionCount)

    expect(edge.left).toBeGreaterThan(LEFT_MARKER_X.min)
    expect(edge.left).toBeLessThan(LEFT_MARKER_X.max)
    expect(edge.right).toBeGreaterThan(RIGHT_MARKER_X.min)
    expect(edge.right).toBeLessThan(RIGHT_MARKER_X.max)
    expect(edge.top).toBeGreaterThan(TOP_MARKER_Y.min)
    expect(edge.top).toBeLessThan(TOP_MARKER_Y.max)
    expect(edge.bottom).toBeGreaterThan(BOTTOM_MARKER_Y.min)
    expect(edge.bottom).toBeLessThan(BOTTOM_MARKER_Y.max)
  })

  it('gives the 20-question top markers meaningful headroom below the 45% locator ceiling', () => {
    const edge = normalizedEdges(20)
    expect(edge.top).toBeLessThanOrEqual(0.40)
    expect(TOP_MARKER_Y.max - edge.top).toBeGreaterThanOrEqual(0.05)
  })

  it('rejects invalid viewport geometry instead of producing a misleading guide', () => {
    expect(() => getIntegratedScanGuideRect(0, PORTRAIT_H, 20)).toThrow()
    expect(() => getIntegratedScanGuideRect(PORTRAIT_W, 0, 20)).toThrow()
  })
})
