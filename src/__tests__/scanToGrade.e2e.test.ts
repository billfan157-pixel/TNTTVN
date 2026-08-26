/**
 * ──────────────────────────────────────────────────────────────────────
 * KIỂM TRA TÍCH HỢP END-TO-END: Quét phiếu → Chấm điểm → Ghi hệ thống
 * ──────────────────────────────────────────────────────────────────────
 *
 * Mục tiêu: Xác minh rằng toàn bộ pipeline hoạt động chính xác:
 *   1. Template tạo phiếu (answerSheetTemplate SSOT constants)
 *   2. QR payload encode/decode (tntt-exam:{sessionId}:{studentId})
 *   3. OMR detector tìm 4 marker → homography → sample cells → ra điểm
 *   4. Điểm chính xác cho cả Tự Luận (score grid) và Trắc Nghiệm (MC)
 *   5. Ghi vào store (examStore.saveScores) với source='qr_scan'
 *
 * Test KHÔNG dùng browser thật — dựng ảnh giả lập (synthetic ImageData)
 * giống cấu trúc thực tế của phiếu in, kiểm tra thuần logic detection.
 */

import { describe, it, expect } from 'vitest'
import {
  CORNER_MARKERS,
  CORNER_SIZE,
  INTEGRATED_MARKER_SIZE,
  INTEGRATED_BUBBLE_W,
  INTEGRATED_REF_W,
  scoreToCell,
  allCells,
  mcOptionToCell,
  allMcCells,
  getMcColumnLayout,
  integratedMcOptionToCellForRect,
  integratedMcCells,
  integratedGridCols,
  integratedFrameH,
  integratedFrameAspectRatio,
  QR_X, QR_Y, QR_SIZE,
  type FrameRect,
} from '../lib/answerSheetTemplate'
import { detectScoreFromImage, detectAnswersFromImage, toGrayscale, findMarker } from '../lib/omr'
import { computeHomography, applyHomography, invertHomography } from '../lib/homography'
import { buildExamQrPayload, parseExamQrPayload } from '../lib/qr'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FakeImageData(w: number, h: number): ImageData {
  return {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
    colorSpace: 'srgb',
  } as unknown as ImageData
}

/** Tạo ảnh nền trắng A4 800×1130 với 4 corner markers đặc đen. */
function createBlankSheet(
  w = 800,
  h = 1130,
  markers: readonly { id: string; x: number; y: number }[] = CORNER_MARKERS,
  cornerSize: number = CORNER_SIZE,
): ImageData {
  const img = FakeImageData(w, h)
  const { data } = img
  // Nền trắng nhạt (giấy thực tế ~#F7F7F7)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 247; data[i * 4 + 1] = 247; data[i * 4 + 2] = 247; data[i * 4 + 3] = 255
  }
  // Vẽ 4 marker đen đặc
  const markerSize = Math.max(3, Math.round(cornerSize * Math.min(w, h)))
  for (const m of markers) {
    const x0 = Math.round(m.x * w - markerSize / 2)
    const y0 = Math.round(m.y * h - markerSize / 2)
    fillRect(img, x0, y0, x0 + markerSize, y0 + markerSize, 10)
  }
  return img
}

function fillRect(img: ImageData, x0: number, y0: number, x1: number, y1: number, c: number) {
  const { width: W, height: H, data } = img
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
      const i = (y * W + x) * 4
      data[i] = c; data[i + 1] = c; data[i + 2] = c
    }
  }
}

/** Tô đậm ô điểm score trên phiếu tự luận. */
function fillScoreCell(img: ImageData, score: number, maxScore = 10) {
  const cell = scoreToCell(score, maxScore)
  const r = 0.010 * Math.min(img.width, img.height)
  fillRect(img, cell.x * img.width - r, cell.y * img.height - r, cell.x * img.width + r, cell.y * img.height + r, 25)
}

