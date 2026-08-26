/**
 * Smart Exam Grading — OMR detector (Phase 2 POC).
 * Nhận ảnh (ImageData), tìm 4 marker góc theo template → homography →
 * warp cell centers bằng applyHomography (full perspective, không bilinear tay) →
 * sample độ đen quanh center → score đề xuất + confidence.
 *
 * POC giới hạn theo plan: template-based (không ML), luôn kèm confidence,
 * UI phải xác nhận 2 bước trước khi ghi điểm (plan §12 → §10).
 */

import { computeHomography, applyHomography, type Mat3 } from './homography'
import {
  CORNER_MARKERS,
  CORNER_SIZE,
  INTEGRATED_CORNER_SIZE,
  INTEGRATED_MARKER_SIZE,
  allCells,
  allMcCells,
  integratedMcCellsForRect,
  integratedFrameAspectRatio,
  type FrameRect,
} from './answerSheetTemplate'

export interface OmrCell {
  score: number
  /** coverage 0..1 — 1 = cell đen hoàn toàn */
  coverage: number
}

export interface OmrResult {
  ok: boolean
  /** null khi không đủ marker / không rõ */
  score: number | null
  /** 0..1 — margin cell đầu vs nhì */
  confidence: number
  cells: OmrCell[]
  reason: string
}

export interface GrayImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

const DARK_THRESHOLD = 0.38
const MIN_GAP = 0.08
const MIN_FILL = 0.38
/** Vết tô đáng kể nhưng chưa đạt ngưỡng chấp nhận: bắt buộc người chấm xác nhận. */
const MIN_WEAK_FILL = 0.22
/** MC phải đạt margin riêng cho từng câu; không cho confidence trung bình che một câu mơ hồ. */
const MIN_QUESTION_GAP = 0.07
const MIN_ANSWER_CONFIDENCE = 0.06
/** Adaptive threshold chỉ được dao động trong biên an toàn để tránh overfit một ảnh bất thường. */
const ADAPTIVE_FILL_MIN = 0.24
const ADAPTIVE_FILL_MAX = 0.42
const PAPER_SAMPLE_COLS = 24
const PAPER_SAMPLE_ROWS = 18
const PAPER_MIN_LUMA = 105
const PAPER_MAX_CHANNEL_SPREAD = 70
const PAPER_MIN_NEUTRAL_LIGHT_FRACTION = 0.38

