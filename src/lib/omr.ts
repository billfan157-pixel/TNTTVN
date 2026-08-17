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
  INTEGRATED_OMR_MARKERS,
  INTEGRATED_CORNER_SIZE,
  allCells,
  allMcCells,
  integratedMcCells,
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
  searchMarginMultiplier = 3.5
): MarkerHit | null {
  const { width, height, data } = gray
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
      let sum = 0
      let cnt = 0
      for (let dy = -half; dy <= half; dy++) {
        const row = yy + dy
        if (row < 0 || row >= height) continue
        for (let dx = -half; dx <= half; dx++) {
          const col = xx + dx
          if (col < 0 || col >= width) continue
          sum += data[row * width + col]
          cnt++
        }
      }
      if (cnt === 0) continue
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
 * Thử tìm 4 corner marker theo 1 danh sách định vị mẫu (template markers)
 */
function tryLocateMarkers(
  gray: GrayImage,
  templateMarkers: readonly { id: string; x: number; y: number }[],
  markerSizeRatio: number
): { markers: MarkerHit[]; sizePx: number } | null {
  const sizePx = markerSizeRatio * Math.min(gray.width, gray.height)
  const markers: MarkerHit[] = []
  for (const m of templateMarkers) {
    const hit = findMarker(gray, m.id, m.x, m.y, sizePx)
    if (!hit) return null
    markers.push(hit)
  }
  return { markers, sizePx }
}

/**
 * Full pipeline: ảnh → 4 marker → homography → 11 cell coverage → score.
 */
export function detectScoreFromImage(img: ImageData, maxScore = 10): OmrResult {
  const fail = (reason: string): OmrResult => ({ ok: false, score: null, confidence: 0, cells: [], reason })

  if (!img || img.width < 100 || img.height < 100) return fail('IMAGE_TOO_SMALL')
  const gray = toGrayscale(img)

  // 1. Thử tìm Marker theo template toàn trang hoặc integrated
  let located = tryLocateMarkers(gray, CORNER_MARKERS, CORNER_SIZE)
  let activeTemplate: readonly { id: string; x: number; y: number }[] = CORNER_MARKERS
  if (!located) {
    located = tryLocateMarkers(gray, INTEGRATED_OMR_MARKERS, INTEGRATED_CORNER_SIZE)
    if (located) activeTemplate = INTEGRATED_OMR_MARKERS
  }

  if (!located) {
    return fail('MISSING_MARKER_TL')
  }

  const { markers, sizePx } = located

  // 2. Homography: normalized template → ảnh
  const src = activeTemplate.map(m => ({ x: m.x, y: m.y }))
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

export function detectAnswersFromImage(
  img: ImageData,
  answerKey?: Record<number, 'A' | 'B' | 'C' | 'D'>,
  totalQuestions = 20,
  maxScore = 10
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

  // 1. Thử nhận diện theo template toàn trang, nếu không thấy thì thử template phiếu gộp
  let located = tryLocateMarkers(gray, CORNER_MARKERS, CORNER_SIZE)
  let activeTemplate: readonly { id: string; x: number; y: number }[] = CORNER_MARKERS
  if (!located) {
    located = tryLocateMarkers(gray, INTEGRATED_OMR_MARKERS, INTEGRATED_CORNER_SIZE)
    if (located) activeTemplate = INTEGRATED_OMR_MARKERS
  }

  if (!located) {
    return fail('MISSING_MARKER_TL')
  }

  const { markers, sizePx } = located

  const src = activeTemplate.map(m => ({ x: m.x, y: m.y }))
  const dst = markers.map(m => ({ x: m.x / gray.width, y: m.y / gray.height }))
  const H: Mat3 | null = computeHomography(src, dst)
  if (!H) return fail('HOMOGRAPHY_FAILED')

  // A-NEW-50: tọa độ ô phụ thuộc template đang active — phiếu toàn trang dùng
  // `allMcCells` (hệ tọa độ trang), phiếu gộp dùng `integratedMcCells` (hệ tọa
  // độ KHUNG marker y 0.16..0.36). Trước đây nhánh integrated vẫn lấy tọa độ
  // toàn trang → sample lệch khỏi bubble in thực tế (không bao giờ đọc được).
  const mcCells = (
    activeTemplate === INTEGRATED_OMR_MARKERS
      ? integratedMcCells(totalQuestions)
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
  let totalConfidence = 0

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
    totalConfidence += confidence

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

  const avgConfidence = totalQuestions > 0 ? totalConfidence / totalQuestions : 0
  const scaledScore = totalQuestions > 0 ? Math.round((rawCorrectCount / totalQuestions) * maxScore * 10) / 10 : 0

  const answeredCount = questions.filter(q => q.selectedAnswer !== null).length

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

  // Reject if confidence is too low — likely bad scan
  if (avgConfidence < 0.06) {
    return {
      ok: false,
      score: null,
      rawCorrectCount,
      totalQuestions,
      confidence: avgConfidence,
      questions,
      reason: 'LOW_CONFIDENCE',
    }
  }

  return {
    ok: true,
    score: scaledScore,
    rawCorrectCount,
    totalQuestions,
    confidence: avgConfidence,
    questions,
    reason: 'OK',
  }
}

export type { Mat3 }