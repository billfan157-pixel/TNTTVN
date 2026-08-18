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
const MIN_ANSWER_CONFIDENCE = 0.06
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

/**
 * Đo độ đen cục bộ với phân tích đa vòng tròn (core disk vs outer baseline)
 * Giúp miễn nhiễm với bóng mờ tay cầm điện thoại hoặc ánh sáng không đều.
 */
function sampleDarkness(gray: GrayImage, cx: number, cy: number, r: number): number {
  const { width, height, data } = gray
  let coreSum = 0
  let coreCnt = 0

  // 1. Lấy mẫu tâm lõi ô (Core disk)
  const S = 16
  for (let k = 0; k < S; k++) {
    const ang = (k / S) * Math.PI * 2
    const xi = Math.round(cx + Math.cos(ang) * (r * 0.65))
    const yi = Math.round(cy + Math.sin(ang) * (r * 0.65))
    if (xi >= 0 && xi < width && yi >= 0 && yi < height) {
      coreSum += data[yi * width + xi]
      coreCnt++
    }
  }
  const xc = Math.round(cx), yc = Math.round(cy)
  if (xc >= 0 && xc < width && yc >= 0 && yc < height) {
    coreSum += data[yc * width + xc]
    coreCnt++
  }
  if (coreCnt === 0) return 0
  const rawCoreDarkness = 1 - (coreSum / coreCnt) / 255

  // 2. Lấy mẫu nền giấy xung quanh (Outer Annulus baseline)
  let bgSum = 0
  let bgCnt = 0
  const bgR = r * 2.2
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2
    const xi = Math.round(cx + Math.cos(ang) * bgR)
    const yi = Math.round(cy + Math.sin(ang) * bgR)
    if (xi >= 0 && xi < width && yi >= 0 && yi < height) {
      bgSum += data[yi * width + xi]
      bgCnt++
    }
  }
  const bgDarkness = bgCnt > 0 ? 1 - (bgSum / bgCnt) / 255 : 0.05
  // Độ đen tương đối so với nền giấy trắng xung quanh
  const relativeCoverage = Math.max(0, Math.min(1, rawCoreDarkness - bgDarkness * 0.45))
  return relativeCoverage
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
  // Camera thật luôn có lề bàn quanh tờ A4. Vì vậy marker không nằm sát 0%/100%
  // của frame video như ảnh render trang đầy khung. Các band rộng này vẫn chia
  // trái/phải rõ ràng, còn geometry + kiểm tra kích thước phía dưới chặn blob giả.
  { id: 'TL', xMin: 0.02, xMax: 0.38, yMin: 0.05, yMax: 0.45, ax: 0.02, ay: 0.05 },
  { id: 'TR', xMin: 0.62, xMax: 0.98, yMin: 0.05, yMax: 0.45, ax: 0.98, ay: 0.05 },
  { id: 'BR', xMin: 0.62, xMax: 0.98, yMin: 0.18, yMax: 0.82, ax: 0.98, ay: 0.82 },
  { id: 'BL', xMin: 0.02, xMax: 0.38, yMin: 0.18, yMax: 0.82, ax: 0.02, ay: 0.82 },
] as const
/** Marker integrated là ô vuông đặc 18px trên bản in chuẩn; camera có thể thu
 * nhỏ còn khoảng 10–16px. Coverage kết hợp quadrant + isolation ở locator. */
const INTEGRATED_MARKER_MIN_COVERAGE = 0.72
/** Sai số tie coverage giữa các marker giống hệt nhau — chọn vị trí gần góc band hơn.
 * 0.005 đủ lớn để nuốt noise render giữa các marker y hệt nhau (đo thực tế: chênh
 * ≤0.002 do anti-aliasing) nhưng vẫn nhỏ hơn nhiều khoảng cách cov tới blob lạ
 * (QR ~0.4-0.5, bubble tô ~0.68, marker ~0.89). */
const COVERAGE_TIE_EPSILON = 0.005

/** Integral image (summed-area table) — tổng cửa sổ O(1). */
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

/** Quét band tìm một ô vuông tối, đồng đều và có nền sáng bao quanh.
 *
 * Bản cũ lấy blob tối nhất trước rồi mới kiểm tra kích thước. Nếu QR/chữ/icon
 * trong band tối hơn marker thật, blob đó bị loại nhưng detector không quay lại
 * ứng viên đứng thứ hai. Bản này chấm đồng thời cửa sổ marker và cửa sổ 2×,
 * loại blob lớn ngay trong lúc tìm; bốn quadrant phải cùng tối để loại nét chữ.
 */
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

  // Vành kiểm tra chỉ lớn hơn marker khoảng 1.55× bán kính. Dùng 2× làm cửa
  // sổ chạm bubble sát mép khung trên bản 8 cột, khiến marker thật bị loại;
  // 1.55× vẫn loại QR/khối chữ lớn nhưng không nuốt ô đáp án lân cận.
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
  return { id, x: best.x, y: best.y, coverage: best.cov }
}