/** RGBA ImageData → grayscale luma. */
export function toGrayscale(img: ImageData): GrayImage {
  const { width, height, data } = img
  const out = new Uint8ClampedArray(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    out[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0
  }
  return { width, height, data: out }
}

export interface MarkerHit {
  id: string
  /** pixel */
  x: number
  y: number
  coverage: number
}

function markerInkRun(gray: GrayImage, marker: MarkerHit, dx: number, dy: number, maxRadius: number): number {
  const cx = Math.round(marker.x)
  const cy = Math.round(marker.y)
  const inkWeight = (offset: number) => {
    const x = cx + dx * offset
    const y = cy + dy * offset
    if (x < 0 || x >= gray.width || y < 0 || y >= gray.height) return 0
    // Trọng số xám giữ thông tin sub-pixel từ cạnh anti-alias của marker;
    // đếm nhị phân làm sai 5–10% khi marker camera chỉ còn 12–18px.
    return clamp01((240 - gray.data[y * gray.width + x]) / 220)
  }
  let total = inkWeight(0)
  for (const direction of [-1, 1]) {
    let whiteRun = 0
    for (let offset = 1; offset <= maxRadius; offset++) {
      const weight = inkWeight(direction * offset)
      if (weight < 0.03) {
        whiteRun++
        if (whiteRun >= 2) break
        continue
      }
      whiteRun = 0
      total += weight
    }
  }
  return total
}

/**
 * Window scoring can land anywhere inside a solid marker when several windows
 * have identical coverage. Recenter on the marker's continuous dark runs so
 * geometry and scale are measured from the printed square, not from the scan
 * window selected by its positional tie-breaker.
 */
function refineMarkerCenter(gray: GrayImage, marker: MarkerHit, maxRadius: number): MarkerHit {
  const originX = Math.round(marker.x)
  const originY = Math.round(marker.y)
  const darkAt = (x: number, y: number) => (
    x >= 0 && x < gray.width && y >= 0 && y < gray.height && gray.data[y * gray.width + x] < 180
  )
  const bounds = (dx: number, dy: number): [number, number] => {
    let lower = 0
    let upper = 0
    for (const direction of [-1, 1]) {
      let whiteRun = 0
      for (let offset = 1; offset <= maxRadius; offset++) {
        if (darkAt(originX + dx * offset * direction, originY + dy * offset * direction)) {
          whiteRun = 0
          if (direction < 0) lower = -offset
          else upper = offset
        } else if (++whiteRun >= 2) {
          break
        }
      }
    }
    return [lower, upper]
  }
  const [left, right] = bounds(1, 0)
  const [top, bottom] = bounds(0, 1)
  return {
    ...marker,
    x: originX + (left + right) / 2,
    y: originY + (top + bottom) / 2,
  }
}

/** Ước lượng tỉ lệ raster/CSS từ chính ô marker 18px thay vì giả định viewport cố định. */
export function estimateIntegratedFrameReferenceWidth(gray: GrayImage, markers: MarkerHit[], fallbackSizePx: number): number {
  const maxRadius = Math.max(4, Math.ceil(fallbackSizePx * 1.25))
  const sizes = markers.flatMap(marker => [
    markerInkRun(gray, marker, 1, 0, maxRadius),
    markerInkRun(gray, marker, 0, 1, maxRadius),
  ]).filter(size => size >= 3)
  sizes.sort((a, b) => a - b)
  const markerInkPx = sizes.length > 0 ? sizes[Math.floor(sizes.length / 2)] : fallbackSizePx
  const markerSpanPx = Math.hypot(markers[1].x - markers[0].x, markers[1].y - markers[0].y)
  return markerSpanPx * INTEGRATED_MARKER_SIZE / Math.max(1, markerInkPx)
}

/** Tìm 1 marker quanh vị trí kỳ vọng (normalized) — scan window, tối ưu coverage với contrast cục bộ. */
export function findMarker(
  gray: GrayImage,
  id: string,
  expectX: number,
  expectY: number,
  sizePx: number,
  searchMarginMultiplier = 3.5,
  summedArea?: Uint32Array,
): MarkerHit | null {
  const { width, height } = gray
  const sat = summedArea ?? buildSummedArea(gray)
  const cx = expectX * width
  const cy = expectY * height
  const win = Math.max(14, sizePx * searchMarginMultiplier)
  const halfWin = win / 2
  const half = Math.max(2, Math.floor(sizePx / 2))

  const x0 = Math.max(0, Math.floor(cx - halfWin))
  const x1 = Math.min(width, Math.ceil(cx + halfWin))
  const y0 = Math.max(0, Math.floor(cy - halfWin))
  const y1 = Math.min(height, Math.ceil(cy + halfWin))

  let best: { x: number; y: number; cov: number } | null = null
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const ax0 = Math.max(0, xx - half)
      const ay0 = Math.max(0, yy - half)
      const ax1 = Math.min(width, xx + half + 1)
      const ay1 = Math.min(height, yy + half + 1)
      const cnt = (ax1 - ax0) * (ay1 - ay0)
      if (cnt === 0) continue
      const sum = windowSum(sat, width, ax0, ay0, ax1, ay1)
      const cov = 1 - sum / cnt / 255
      if (!best || cov > best.cov) best = { x: xx, y: yy, cov }
    }
  }
  if (!best || best.cov < DARK_THRESHOLD) return null
  return { id, x: best.x, y: best.y, coverage: best.cov }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Đo mực trong TOÀN vùng lõi bubble thay vì chỉ vài sample point.
 *
 * Hai tín hiệu được kết hợp:
 * - mean contrast giữa lõi bubble và nền giấy lân cận;
 * - tỷ lệ pixel thật sự tối hơn nền một khoảng lớn (bắt nét tô/scribble không đều).
 *
 * Cách này vẫn giữ ưu điểm local-background normalization nhưng bớt phụ thuộc
 * việc nét bút có tình cờ đi qua 16 điểm sample cố định hay không.
 */