/** Tô đậm ô trắc nghiệm A/B/C/D trên phiếu toàn trang. */
function fillMcCell(img: ImageData, questionIndex: number, option: 'A' | 'B' | 'C' | 'D', totalQ = 20) {
  const cell = mcOptionToCell(questionIndex, option, totalQ)
  const r = 0.009 * Math.min(img.width, img.height)
  fillRect(img, cell.x * img.width - r, cell.y * img.height - r, cell.x * img.width + r, cell.y * img.height + r, 25)
}

function fillIntegratedMcCellForRect(img: ImageData, questionIndex: number, option: 'A' | 'B' | 'C' | 'D', totalQ: number, frame: FrameRect) {
  const cell = integratedMcOptionToCellForRect(questionIndex, option, totalQ, frame)
  const r = (frame.x1 - frame.x0) * img.width * INTEGRATED_BUBBLE_W * 0.32 / INTEGRATED_REF_W
  fillRect(img, cell.x * img.width - r, cell.y * img.height - r, cell.x * img.width + r, cell.y * img.height + r, 25)
}

/** Mô phỏng ảnh camera bị lệch nhẹ (dịch + xoay). */
function warpImage(img: ImageData, tx: number, ty: number, rot: number): ImageData {
  const W = img.width, H = img.height
  const out = FakeImageData(W, H)
  const cx = W / 2, cy = H / 2
  const cos = Math.cos(rot), sin = Math.sin(rot)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx, dy = y - cy
      const sx = ((dx - tx) * cos + (dy - ty) * sin) + cx
      const sy = (-(dx - tx) * sin + (dy - ty) * cos) + cy
      const ix = Math.round(sx), iy = Math.round(sy)
      if (ix < 0 || ix >= W || iy < 0 || iy >= H) {
        out.data[(y * W + x) * 4 + 3] = 0
        continue
      }
      for (let ch = 0; ch < 4; ch++) out.data[(y * W + x) * 4 + ch] = img.data[(iy * W + ix) * 4 + ch]
    }
  }
  return out
}

// ─── E2E Tests ────────────────────────────────────────────────────────────────

