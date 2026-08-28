export type ScanQualityStatus = 'good' | 'review' | 'bad'

export interface ScanQualityPoint {
  /** Normalized coordinate in the source image, 0..1. */
  x: number
  /** Normalized coordinate in the source image, 0..1. */
  y: number
}

export interface ScanQualityAssessment {
  status: ScanQualityStatus
  /** Optional for backward-compatible persisted/test fixtures; detectors always emit it. */
  scope?: 'frame' | 'paper_roi'
  meanLuma: number
  highlightRatio: number
  shadowRatio: number
  edgeEnergy: number
  sampleCount?: number
  reasons: Array<'TOO_DARK' | 'TOO_BRIGHT' | 'GLARE' | 'LOW_DETAIL'>
}

interface QualitySampleRegion {
  scope: ScanQualityAssessment['scope']
  minX: number
  minY: number
  maxX: number
  maxY: number
  polygon?: readonly ScanQualityPoint[]
}

function isInsideConvexPolygon(x: number, y: number, polygon: readonly ScanQualityPoint[]): boolean {
  let sign = 0
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const cross = (end.x - start.x) * (y - start.y) - (end.y - start.y) * (x - start.x)
    if (Math.abs(cross) < 1e-9) continue
    const current = cross > 0 ? 1 : -1
    if (sign !== 0 && current !== sign) return false
    sign = current
  }
  return sign !== 0
}

function assessRegion(image: ImageData, region: QualitySampleRegion): ScanQualityAssessment {
  const { width, height, data } = image
  const minX = Math.max(1, Math.floor(region.minX * width))
  const minY = Math.max(1, Math.floor(region.minY * height))
  const maxX = Math.min(width - 1, Math.ceil(region.maxX * width))
  const maxY = Math.min(height - 1, Math.ceil(region.maxY * height))
  // Shadow ROI must not double hot-path work. A 120-point short axis still
  // yields thousands of aggregate samples while costing about 1/4 of the
  // full-frame grid; it cannot affect acceptance while in shadow mode.
  const targetSamplesOnShortAxis = region.scope === 'paper_roi' ? 120 : 240
  const shortAxis = Math.min(maxX - minX, maxY - minY)
  const step = Math.max(1, region.scope === 'paper_roi'
    ? Math.ceil(shortAxis / targetSamplesOnShortAxis)
    : Math.floor(shortAxis / targetSamplesOnShortAxis))
  let count = 0
  let lumaSum = 0
  let highlights = 0
  let shadows = 0
  let edgeSum = 0
  let edgeSamples = 0

  const sampleLuma = (x: number, y: number) => {
    const index = (y * width + x) * 4
    return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
  }

  for (let y = minY; y < maxY; y += step) {
    for (let x = minX; x < maxX; x += step) {
      const normalizedX = x / width
      const normalizedY = y / height
      if (region.polygon && !isInsideConvexPolygon(normalizedX, normalizedY, region.polygon)) continue
      const luma = sampleLuma(x, y)
      lumaSum += luma
      if (luma >= 250) highlights++
      if (luma <= 18) shadows++
      count++

      const leftX = Math.max(minX, x - step)
      const topY = Math.max(minY, y - step)
      const leftInside = !region.polygon || isInsideConvexPolygon(leftX / width, normalizedY, region.polygon)
      const topInside = !region.polygon || isInsideConvexPolygon(normalizedX, topY / height, region.polygon)
      if (leftInside || topInside) {
        const left = leftInside ? sampleLuma(leftX, y) : luma
        const top = topInside ? sampleLuma(x, topY) : luma
        edgeSum += (Math.abs(luma - left) + Math.abs(luma - top)) / 2
        edgeSamples++
      }
    }
  }

  const meanLuma = count ? lumaSum / count : 0
  const highlightRatio = count ? highlights / count : 0
  const shadowRatio = count ? shadows / count : 0
  const edgeEnergy = edgeSamples ? edgeSum / edgeSamples : 0
  const reasons: ScanQualityAssessment['reasons'] = []
  if (meanLuma < 45) reasons.push('TOO_DARK')
  if (meanLuma > 242) reasons.push('TOO_BRIGHT')
  if (highlightRatio > 0.22) reasons.push('GLARE')
  if (edgeEnergy < 3) reasons.push('LOW_DETAIL')

  const status: ScanQualityStatus = count === 0 || meanLuma < 25 || meanLuma > 250 || edgeEnergy < 1
    ? 'bad'
    : reasons.length > 0
      ? 'review'
      : 'good'

  return {
    status,
    scope: region.scope,
    meanLuma: Math.round(meanLuma * 10) / 10,
    highlightRatio: Math.round(highlightRatio * 1000) / 1000,
    shadowRatio: Math.round(shadowRatio * 1000) / 1000,
    edgeEnergy: Math.round(edgeEnergy * 10) / 10,
    sampleCount: count,
    reasons,
  }
}

/**
 * Chỉ lưu số đo tổng hợp, không lưu ảnh hay pixel.
 *
 * Contract với scanAcceptancePolicy:
 * - good: có thể auto-accept nếu OMR cũng accepted;
 * - review: bắt buộc người chấm rà soát;
 * - bad: hard reject, không được ghi điểm từ frame đó.
 *
 * Detector marker/OMR vẫn là gate độc lập; quality không thể biến một OMR lỗi
 * thành kết quả hợp lệ.
 */
export function assessScanQuality(image: ImageData): ScanQualityAssessment {
  return assessRegion(image, { scope: 'frame', minX: 0, minY: 0, maxX: 1, maxY: 1 })
}

/**
 * Phase 2 shadow metric: đo chất lượng bên trong tứ giác giấy đã được marker xác
 * nhận. Kết quả này CHƯA thay thế global quality trong acceptance policy cho tới
 * khi corpus camera thật chứng minh không tăng false accept.
 */
export function assessPaperScanQuality(
  image: ImageData,
  paperCorners: readonly ScanQualityPoint[],
  insetRatio = 0.06,
): ScanQualityAssessment {
  if (paperCorners.length !== 4 || paperCorners.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return assessRegion(image, { scope: 'paper_roi', minX: 0, minY: 0, maxX: 0, maxY: 0, polygon: [] })
  }
  const center = paperCorners.reduce((sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }), { x: 0, y: 0 })
  const inset = paperCorners.map(point => ({
    x: point.x + (center.x - point.x) * Math.min(0.2, Math.max(0, insetRatio)),
    y: point.y + (center.y - point.y) * Math.min(0.2, Math.max(0, insetRatio)),
  }))
  return assessRegion(image, {
    scope: 'paper_roi',
    minX: Math.min(...inset.map(point => point.x)),
    minY: Math.min(...inset.map(point => point.y)),
    maxX: Math.max(...inset.map(point => point.x)),
    maxY: Math.max(...inset.map(point => point.y)),
    polygon: inset,
  })
}