function sampleDarkness(gray: GrayImage, cx: number, cy: number, r: number, backgroundScale = 1): number {
  const { width, height, data } = gray
  const coreR = Math.max(1.2, r * 0.74)
  const bgInnerR = Math.max(coreR + 1, r * 1.55 * backgroundScale)
  const bgOuterR = Math.max(bgInnerR + 1, r * 2.35 * backgroundScale)
  const x0 = Math.max(0, Math.floor(cx - bgOuterR))
  const x1 = Math.min(width - 1, Math.ceil(cx + bgOuterR))
  const y0 = Math.max(0, Math.floor(cy - bgOuterR))
  const y1 = Math.min(height - 1, Math.ceil(cy + bgOuterR))
  const coreR2 = coreR * coreR
  const bgInnerR2 = bgInnerR * bgInnerR
  const bgOuterR2 = bgOuterR * bgOuterR

  let coreSum = 0
  let coreCount = 0
  let bgSum = 0
  let bgCount = 0

  for (let y = y0; y <= y1; y++) {
    const dy = y - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      const d2 = dx * dx + dy * dy
      const luma = data[y * width + x]
      if (d2 <= coreR2) {
        coreSum += luma
        coreCount++
      } else if (d2 >= bgInnerR2 && d2 <= bgOuterR2) {
        bgSum += luma
        bgCount++
      }
    }
  }

  if (coreCount === 0) return 0
  const coreMean = coreSum / coreCount
  const bgMean = bgCount > 0 ? bgSum / bgCount : 245
  const meanContrast = clamp01((bgMean - coreMean) / Math.max(96, bgMean))

  // Đếm pixel mực đậm sau khi đã biết nền địa phương. Delta 82 giữ nét chì nhạt
  // trong vùng review thay vì đẩy thẳng sang filled, còn bút xanh/đen vẫn rõ.
  const darkCutoff = Math.max(0, bgMean - 82)
  let darkPixels = 0
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      if (dx * dx + dy * dy > coreR2) continue
      if (data[y * width + x] <= darkCutoff) darkPixels++
    }
  }
  const darkRatio = darkPixels / coreCount

  return clamp01(meanContrast * 0.82 + darkRatio * 0.18)
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)))
  return sorted[index]
}

/**
 * Hiệu chuẩn ngưỡng theo chính tờ phiếu nhưng luôn bị clamp quanh ngưỡng production.
 * Nếu distribution không có hai cụm đủ tách biệt thì fallback hoàn toàn về fixed threshold.
 */
function calibrateMcThresholds(readings: OmrOptionReading[]): { fill: number; weak: number } {
  const coverages = readings.map(reading => reading.coverage).filter(Number.isFinite)
  if (coverages.length < 8) return { fill: MIN_FILL, weak: MIN_WEAK_FILL }

  const baseline = percentile(coverages, 0.55)
  const high = percentile(coverages, 0.90)
  const separation = high - baseline
  if (separation < 0.20) return { fill: MIN_FILL, weak: MIN_WEAK_FILL }

  const adaptiveFill = baseline + separation * 0.54
  const fill = Math.max(ADAPTIVE_FILL_MIN, Math.min(ADAPTIVE_FILL_MAX, adaptiveFill))
  // Fail-safe: adaptive calibration may lower the weak-mark threshold when the
  // sheet is unusually clean, but it must never RAISE it above the production
  // weak floor. Raising it silently turns a meaningful faint mark into “blank”.
  const weak = Math.max(0.20, Math.min(MIN_WEAK_FILL, fill - 0.17))
  return { fill, weak }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRATED FRAME LOCATOR — tìm rect khung OMR tích hợp theo marker THẬT trên ảnh.
 *
 * Vì sao: template tĩnh INTEGRATED_OMR_MARKERS (khung y 0.16..0.36) KHÔNG khớp
 * hình in thực tế — vị trí khung trên trang phụ thuộc header/meta phía trên và
 * lề in. Locator theo tọa độ trang cố định vì vậy không bao phủ được các bản in
 * và crop camera khác nhau → MISSING_MARKER_TL. Đây là bug thật phát hiện bằng E2E render
 * Chromium thật (test tổng hợp không bắt được vì tự dựng marker đúng template).
 *
 * Giải pháp: quét BAND quanh vùng khung với integral image (O(1)/window), chọn
 * các cửa sổ đa tỉ lệ; candidate phải tối đều bốn quadrant và cô lập với nền,
 * sau đó bốn điểm phải qua gate hình học. Rect đo được → mọi ô bubble tính frame-relative
 * (integratedMcCellsForRect) → miễn nhiễm mọi vị trí/kích thước khung thực tế.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const INTEGRATED_MARKER_BANDS = [
  { id: 'TL', xMin: 0.02, xMax: 0.38, yMin: 0.05, yMax: 0.45, ax: 0.02, ay: 0.05 },
  { id: 'TR', xMin: 0.62, xMax: 0.98, yMin: 0.05, yMax: 0.45, ax: 0.98, ay: 0.05 },
  { id: 'BR', xMin: 0.62, xMax: 0.98, yMin: 0.18, yMax: 0.82, ax: 0.98, ay: 0.82 },
  { id: 'BL', xMin: 0.02, xMax: 0.38, yMin: 0.18, yMax: 0.82, ax: 0.02, ay: 0.82 },
] as const
const INTEGRATED_MARKER_MIN_COVERAGE = 0.72
const COVERAGE_TIE_EPSILON = 0.005

function buildSummedArea(gray: GrayImage): Uint32Array {
  const { width, height, data } = gray
  const sat = new Uint32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    const rowOff = (y + 1) * (width + 1)
    const prevOff = y * (width + 1)
    for (let x = 0; x < width; x++) {
      rowSum += data[y * width + x]
      sat[rowOff + x + 1] = sat[prevOff + x + 1] + rowSum
    }
  }
  return sat
}