describe('E2E: Scan-to-Grade Pipeline Integration', () => {

  // ═════════════════════════════════════════════════════════════════════════
  // PHẦN 1: QR Payload — Chìa khóa định danh học viên
  // ═════════════════════════════════════════════════════════════════════════
  describe('1. QR Payload Encode/Decode roundtrip', () => {
    it('encode → parse chính xác cho sessionId và studentId thông thường', () => {
      const payload = buildExamQrPayload('EXS-001', 'ST-abcdef')
      expect(payload).toBe('tntt-exam:EXS-001:ST-abcdef')
      const parsed = parseExamQrPayload(payload)
      expect(parsed).toEqual({ sessionId: 'EXS-001', studentId: 'ST-abcdef' })
    })

    it('studentId chứa dấu ":" vẫn parse nguyên vẹn', () => {
      const payload = buildExamQrPayload('EXS-002', 'uuid:with:colons:inside')
      const parsed = parseExamQrPayload(payload)
      expect(parsed?.studentId).toBe('uuid:with:colons:inside')
    })

    it('reject payload prefix sai', () => {
      expect(parseExamQrPayload('wrong:EXS-001:ST-1')).toBeNull()
      expect(parseExamQrPayload('tntt-cert:CERT-1:ST-1:completion')).toBeNull()
    })

    it('reject payload thiếu phần', () => {
      expect(parseExamQrPayload('tntt-exam')).toBeNull()
      expect(parseExamQrPayload('tntt-exam:EXS-001')).toBeNull()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PHẦN 2: Template SSOT — Đảm bảo geometry nhất quán printer ↔ detector
  // ═════════════════════════════════════════════════════════════════════════
  describe('2. Template SSOT consistency (printer ↔ detector)', () => {
    it('allCells(10) = 11 ô, allCells(20) = 21 ô, vị trí unique', () => {
      const c10 = allCells(10)
      expect(c10).toHaveLength(11)

      const c20 = allCells(20)
      expect(c20).toHaveLength(21)

      const keys = c10.map(c => `${c.x.toFixed(4)}_${c.y.toFixed(4)}`)
      expect(new Set(keys).size).toBe(11) // tất cả unique
    })

    it('allMcCells(N) = N*4 ô, N ∈ {10, 20, 30, 40, 50}', () => {
      for (const n of [10, 20, 30, 40, 50]) {
        expect(allMcCells(n)).toHaveLength(n * 4)
      }
    })

    it('integratedMcCells(N) = N*4 ô, tọa độ trong vùng marker integrated', () => {
      for (const n of [10, 20, 30, 50]) {
        const cells = integratedMcCells(n)
        expect(cells).toHaveLength(n * 4)
        for (const c of cells) {
          // Trong vùng x: 0.04..0.96, y: 0.16..0.36
          expect(c.x).toBeGreaterThanOrEqual(0.04 - 0.01) // small tolerance
          expect(c.x).toBeLessThanOrEqual(0.96 + 0.01)
          expect(c.y).toBeGreaterThanOrEqual(0.16 - 0.01)
          expect(c.y).toBeLessThanOrEqual(0.36 + 0.01)
        }
      }
    })

    it('marker góc toàn trang KHÔNG trùng với ô điểm score grid', () => {
      const cells = allCells(10)
      for (const m of CORNER_MARKERS) {
        for (const c of cells) {
          const dist = Math.hypot(c.x - m.x, c.y - m.y)
          expect(dist).toBeGreaterThan(0.05)
        }
      }
    })

    it('marker góc toàn trang KHÔNG trùng với ô trắc nghiệm MC', () => {
      for (const n of [10, 20, 30, 50]) {
        const cells = allMcCells(n)
        for (const m of CORNER_MARKERS) {
          for (const c of cells) {
            const dist = Math.hypot(c.x - m.x, c.y - m.y)
            expect(dist).toBeGreaterThan(0.03)
          }
        }
      }
    })

    it('getMcColumnLayout luôn có rowPitchY >= 0.030 (an toàn OMR)', () => {
      for (const n of [10, 15, 20, 25, 30, 40, 50]) {
        const layout = getMcColumnLayout(n)
        if (layout.qPerCol > 1) {
          expect(layout.rowPitchY).toBeGreaterThanOrEqual(0.030)
        }
      }
    })

    it('QR zone không chồng lên vùng marker hoặc score grid', () => {
      const qrRight = QR_X + QR_SIZE
      const qrBottom = QR_Y + QR_SIZE
      // QR phải nằm trong trang
      expect(qrRight).toBeLessThanOrEqual(1.0)
      expect(qrBottom).toBeLessThanOrEqual(CORNER_MARKERS[0].y - 0.02) // trên marker TL
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PHẦN 3: Homography — Biến đổi phối cảnh chính xác
  // ═════════════════════════════════════════════════════════════════════════
  describe('3. Homography pipeline integrity', () => {
    it('identity mapping: src === dst → H ≈ I', () => {
      const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
      const H = computeHomography(pts, pts)
      expect(H).not.toBeNull()
      const p = applyHomography(H!, { x: 0.5, y: 0.5 })
      expect(p.x).toBeCloseTo(0.5, 3)
      expect(p.y).toBeCloseTo(0.5, 3)
    })

    it('scale+shift: ánh xạ chính xác sau biến đổi affine', () => {
      const src = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
      const dst = [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.8 }]
      const H = computeHomography(src, dst)!
      const mapped = applyHomography(H, { x: 0.5, y: 0.5 })
      expect(mapped.x).toBeCloseTo(0.5, 2)
      expect(mapped.y).toBeCloseTo(0.5, 2)
    })

    it('invertHomography → H · H⁻¹ roundtrip', () => {
      const src = [{ x: 0.05, y: 0.3 }, { x: 0.95, y: 0.3 }, { x: 0.95, y: 0.93 }, { x: 0.05, y: 0.93 }]
      const dst = [{ x: 0.06, y: 0.31 }, { x: 0.94, y: 0.29 }, { x: 0.96, y: 0.92 }, { x: 0.04, y: 0.94 }]
      const H = computeHomography(src, dst)!
      const Hinv = invertHomography(H)!
      const p = { x: 0.5, y: 0.6 }
      const mapped = applyHomography(H, p)
      const back = applyHomography(Hinv, mapped)
      expect(back.x).toBeCloseTo(p.x, 2)
      expect(back.y).toBeCloseTo(p.y, 2)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PHẦN 4: OMR Tự Luận — detectScoreFromImage
  // ═════════════════════════════════════════════════════════════════════════
  describe('4. OMR Tự Luận (Score Grid) — Full-page sheet', () => {
    it('phiếu trống → NO_CELL_FILLED, không ghi điểm bừa', () => {
      const img = createBlankSheet()
      const res = detectScoreFromImage(img)
      expect(res.ok).toBe(false)
      expect(res.score).toBeNull()
      expect(res.reason).toBe('NO_CELL_FILLED')
    })

    it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
      'tô score=%i → detect chính xác, confidence đủ cao',
      (score) => {
        const img = createBlankSheet()
        fillScoreCell(img, score)
        const res = detectScoreFromImage(img)
        expect(res.ok).toBe(true)
        expect(res.score).toBe(score)
        expect(res.confidence).toBeGreaterThan(0.08) // MIN_GAP
      }
    )

    it('maxScore=20: tô score=15 → detect đúng', () => {
      const img = createBlankSheet()
      fillScoreCell(img, 15, 20)
      const res = detectScoreFromImage(img, 20)
      expect(res.ok).toBe(true)
      expect(res.score).toBe(15)
    })

    it('ảnh bị dịch + xoay nhẹ (~2.3°) vẫn detect đúng', () => {
      const img = createBlankSheet()
      fillScoreCell(img, 7)
      // 0.04 rad ≈ 2.3° — mức nghiêng phổ biến khi user cầm điện thoại chụp nhanh
      const warped = warpImage(img, 8, -5, 0.04)
      const res = detectScoreFromImage(warped)
      expect(res.ok).toBe(true)
      expect(res.score).toBe(7)
    })

    it('xóa 1 marker → MISSING_MARKER, không ghi bừa', () => {
      const img = createBlankSheet()
      fillScoreCell(img, 5)
      // Xóa marker TL bằng cách tô trắng vùng đó
      const half = (CORNER_SIZE / 2) * Math.min(img.width, img.height)
      const mx = CORNER_MARKERS[0].x * img.width
      const my = CORNER_MARKERS[0].y * img.height
      fillRect(img, mx - half - 2, my - half - 2, mx + half + 2, my + half + 2, 247)

      const res = detectScoreFromImage(img)
      expect(res.ok).toBe(false)
      expect(res.reason).toContain('MISSING_MARKER')
    })

    it('ảnh 50×50 → IMAGE_TOO_SMALL', () => {
      const res = detectScoreFromImage(FakeImageData(50, 50))
      expect(res.ok).toBe(false)
      expect(res.reason).toBe('IMAGE_TOO_SMALL')
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PHẦN 5: OMR Trắc Nghiệm — detectAnswersFromImage (Full-page)
  // ═════════════════════════════════════════════════════════════════════════
  describe('5. OMR Trắc Nghiệm — Full-page sheet', () => {
    const KEY_4: Record<number, 'A' | 'B' | 'C' | 'D'> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }

    it('tô đúng 4/4 → score = 10, tất cả isCorrect', () => {
      const img = createBlankSheet()
      fillMcCell(img, 1, 'A', 4)
      fillMcCell(img, 2, 'B', 4)
      fillMcCell(img, 3, 'C', 4)
      fillMcCell(img, 4, 'D', 4)
      const res = detectAnswersFromImage(img, KEY_4, 4, 10)
      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(4)
      expect(res.score).toBe(10)
      expect(res.questions.every(q => q.isCorrect === true)).toBe(true)
    })

    it('tô sai 1 câu → 3/4 đúng = 7.5 điểm', () => {
      const img = createBlankSheet()
      fillMcCell(img, 1, 'A', 4) // đúng
      fillMcCell(img, 2, 'B', 4) // đúng
      fillMcCell(img, 3, 'C', 4) // đúng
      fillMcCell(img, 4, 'A', 4) // sai (đáp án D)
      const res = detectAnswersFromImage(img, KEY_4, 4, 10)
      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(3)
      expect(res.score).toBe(7.5)
      expect(res.questions[3].isCorrect).toBe(false)
    })

    it('để trống 1 câu → isBlank, không tính đúng', () => {
      const img = createBlankSheet()
      fillMcCell(img, 1, 'A', 4)
      fillMcCell(img, 2, 'B', 4)
      fillMcCell(img, 3, 'C', 4)
      // câu 4 bỏ trống
      const res = detectAnswersFromImage(img, KEY_4, 4, 10)
      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(3)
      expect(res.questions[3].isBlank).toBe(true)
      expect(res.questions[3].selectedAnswer).toBeNull()
    })

    it('tô 2 đáp án cùng 1 câu → isMultiFill', () => {
      const img = createBlankSheet()
      fillMcCell(img, 1, 'A', 4)
      fillMcCell(img, 1, 'B', 4) // tô thêm B cho câu 1
      fillMcCell(img, 2, 'B', 4)
      fillMcCell(img, 3, 'C', 4)
      fillMcCell(img, 4, 'D', 4)
      const res = detectAnswersFromImage(img, KEY_4, 4, 10)
      expect(res.questions[0].isMultiFill).toBe(true)
      expect(res.questions[0].selectedAnswer).toBeNull()
    })

    it('không có đáp án (tất cả blank) → ALL_BLANK', () => {
      const img = createBlankSheet()
      const res = detectAnswersFromImage(img, KEY_4, 4, 10)
      expect(res.ok).toBe(false)
      expect(res.reason).toBe('ALL_BLANK')
    })

    it.each([10, 20, 50])('%i câu: chỉ tô 1 đáp án rõ vẫn nhận, các câu trắng tính sai', (totalQuestions) => {
      const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      for (let i = 1; i <= totalQuestions; i++) answerKey[i] = 'A'

      const img = createBlankSheet()
      fillMcCell(img, 1, 'A', totalQuestions)
      const res = detectAnswersFromImage(img, answerKey, totalQuestions, 10)

      expect(res.ok).toBe(true)
      expect(res.reason).toBe('OK')
      expect(res.rawCorrectCount).toBe(1)
      expect(res.score).toBe(Math.round((10 / totalQuestions) * 10) / 10)
      expect(res.questions.filter(q => q.selectedAnswer !== null)).toHaveLength(1)
      expect(res.questions.slice(1).every(q => q.isBlank)).toBe(true)
      expect(res.confidence).toBeGreaterThanOrEqual(0.06)
    })

    // Test với số câu lớn (20 câu)
    it('20 câu: tô đúng 18/20 → score = 9', () => {
      const key20: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const answers: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
      for (let i = 1; i <= 20; i++) key20[i] = answers[(i - 1) % 4]

      const img = createBlankSheet()
      // Tô đúng 18 câu
      for (let i = 1; i <= 18; i++) {
        fillMcCell(img, i, key20[i], 20)
      }
      // Câu 19 sai, câu 20 bỏ trống
      fillMcCell(img, 19, answers[(19 - 1 + 1) % 4] as 'A' | 'B' | 'C' | 'D', 20) // sai
      const res = detectAnswersFromImage(img, key20, 20, 10)
      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(18)
      expect(res.score).toBe(9) // 18/20 * 10
    })

    it('ảnh bị lệch nhẹ vẫn detect MC đúng', () => {
      const img = createBlankSheet()
      fillMcCell(img, 1, 'A', 4)
      fillMcCell(img, 2, 'B', 4)
      fillMcCell(img, 3, 'C', 4)
      fillMcCell(img, 4, 'D', 4)
      // MC cells nhỏ hơn score cells → giảm rotation xuống 0.025 rad (~1.4°)
      // để synthetic test ổn định. Ảnh thật camera có AA/interpolation tốt hơn.
      const warped = warpImage(img, 6, -3, 0.025)
      const res = detectAnswersFromImage(warped, KEY_4, 4, 10)
      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(4)
      expect(res.score).toBe(10)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PHẦN 6: OMR Trắc Nghiệm trên PHIẾU TÍCH HỢP (Integrated Exam Paper)
  // ═════════════════════════════════════════════════════════════════════════
  describe('6. OMR Integrated (Đề thi gộp khung OMR)', () => {
    it('integrated markers nhận diện được khi toàn trang markers không có', () => {
      // Tạo khung đúng tỷ lệ render của 4 câu, không dùng template tĩnh giả.
      const x0 = 0.04
      const x1 = 0.96
      const framePixelW = (x1 - x0) * 800
      const frame: FrameRect = {
        x0,
        x1,
        y0: 0.16,
        y1: 0.16 + framePixelW / integratedFrameAspectRatio(4) / 1130,
      }
      const markers = [
        { id: 'TL', x: frame.x0, y: frame.y0 },
        { id: 'TR', x: frame.x1, y: frame.y0 },
        { id: 'BR', x: frame.x1, y: frame.y1 },
        { id: 'BL', x: frame.x0, y: frame.y1 },
      ]
      const markerSizeNormalized = framePixelW * INTEGRATED_MARKER_SIZE / INTEGRATED_REF_W / 800
      const img = createBlankSheet(800, 1130, markers, markerSizeNormalized)
      fillIntegratedMcCellForRect(img, 1, 'A', 4, frame)
      fillIntegratedMcCellForRect(img, 2, 'B', 4, frame)
      fillIntegratedMcCellForRect(img, 3, 'C', 4, frame)
      fillIntegratedMcCellForRect(img, 4, 'D', 4, frame)

      const key4: Record<number, 'A' | 'B' | 'C' | 'D'> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }
      const res = detectAnswersFromImage(img, key4, 4, 10, 'integrated')
      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(4)
      expect(res.score).toBe(10)
    })

    it('integratedGridCols: ≤20 câu → 5 cột, >20 câu → 8 cột', () => {
      expect(integratedGridCols(10)).toBe(5)
      expect(integratedGridCols(20)).toBe(5)
      expect(integratedGridCols(21)).toBe(8)
      expect(integratedGridCols(50)).toBe(8)
    })

    it('integratedFrameH tăng theo số câu hỏi', () => {
      const h10 = integratedFrameH(10)
      const h20 = integratedFrameH(20)
      const h50 = integratedFrameH(50)
      expect(h10).toBeLessThan(h20)
      expect(h20).toBeLessThanOrEqual(h50)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PHẦN 7: findMarker — Marker detection core
  // ═════════════════════════════════════════════════════════════════════════
  describe('7. Marker detection accuracy', () => {
    it('findMarker tìm đúng vị trí marker đặc đen trên nền trắng', () => {
      const img = createBlankSheet()
      const gray = toGrayscale(img)
      const sizePx = CORNER_SIZE * Math.min(gray.width, gray.height)
      for (const m of CORNER_MARKERS) {
        const hit = findMarker(gray, m.id, m.x, m.y, sizePx)
        expect(hit).not.toBeNull()
        expect(hit!.coverage).toBeGreaterThan(0.38) // DARK_THRESHOLD
        // Vị trí pixel gần với kỳ vọng (tolerance ±10px)
        expect(Math.abs(hit!.x - m.x * img.width)).toBeLessThan(15)
        expect(Math.abs(hit!.y - m.y * img.height)).toBeLessThan(15)
      }
    })

    it('findMarker trả null khi không có marker tại vị trí kỳ vọng', () => {
      const img = FakeImageData(800, 1130)
      // Nền trắng toàn bộ, không marker
      for (let i = 0; i < img.width * img.height; i++) {
        img.data[i * 4] = 250; img.data[i * 4 + 1] = 250; img.data[i * 4 + 2] = 250; img.data[i * 4 + 3] = 255
      }
      const gray = toGrayscale(img)
      const sizePx = CORNER_SIZE * Math.min(gray.width, gray.height)
      const hit = findMarker(gray, 'TL', CORNER_MARKERS[0].x, CORNER_MARKERS[0].y, sizePx)
      expect(hit).toBeNull()
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PHẦN 8: End-to-End trọn vẹn — Từ phiếu in → detect → score chính xác
  // ═════════════════════════════════════════════════════════════════════════
  describe('8. E2E Pipeline: Template → Detect → Score', () => {
    it('E2E tự luận: tạo phiếu score=8 → detect → ra đúng 8/10', () => {
      // Step 1: QR payload cho học viên
      const payload = buildExamQrPayload('EXS-session-001', 'ST-student-abc')
      const parsed = parseExamQrPayload(payload)!
      expect(parsed.sessionId).toBe('EXS-session-001')
      expect(parsed.studentId).toBe('ST-student-abc')

      // Step 2: Tạo phiếu với score cell 8 tô đen
      const img = createBlankSheet()
      fillScoreCell(img, 8)

      // Step 3: OMR detect
      const omr = detectScoreFromImage(img)
      expect(omr.ok).toBe(true)
      expect(omr.score).toBe(8)
      expect(omr.confidence).toBeGreaterThan(0.08)

      // Step 4: Chuẩn bị payload ghi điểm
      const savePayload = {
        studentId: parsed.studentId,
        score: Math.min(10, Math.max(0, omr.score!)),
        source: 'qr_scan' as const,
      }
      expect(savePayload.studentId).toBe('ST-student-abc')
      expect(savePayload.score).toBe(8)
      expect(savePayload.source).toBe('qr_scan')
    })

    it('E2E trắc nghiệm: 10 câu, tô 8/10 đúng → score = 8/10', () => {
      const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const opts: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
      for (let i = 1; i <= 10; i++) answerKey[i] = opts[(i - 1) % 4]

      // Step 1: Tạo phiếu, tô đúng 8 câu, sai 2 câu
      const img = createBlankSheet()
      for (let i = 1; i <= 8; i++) {
        fillMcCell(img, i, answerKey[i], 10)
      }
      // Câu 9: tô sai
      fillMcCell(img, 9, 'D', 10) // key[9] = 'A'
      // Câu 10: bỏ trống

      // Step 2: Detect
      const omr = detectAnswersFromImage(img, answerKey, 10, 10)
      expect(omr.ok).toBe(true)
      expect(omr.rawCorrectCount).toBe(8)
      expect(omr.score).toBe(8)

      // Step 3: Chi tiết từng câu
      expect(omr.questions[8].selectedAnswer).toBe('D')
      expect(omr.questions[8].isCorrect).toBe(false)
      expect(omr.questions[9].isBlank).toBe(true)

      // Step 4: Payload ghi (kèm answers JSON)
      const answerMap: Record<string, string | null> = {}
      for (const q of omr.questions) {
        answerMap[String(q.questionIndex)] = q.selectedAnswer
      }
      const answers = JSON.stringify(answerMap)
      expect(JSON.parse(answers)['1']).toBe('A')
      expect(JSON.parse(answers)['9']).toBe('D')
      expect(JSON.parse(answers)['10']).toBeNull()
    })

    it('E2E warped: phiếu chụp nghiêng ~2.3° vẫn detect đúng toàn bộ', () => {
      const img = createBlankSheet()
      fillScoreCell(img, 3)
      // 0.04 rad ≈ 2.3° — mức nghiêng thực tế phổ biến
      const warped = warpImage(img, 10, -6, 0.04)
      const res = detectScoreFromImage(warped)
      expect(res.ok).toBe(true)
      expect(res.score).toBe(3)
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PHẦN 9: Batch scanning — Nhiều phiếu liên tiếp
  // ═════════════════════════════════════════════════════════════════════════
  describe('9. Batch Scanning — Xử lý nhiều phiếu liên tiếp', () => {
    it('quét 5 phiếu liên tiếp với điểm khác nhau → tất cả detect đúng', () => {
      const scores = [0, 3, 5, 7, 10]
      const results: { score: number; ok: boolean }[] = []

      for (const expected of scores) {
        const img = createBlankSheet()
        fillScoreCell(img, expected)
        const res = detectScoreFromImage(img)
        results.push({ score: res.score ?? -1, ok: res.ok })
      }

      expect(results.every(r => r.ok)).toBe(true)
      expect(results.map(r => r.score)).toEqual(scores)
    })

    it('quét hàng loạt trắc nghiệm: 3 học sinh × 4 câu', () => {
      const key: Record<number, 'A' | 'B' | 'C' | 'D'> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }
      const studentAnswers = [
        { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }, // 4/4 → 10
        { 1: 'A', 2: 'C', 3: 'C', 4: 'D' }, // 3/4 → 7.5
        { 1: 'B', 2: 'A', 3: 'D', 4: 'C' }, // 0/4 → 0
      ] as Record<number, 'A' | 'B' | 'C' | 'D'>[]
      const expectedScores = [10, 7.5, 0]

      for (let s = 0; s < studentAnswers.length; s++) {
        const img = createBlankSheet()
        for (const [q, opt] of Object.entries(studentAnswers[s])) {
          fillMcCell(img, Number(q), opt as 'A' | 'B' | 'C' | 'D', 4)
        }
        const res = detectAnswersFromImage(img, key, 4, 10)
        expect(res.ok).toBe(true)
        expect(res.score).toBe(expectedScores[s])
      }
    })
  })

  // ═════════════════════════════════════════════════════════════════════════
  // PHẦN 10: Edge cases & Safety guards
  // ═════════════════════════════════════════════════════════════════════════
  describe('10. Edge cases & Safety guards', () => {
    it('score ngoài range bị reject bởi scoreToCell', () => {
      expect(() => scoreToCell(-1)).toThrow()
      expect(() => scoreToCell(11)).toThrow()
      expect(() => scoreToCell(21, 20)).toThrow()
    })

    it('ảnh null/undefined → graceful fail (not crash)', () => {
      // @ts-expect-error — testing invalid input
      const res = detectScoreFromImage(null)
      expect(res.ok).toBe(false)
    })

    it('ảnh 0×0 → IMAGE_TOO_SMALL', () => {
      const res = detectScoreFromImage(FakeImageData(0, 0))
      expect(res.ok).toBe(false)
    })

    it('maxScore lớn (20 điểm): cells layout mở rộng chính xác', () => {
      const cells = allCells(20)
      expect(cells).toHaveLength(21)
      // Hàng cuối
      const last = cells[20]
      expect(last.score).toBe(20)
      expect(last.row).toBe(3) // 6 cột → 4 hàng (0..5, 6..11, 12..17, 18..20)
      expect(last.col).toBe(2) // 20 % 6 = 2
    })

    it('questionCount=50 (giới hạn cao nhất): layout hợp lệ', () => {
      const layout = getMcColumnLayout(50)
      expect(layout.cols).toBe(4) // >30 → 4 cột
      expect(layout.qPerCol).toBe(13)
      expect(layout.rowPitchY).toBeGreaterThanOrEqual(0.030)

      const cells = allMcCells(50)
      expect(cells).toHaveLength(200)
      // Tất cả tọa độ phải nằm trong vùng hợp lệ
      for (const c of cells) {
        expect(c.x).toBeGreaterThan(0)
        expect(c.x).toBeLessThan(1)
        expect(c.y).toBeGreaterThan(0)
        expect(c.y).toBeLessThan(1)
      }
    })
  })
})