export interface IntegratedFrameLocation {
  markers: MarkerHit[]
  sizePx: number
  rect: FrameRect
}

/** Tìm 4 marker khung integrated (thứ tự TL, TR, BR, BL) → rect khung.
 * 2 bước: tìm hàng trên trước (TL/TR), rồi giới hạn band dưới BẮT ĐẦU dưới
 * hàng trên (tránh TR/TL được quét lại trong band BR/BL — các marker là ô
 * vuông giống hệt nên cov bằng nhau, scan tie sẽ chọn nhầm marker hàng trên). */
export function tryLocateIntegratedFrame(gray: GrayImage, totalQuestions = 50): IntegratedFrameLocation | null {
  const sat = buildSummedArea(gray)
  // Ảnh iPhone thực tế cho thấy A4 có thể chỉ chiếm 50–70% khung camera và
  // marker 18px khi in chỉ còn 10–16px. Quét tới scale 0.4 để không bỏ marker
  // thật chỉ vì frame có lề bàn/UI lớn.
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
    // Bốn hit phải thật sự tạo thành một hình chữ nhật thấp và rộng. Gate này
    // ngăn bubble/marker toàn trang rải rác trong band rộng bị ghép thành khung giả.
    if (rectW < 0.45 || rectH < 0.045 || rectH > 0.35) continue
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

/**
 * Dò marker phiếu A4 rời độc lập với mép frame camera.
 *
 * Locator cũ chỉ tìm quanh x=5%/95% của toàn video, trong khi guide yêu cầu để
 * trọn A4 trong ảnh (marker thực tế thường ở x≈18–82%). Khi không thấy marker
 * thật nó có thể lấy chữ/viền tối làm marker và sinh đáp án giả. Locator rộng
 * này bắt buộc bốn ô vuông cô lập tạo thành một tứ giác gần vuông trong pixel
 * (khung marker full-page có width≈height trên A4 dọc).
 */
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

    // Guide yêu cầu giữ trọn A4. Marker thật có lề giấy và halo trắng nên tâm
    // không thể sát mép ảnh. Đây là guard quan trọng chống lấy cạnh UI/vật tối
    // bị crop làm marker (đã tái hiện trên ảnh iPhone: TR cách mép chỉ 13px).
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
    // Marker full-page trên A4 dọc có tỷ lệ gần 1:1. Giữ biên cho phối cảnh
    // camera nhưng loại tứ giác cực cao/rộng ghép từ các phần tử UI rời rạc.
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

/**
 * Xác nhận bốn marker thực sự nằm trên một bề mặt giấy sáng/trung tính.
 * Marker-only trước đây có thể ghép bốn vật tối trên bàn thành một phiếu giả.
 * Lấy mẫu theo phép nội suy tứ giác để vẫn hoạt động khi tờ giấy bị phối cảnh.
 */
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

/**
 * Full pipeline: ảnh → 4 marker → homography → 11 cell coverage → score.
 */
export function detectScoreFromImage(img: ImageData, maxScore = 10): OmrResult {
  const fail = (reason: string): OmrResult => ({ ok: false, score: null, confidence: 0, cells: [], reason })

  if (!img || img.width < 100 || img.height < 100) return fail('IMAGE_TOO_SMALL')
  const gray = toGrayscale(img)

  // Phiếu điểm tự luận luôn là mẫu A4 rời. Không fallback sang khung integrated:
  // hai mẫu có geometry khác nhau và fallback mù có thể biến chữ thành marker.
  const located = tryLocateFullPageFrame(gray)

  if (!located) {
    return fail('MISSING_MARKER_TL')
  }

  const { markers, sizePx } = located
  if (!hasLikelyPaperSurface(img, markers)) return fail('NO_PAPER_SURFACE')

  // 2. Homography: normalized template → ảnh
  const src = CORNER_MARKERS.map(m => ({ x: m.x, y: m.y }))
  const dst = markers.map(m => ({ x: m.x / gray.width, y: m.y / gray.height }))
  const H: Mat3 | null = computeHomography(src, dst)
  if (!H) return fail('HOMOGRAPHY_FAILED')

  // 3. Cell coverage
  const cells = allCells(maxScore)
  const readings: OmrCell[] = []
  for (const cell of cells) {
    const center = applyHomography(H, { x: cell.x, y: cell.y })
    if (!isFinite(center.x) || !isFinite(center.y)) return fail('CELL_OUT_OF_IMAGE')
    const px = center.x * gray.width
    const py = center.y * gray.height
    const r = Math.max(1.5, sizePx * 0.22)
    readings.push({ score: cell.score, coverage: sampleDarkness(gray, px, py, r) })
  }

  // 4. Pick: cell tối nhất; gap với cell nhì phải đủ lớn
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
  confidence: number
  readings: OmrOptionReading[]
}

export interface OmrMultipleChoiceResult {
  ok: boolean
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
    score: null,
    rawCorrectCount: 0,
    totalQuestions,
    confidence: 0,
    questions: [],
    reason,
  })

  if (!img || img.width < 100 || img.height < 100) return fail('IMAGE_TOO_SMALL')
  const gray = toGrayscale(img)

  // Chỉ chạy locator của mode được chọn. `auto` thử hai locator đã có geometry
  // gate; production UI luôn truyền integrated/full_page rõ để cấm fallback chéo.
  let located: IntegratedFrameLocation | { markers: MarkerHit[]; sizePx: number } | null = null
  let frameRect: FrameRect | null = null
  if (templateMode !== 'full_page') {
    const integratedLocation = tryLocateIntegratedFrame(gray, totalQuestions)
    if (integratedLocation) {
      located = integratedLocation
      frameRect = integratedLocation.rect
    }
  }
  if (!located && templateMode !== 'integrated') {
    located = tryLocateFullPageFrame(gray)
  }

  if (!located) {
    return fail('MISSING_MARKER_TL')
  }

  const { markers, sizePx } = located
  if (!hasLikelyPaperSurface(img, markers)) return fail('NO_PAPER_SURFACE')

  // 2. Homography: nguồn = rect khung (đo được) hoặc template → ảnh
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

  // A-NEW-50: tọa độ ô phụ thuộc template đang active — phiếu toàn trang dùng
  // `allMcCells` (hệ tọa độ trang), phiếu gộp dùng `integratedMcCellsForRect`
  // (hệ tọa độ KHUNG đo được — không còn phụ thuộc vị trí khung trên trang).
  // Trước đây nhánh integrated lấy tọa độ toàn trang → sample lệch khỏi bubble
  // in thực tế (không bao giờ đọc được).
  const mcCells = (
    frameRect
      ? integratedMcCellsForRect(totalQuestions, frameRect)
      : allMcCells(totalQuestions)
  ) as Array<{ questionIndex: number; option: 'A' | 'B' | 'C' | 'D'; x: number; y: number }>

  const questionReadingsMap: Record<number, OmrOptionReading[]> = {}
  for (const cell of mcCells) {
    const center = applyHomography(H, { x: cell.x, y: cell.y })
    if (!isFinite(center.x) || !isFinite(center.y)) return fail('CELL_OUT_OF_IMAGE')
    const px = center.x * gray.width
    const py = center.y * gray.height
    const r = Math.max(1.5, sizePx * 0.24)
    const cov = sampleDarkness(gray, px, py, r)
    if (!questionReadingsMap[cell.questionIndex]) {
      questionReadingsMap[cell.questionIndex] = []
    }
    questionReadingsMap[cell.questionIndex].push({ option: cell.option, coverage: cov })
  }

  const questions: OmrQuestionResult[] = []
  let rawCorrectCount = 0

  for (let q = 1; q <= totalQuestions; q++) {
    const readings = questionReadingsMap[q] || []
    const sorted = [...readings].sort((a, b) => b.coverage - a.coverage)
    const top = sorted[0]
    const second = sorted[1] ?? { coverage: 0 }
    const filledCount = readings.filter(r => r.coverage >= MIN_FILL).length

    const isBlank = filledCount === 0
    const isMultiFill = filledCount > 1
    const selectedAnswer = (!isBlank && !isMultiFill && top && top.coverage >= MIN_FILL) ? top.option : null
    const confidence = top ? top.coverage - second.coverage : 0

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
      confidence,
      readings,
    })
  }

  const scaledScore = totalQuestions > 0 ? Math.round((rawCorrectCount / totalQuestions) * maxScore * 10) / 10 : 0

  const answeredQuestions = questions.filter(q => q.selectedAnswer !== null)
  const answeredCount = answeredQuestions.length

  // Reject if no questions were answered at all
  if (answeredCount === 0) {
    return {
      ok: false,
      score: null,
      rawCorrectCount: 0,
      totalQuestions,
      confidence: 0,
      questions,
      reason: 'ALL_BLANK',
    }
  }

  // Blank questions are legitimate and still count as wrong in `scaledScore`.
  // They must not dilute the scan confidence: a clearly filled answer on a
  // 50-question sheet is just as readable as one on a 4-question sheet.
  const answeredConfidence = answeredQuestions.reduce((sum, question) => sum + question.confidence, 0) / answeredCount

  // Reject if the answers that were actually detected are ambiguous.
  if (answeredConfidence < MIN_ANSWER_CONFIDENCE) {
    return {
      ok: false,
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
    score: scaledScore,
    rawCorrectCount,
    totalQuestions,
    confidence: answeredConfidence,
    questions,
    reason: 'OK',
  }
}

export type { Mat3 }