function windowSum(sat: Uint32Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  const r0 = y0 * (w + 1)
  const r1 = y1 * (w + 1)
  return sat[r1 + x1] - sat[r0 + x1] - sat[r1 + x0] + sat[r0 + x0]
}

function findMarkerInBand(
  gray: GrayImage,
  sat: Uint32Array,
  id: string,
  band: { xMin: number; xMax: number; yMin: number; yMax: number; ax: number; ay: number },
  half: number,
  minCoverage = INTEGRATED_MARKER_MIN_COVERAGE,
): MarkerHit | null {
  const { width, height } = gray
  const x0 = Math.max(0, Math.floor(band.xMin * width))
  const x1 = Math.min(width, Math.ceil(band.xMax * width))
  const y0 = Math.max(0, Math.floor(band.yMin * height))
  const y1 = Math.min(height, Math.ceil(band.yMax * height))
  const bigHalf = Math.max(2, Math.round(half * 1.55))
  const stride = Math.max(1, Math.floor(half / 3))
  let best: { x: number; y: number; cov: number; quality: number; d: number } | null = null
  for (let yy = y0; yy < y1; yy += stride) {
    for (let xx = x0; xx < x1; xx += stride) {
      const ax0 = Math.max(0, xx - half)
      const ay0 = Math.max(0, yy - half)
      const ax1 = Math.min(width, xx + half + 1)
      const ay1 = Math.min(height, yy + half + 1)
      const cnt = (ax1 - ax0) * (ay1 - ay0)
      if (cnt === 0) continue
      const sum = windowSum(sat, width, ax0, ay0, ax1, ay1)
      const cov = 1 - sum / cnt / 255
      if (cov < minCoverage) continue

      const midX = Math.floor((ax0 + ax1) / 2)
      const midY = Math.floor((ay0 + ay1) / 2)
      const quadrants = [
        [ax0, ay0, midX, midY],
        [midX, ay0, ax1, midY],
        [ax0, midY, midX, ay1],
        [midX, midY, ax1, ay1],
      ] as const
      let minQuadrantCoverage = 1
      for (const [qx0, qy0, qx1, qy1] of quadrants) {
        const qCount = Math.max(1, (qx1 - qx0) * (qy1 - qy0))
        const qCoverage = 1 - windowSum(sat, width, qx0, qy0, qx1, qy1) / qCount / 255
        minQuadrantCoverage = Math.min(minQuadrantCoverage, qCoverage)
      }
      if (minQuadrantCoverage < Math.max(0.42, minCoverage * 0.68)) continue

      const bx0 = Math.max(0, xx - bigHalf)
      const by0 = Math.max(0, yy - bigHalf)
      const bx1 = Math.min(width, xx + bigHalf + 1)
      const by1 = Math.min(height, yy + bigHalf + 1)
      const bigCount = Math.max(1, (bx1 - bx0) * (by1 - by0))
      const bigCoverage = 1 - windowSum(sat, width, bx0, by0, bx1, by1) / bigCount / 255
      const isolation = cov - bigCoverage
      if (bigCoverage >= 0.72 || isolation < 0.08) continue

      const d = Math.hypot(xx / width - band.ax, yy / height - band.ay)
      const quality = cov + isolation * 0.65 + minQuadrantCoverage * 0.2
      if (!best
        || quality > best.quality + COVERAGE_TIE_EPSILON
        || (Math.abs(quality - best.quality) <= COVERAGE_TIE_EPSILON && d < best.d)) {
        best = { x: xx, y: yy, cov, quality, d }
      }
    }
  }
  if (!best) return null
  return refineMarkerCenter(
    gray,
    { id, x: best.x, y: best.y, coverage: best.cov },
    Math.max(6, Math.ceil(INTEGRATED_CORNER_SIZE * Math.min(width, height))),
  )
}

export interface IntegratedFrameLocation {
  markers: MarkerHit[]
  sizePx: number
  rect: FrameRect
}

export function tryLocateIntegratedFrame(gray: GrayImage, totalQuestions = 50): IntegratedFrameLocation | null {
  const sat = buildSummedArea(gray)
  for (const scale of [1, 0.82, 0.68, 0.55, 0.45, 0.38]) {
    const sizePx = INTEGRATED_CORNER_SIZE * Math.min(gray.width, gray.height) * scale
    const half = Math.max(2, Math.floor(sizePx / 2))
    const tl = findMarkerInBand(gray, sat, 'TL', INTEGRATED_MARKER_BANDS[0], half)
    if (!tl) continue
    const tr = findMarkerInBand(gray, sat, 'TR', INTEGRATED_MARKER_BANDS[1], half)
    if (!tr) continue

    const belowTop = Math.max(tl.y, tr.y) + half + 1
    const brBand = { ...INTEGRATED_MARKER_BANDS[2], yMin: Math.max(INTEGRATED_MARKER_BANDS[2].yMin, belowTop / gray.height) }
    const blBand = { ...INTEGRATED_MARKER_BANDS[3], yMin: Math.max(INTEGRATED_MARKER_BANDS[3].yMin, belowTop / gray.height) }
    const br = findMarkerInBand(gray, sat, 'BR', brBand, half)
    if (!br) continue
    const bl = findMarkerInBand(gray, sat, 'BL', blBand, half)
    if (!bl) continue

    const rect: FrameRect = {
      x0: tl.x / gray.width,
      y0: tl.y / gray.height,
      x1: tr.x / gray.width,
      y1: bl.y / gray.height,
    }
    const rectW = rect.x1 - rect.x0
    const rectH = rect.y1 - rect.y0
    const alignTolerance = Math.max(4, sizePx * 2.5)
    // Một hàng (đề rất ngắn) chỉ cao khoảng 3.7% trang A4; vẫn phải qua gate
    // tỷ lệ khung động bên dưới nên có thể hạ sàn mà không nhận bốn điểm tùy ý.
    if (rectW < 0.45 || rectH < 0.025 || rectH > 0.35) continue
    if (rectW / rectH < 3) continue
    const pixelAspect = (rectW * gray.width) / (rectH * gray.height)
    const expectedAspect = integratedFrameAspectRatio(totalQuestions)
    if (pixelAspect < expectedAspect * 0.62 || pixelAspect > expectedAspect * 1.55) continue
    if (Math.abs(tl.y - tr.y) > alignTolerance || Math.abs(bl.y - br.y) > alignTolerance) continue
    if (Math.abs(tl.x - bl.x) > alignTolerance || Math.abs(tr.x - br.x) > alignTolerance) continue
    return { markers: [tl, tr, br, bl], sizePx, rect }
  }
  return null
}

const FULL_PAGE_MARKER_BANDS = [
  { id: 'TL', xMin: 0.01, xMax: 0.44, yMin: 0.10, yMax: 0.48, ax: 0.05, ay: 0.28 },
  { id: 'TR', xMin: 0.56, xMax: 0.99, yMin: 0.10, yMax: 0.48, ax: 0.95, ay: 0.28 },
  { id: 'BR', xMin: 0.56, xMax: 0.99, yMin: 0.65, yMax: 0.99, ax: 0.95, ay: 0.93 },
  { id: 'BL', xMin: 0.01, xMax: 0.44, yMin: 0.65, yMax: 0.99, ax: 0.05, ay: 0.93 },
] as const

export function tryLocateFullPageFrame(gray: GrayImage): { markers: MarkerHit[]; sizePx: number } | null {
  const sat = buildSummedArea(gray)
  for (const scale of [1, 0.84, 0.70, 0.58]) {
    const sizePx = CORNER_SIZE * Math.min(gray.width, gray.height) * scale
    const half = Math.max(3, Math.floor(sizePx / 2))
    const tl = findMarkerInBand(gray, sat, 'TL', FULL_PAGE_MARKER_BANDS[0], half, 0.62)
    const tr = findMarkerInBand(gray, sat, 'TR', FULL_PAGE_MARKER_BANDS[1], half, 0.62)
    const br = findMarkerInBand(gray, sat, 'BR', FULL_PAGE_MARKER_BANDS[2], half, 0.62)
    const bl = findMarkerInBand(gray, sat, 'BL', FULL_PAGE_MARKER_BANDS[3], half, 0.62)
    if (!tl || !tr || !br || !bl) continue

    const edgeMargin = sizePx * 0.62
    if ([tl, tr, br, bl].some(marker => (
      marker.x < edgeMargin
      || marker.x > gray.width - edgeMargin
      || marker.y < edgeMargin
      || marker.y > gray.height - edgeMargin
    ))) continue

    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y)
    const bottomW = Math.hypot(br.x - bl.x, br.y - bl.y)
    const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y)
    const rightH = Math.hypot(br.x - tr.x, br.y - tr.y)
    const meanW = (topW + bottomW) / 2
    const meanH = (leftH + rightH) / 2
    if (meanW < gray.width * 0.36 || meanH < gray.height * 0.30) continue
    const aspect = meanW / meanH
    if (aspect < 0.72 || aspect > 1.40) continue
    if (Math.min(topW, bottomW) / Math.max(topW, bottomW) < 0.68) continue
    if (Math.min(leftH, rightH) / Math.max(leftH, rightH) < 0.68) continue

    const cross = (a: MarkerHit, b: MarkerHit, c: MarkerHit) =>
      (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    const turns = [cross(tl, tr, br), cross(tr, br, bl), cross(br, bl, tl), cross(bl, tl, tr)]
    if (!turns.every(turn => turn > 0) && !turns.every(turn => turn < 0)) continue

    return { markers: [tl, tr, br, bl], sizePx }
  }
  return null
}

export function hasLikelyPaperSurface(img: ImageData, markers: MarkerHit[]): boolean {
  if (markers.length !== 4 || !img?.data?.length) return false
  const [tl, tr, br, bl] = markers
  let neutralLight = 0
  let sampled = 0

  for (let row = 1; row < PAPER_SAMPLE_ROWS - 1; row++) {
    const v = row / (PAPER_SAMPLE_ROWS - 1)
    const leftX = tl.x + (bl.x - tl.x) * v
    const leftY = tl.y + (bl.y - tl.y) * v
    const rightX = tr.x + (br.x - tr.x) * v
    const rightY = tr.y + (br.y - tr.y) * v

    for (let col = 1; col < PAPER_SAMPLE_COLS - 1; col++) {
      const u = col / (PAPER_SAMPLE_COLS - 1)
      const x = Math.round(leftX + (rightX - leftX) * u)
      const y = Math.round(leftY + (rightY - leftY) * u)
      if (x < 0 || x >= img.width || y < 0 || y >= img.height) continue

      const pixel = (y * img.width + x) * 4
      const r = img.data[pixel]
      const g = img.data[pixel + 1]
      const b = img.data[pixel + 2]
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      const spread = Math.max(r, g, b) - Math.min(r, g, b)
      sampled++
      if (luma >= PAPER_MIN_LUMA && spread <= PAPER_MAX_CHANNEL_SPREAD) neutralLight++
    }
  }

  return sampled > 0 && neutralLight / sampled >= PAPER_MIN_NEUTRAL_LIGHT_FRACTION
}

export function detectScoreFromImage(img: ImageData, maxScore = 10): OmrResult {
  const fail = (reason: string): OmrResult => ({ ok: false, score: null, confidence: 0, cells: [], reason })

  if (!img || img.width < 100 || img.height < 100) return fail('IMAGE_TOO_SMALL')
  const gray = toGrayscale(img)
  const located = tryLocateFullPageFrame(gray)

  if (!located) return fail('MISSING_MARKER_TL')

  const { markers, sizePx } = located
  if (!hasLikelyPaperSurface(img, markers)) return fail('NO_PAPER_SURFACE')

  const src = CORNER_MARKERS.map(m => ({ x: m.x, y: m.y }))
  const dst = markers.map(m => ({ x: m.x / gray.width, y: m.y / gray.height }))
  const H: Mat3 | null = computeHomography(src, dst)
  if (!H) return fail('HOMOGRAPHY_FAILED')

  const cells = allCells(maxScore)
  const readings: OmrCell[] = []
  for (const cell of cells) {
    const center = applyHomography(H, { x: cell.x, y: cell.y })
    if (!isFinite(center.x) || !isFinite(center.y)) return fail('CELL_OUT_OF_IMAGE')
    const px = center.x * gray.width
    const py = center.y * gray.height
    // Keep the written core compact enough to detect partial pencil/pen marks,
    // but move only the local-paper annulus beyond the 36px printed score box.
    // This avoids contrast cancellation without diluting a small real mark.
    const r = Math.max(1.5, sizePx * 0.22)
    readings.push({ score: cell.score, coverage: sampleDarkness(gray, px, py, r, 1.45) })
  }

  const sorted = [...readings].sort((a, b) => b.coverage - a.coverage)
  const top = sorted[0]
  const second = sorted[1] ?? { coverage: 0 }
  if (!top || top.coverage < MIN_FILL) return { ok: false, score: null, confidence: 0, cells: readings, reason: 'NO_CELL_FILLED' }
  const gap = top.coverage - second.coverage
  const score = top.score
  if (gap < MIN_GAP) return { ok: false, score, confidence: gap, cells: readings, reason: 'AMBIGUOUS' }
  return { ok: true, score, confidence: gap, cells: readings, reason: 'OK' }
}

export interface OmrOptionReading {
  option: 'A' | 'B' | 'C' | 'D'
  coverage: number
}

export interface OmrQuestionResult {
  questionIndex: number
  selectedAnswer: 'A' | 'B' | 'C' | 'D' | null
  correctAnswer?: 'A' | 'B' | 'C' | 'D'
  isCorrect?: boolean
  isBlank: boolean
  isMultiFill: boolean
  /** Có dấu tô yếu, nhiều ô hoặc top-vs-second quá sát; không lưu trước khi xử lý. */
  needsReview: boolean
  isWeakMark: boolean
  /** UI đã xác nhận/sửa thủ công câu này sau khi detector trả kết quả. */
  wasCorrected?: boolean
  confidence: number
  readings: OmrOptionReading[]
}

export interface OmrMultipleChoiceResult {
  ok: boolean
  status: 'accepted' | 'review_required' | 'rejected'
  score: number | null
  rawCorrectCount: number
  totalQuestions: number
  confidence: number
  questions: OmrQuestionResult[]
  reason: string
}

export type OmrTemplateMode = 'auto' | 'integrated' | 'full_page'

export function detectAnswersFromImage(
  img: ImageData,
  answerKey?: Record<number, 'A' | 'B' | 'C' | 'D'>,
  totalQuestions = 20,
  maxScore = 10,
  templateMode: OmrTemplateMode = 'auto',
): OmrMultipleChoiceResult {
  const fail = (reason: string): OmrMultipleChoiceResult => ({
    ok: false,
    status: 'rejected',
    score: null,
    rawCorrectCount: 0,
    totalQuestions,
    confidence: 0,
    questions: [],
    reason,
  })

  if (!img || img.width < 100 || img.height < 100) return fail('IMAGE_TOO_SMALL')
  const gray = toGrayscale(img)

  let located: IntegratedFrameLocation | { markers: MarkerHit[]; sizePx: number } | null = null
  let frameRect: FrameRect | null = null
  if (templateMode !== 'full_page') {
    const integratedLocation = tryLocateIntegratedFrame(gray, totalQuestions)
    if (integratedLocation) {
      located = integratedLocation
      frameRect = integratedLocation.rect
    }
  }
  if (!located && templateMode !== 'integrated') located = tryLocateFullPageFrame(gray)

  if (!located) return fail('MISSING_MARKER_TL')

  const { markers, sizePx } = located
  if (!hasLikelyPaperSurface(img, markers)) return fail('NO_PAPER_SURFACE')

  const src = frameRect
    ? [
        { x: frameRect.x0, y: frameRect.y0 },
        { x: frameRect.x1, y: frameRect.y0 },
        { x: frameRect.x1, y: frameRect.y1 },
        { x: frameRect.x0, y: frameRect.y1 },
      ]
    : CORNER_MARKERS.map(m => ({ x: m.x, y: m.y }))
  const dst = markers.map(m => ({ x: m.x / gray.width, y: m.y / gray.height }))
  const H: Mat3 | null = computeHomography(src, dst)
  if (!H) return fail('HOMOGRAPHY_FAILED')

  const mcCells = (
    frameRect
      ? integratedMcCellsForRect(
          totalQuestions,
          frameRect,
          estimateIntegratedFrameReferenceWidth(gray, markers, sizePx),
        )
      : allMcCells(totalQuestions)
  ) as Array<{ questionIndex: number; option: 'A' | 'B' | 'C' | 'D'; x: number; y: number }>

  const questionReadingsMap: Record<number, OmrOptionReading[]> = {}
  const allOptionReadings: OmrOptionReading[] = []
  for (const cell of mcCells) {
    const center = applyHomography(H, { x: cell.x, y: cell.y })
    if (!isFinite(center.x) || !isFinite(center.y)) return fail('CELL_OUT_OF_IMAGE')
    const px = center.x * gray.width
    const py = center.y * gray.height
    const r = Math.max(1.5, sizePx * 0.24)
    const reading = { option: cell.option, coverage: sampleDarkness(gray, px, py, r) }
    if (!questionReadingsMap[cell.questionIndex]) questionReadingsMap[cell.questionIndex] = []
    questionReadingsMap[cell.questionIndex].push(reading)
    allOptionReadings.push(reading)
  }

  const thresholds = calibrateMcThresholds(allOptionReadings)
  const questions: OmrQuestionResult[] = []
  let rawCorrectCount = 0

  for (let q = 1; q <= totalQuestions; q++) {
    const readings = questionReadingsMap[q] || []
    const sorted = [...readings].sort((a, b) => b.coverage - a.coverage)
    const top = sorted[0]
    const second = sorted[1] ?? { coverage: 0 }
    const filledCount = readings.filter(r => r.coverage >= thresholds.fill).length

    const isBlank = filledCount === 0
    const isMultiFill = filledCount > 1
    const isWeakMark = isBlank && Boolean(top && top.coverage >= thresholds.weak)
    const confidence = top ? top.coverage - second.coverage : 0
    const isSingleAmbiguous = filledCount === 1 && Boolean(top && top.coverage >= thresholds.fill) && confidence < MIN_QUESTION_GAP
    const needsReview = isMultiFill || isWeakMark || isSingleAmbiguous
    const selectedAnswer = (!isBlank && !isMultiFill && !isSingleAmbiguous && top && top.coverage >= thresholds.fill) ? top.option : null

    const correctAnswer = answerKey?.[q]
    const isCorrect = selectedAnswer && correctAnswer ? selectedAnswer === correctAnswer : undefined
    if (isCorrect) rawCorrectCount++

    questions.push({
      questionIndex: q,
      selectedAnswer,
      correctAnswer,
      isCorrect,
      isBlank,
      isMultiFill,
      needsReview,
      isWeakMark,
      confidence,
      readings,
    })
  }

  const scaledScore = totalQuestions > 0 ? Math.round((rawCorrectCount / totalQuestions) * maxScore * 10) / 10 : 0
  const answeredQuestions = questions.filter(q => q.selectedAnswer !== null)
  const answeredCount = answeredQuestions.length
  const reviewQuestions = questions.filter(q => q.needsReview)

  if (answeredCount === 0) {
    if (reviewQuestions.length > 0) {
      const reviewConfidence = reviewQuestions.reduce((sum, question) => sum + question.confidence, 0) / reviewQuestions.length
      return {
        ok: true,
        status: 'review_required',
        score: scaledScore,
        rawCorrectCount: 0,
        totalQuestions,
        confidence: reviewConfidence,
        questions,
        reason: 'REVIEW_REQUIRED',
      }
    }
    return {
      ok: false,
      status: 'rejected',
      score: null,
      rawCorrectCount: 0,
      totalQuestions,
      confidence: 0,
      questions,
      reason: 'ALL_BLANK',
    }
  }

  const answeredConfidence = answeredQuestions.reduce((sum, question) => sum + question.confidence, 0) / answeredCount

  if (answeredConfidence < MIN_ANSWER_CONFIDENCE) {
    return {
      ok: false,
      status: 'rejected',
      score: null,
      rawCorrectCount,
      totalQuestions,
      confidence: answeredConfidence,
      questions,
      reason: 'LOW_CONFIDENCE',
    }
  }

  return {
    ok: true,
    status: reviewQuestions.length > 0 ? 'review_required' : 'accepted',
    score: scaledScore,
    rawCorrectCount,
    totalQuestions,
    confidence: answeredConfidence,
    questions,
    reason: reviewQuestions.length > 0 ? 'REVIEW_REQUIRED' : 'OK',
  }
}

export type { Mat3 }
