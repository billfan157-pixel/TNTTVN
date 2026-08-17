import { describe, it, expect } from 'vitest'
import { getMcColumnLayout, mcOptionToCell, allMcCells, integratedMcCells, integratedMcCellsForRect, integratedGridCols, CORNER_MARKERS, CORNER_SIZE, INTEGRATED_OMR_MARKERS, INTEGRATED_CORNER_SIZE, type FrameRect } from '../lib/answerSheetTemplate'
import { buildSingleAnswerSheetSvgString, buildExamPaperHtml } from '../utils/examSheets'
import { detectAnswersFromImage } from '../lib/omr'

function FakeImageData(w: number, h: number): ImageData {
  return {
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

function buildMcSheet(fill: Record<number, 'A' | 'B' | 'C' | 'D'> = {}, totalQuestions = 50): ImageData {
  const W = 800
  const H = 1130
  const img = FakeImageData(W, H)
  const data = img.data
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 247; data[i * 4 + 1] = 247; data[i * 4 + 2] = 247; data[i * 4 + 3] = 255
  }
  const fillRect = (x0: number, y0: number, x1: number, y1: number, c: number) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
        const i = (y * W + x) * 4
        data[i] = c; data[i + 1] = c; data[i + 2] = c
      }
    }
  }
  for (const m of CORNER_MARKERS) {
    const half = (CORNER_SIZE / 2) * Math.min(W, H)
    fillRect(m.x * W - half, m.y * H - half, m.x * W + half, m.y * H + half, 10)
  }
  for (const [q, opt] of Object.entries(fill)) {
    const cell = mcOptionToCell(Number(q), opt, totalQuestions)
    const r = 0.016 * Math.min(W, H)
    fillRect(cell.x * W - r, cell.y * H - r, cell.x * W + r, cell.y * H + r, 25)
  }
  return img
}

/**
 * Rect khung integrated trên trang in THẬT — đo bằng Chromium render (A4 @96dpi,
 * viewport 800×1131, `.exam-paper-container` lề 8mm). Template tĩnh
 * INTEGRATED_OMR_MARKERS (y 0.16..0.36) LỆCH khỏi vị trí in thật → detector cũ
 * trả MISSING_MARKER_TL (bug thật phát hiện qua E2E render — test tổng hợp cũ
 * không bắt được vì tự đặt marker đúng vị trí template):
 * - Single-print: khung y 0.153..0.287 (khung 50 câu ≈ 152px ≈ 0.134 chiều cao).
 * - Batch (wrapper lề 8mm + container lề 8mm): dịch xuống ~30px → y 0.180..0.314.
 */
const REAL_SINGLE_PRINT_FRAME: FrameRect = { x0: 0.0375, y0: 0.153, x1: 0.9625, y1: 0.287 }
const REAL_BATCH_FRAME: FrameRect = { x0: 0.075, y0: 0.18, x1: 0.925, y1: 0.314 }

/** Phiếu GỘP (integrated) theo rect khung thật — marker tại 4 góc rect, bubble theo integratedMcCellsForRect. */
function buildIntegratedSheet(
  fill: Record<number, 'A' | 'B' | 'C' | 'D'> = {},
  totalQuestions = 50,
  frame: FrameRect = REAL_SINGLE_PRINT_FRAME
): ImageData {
  const W = 800
  const H = 1130
  const img = FakeImageData(W, H)
  const data = img.data
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 247; data[i * 4 + 1] = 247; data[i * 4 + 2] = 247; data[i * 4 + 3] = 255
  }
  const fillRect = (x0: number, y0: number, x1: number, y1: number, c: number) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
        const i = (y * W + x) * 4
        data[i] = c; data[i + 1] = c; data[i + 2] = c
      }
    }
  }
  const corners: FrameRect[] = [
    { x0: frame.x0, y0: frame.y0, x1: frame.x0, y1: frame.y0 },
    { x0: frame.x1, y0: frame.y0, x1: frame.x1, y1: frame.y0 },
    { x0: frame.x1, y0: frame.y1, x1: frame.x1, y1: frame.y1 },
    { x0: frame.x0, y0: frame.y1, x1: frame.x0, y1: frame.y1 },
  ]
  for (const c of corners) {
    const half = (INTEGRATED_CORNER_SIZE / 2) * Math.min(W, H)
    fillRect(c.x0 * W - half, c.y0 * H - half, c.x1 * W + half, c.y1 * H + half, 10)
  }
  for (const [q, opt] of Object.entries(fill)) {
    const cell = integratedMcCellsForRect(totalQuestions, frame).find(c => c.questionIndex === Number(q) && c.option === opt)
    if (!cell) continue
    // Ô tô kín ~bubble in 14px (scan 800px ≈ 14.1px) — phủ core ring 5.6px
    const r = 0.00875 * Math.min(W, H)
    fillRect(cell.x * W - r, cell.y * H - r, cell.x * W + r, cell.y * H + r, 25)
  }
  return img
}

describe('50 Questions Exam Answer Sheet & OMR Detection Tests', () => {
  describe('Layout & Coordinates (getMcColumnLayout)', () => {
    it('configures 4 columns and 13 questions per column for 50 questions', () => {
      const layout = getMcColumnLayout(50)
      expect(layout.cols).toBe(4)
      expect(layout.qPerCol).toBe(13)
      expect(layout.startY).toBe(0.36)
      // A-NEW-50: vùng Y co giãn theo mật độ — 50 câu (qPerCol 13) chỉ chiếm
      // 0.36..0.72 (rowPitch 0.030) thay vì 0.36..0.90 như trước.
      expect(layout.endY).toBe(0.72)
    })

    it('generates 200 bubble cells for 50 questions (50 × 4 options)', () => {
      const cells = allMcCells(50)
      expect(cells).toHaveLength(200)
      expect(cells[0]).toEqual({ questionIndex: 1, option: 'A', x: expect.any(Number), y: expect.any(Number) })
      expect(cells[199]).toEqual({ questionIndex: 50, option: 'D', x: expect.any(Number), y: expect.any(Number) })
    })

    it('ensures all 50 question bubble coordinates are within safe inner boundaries of Homography markers', () => {
      const cells = allMcCells(50)
      for (const c of cells) {
        expect(c.x).toBeGreaterThan(0.05)
        expect(c.x).toBeLessThan(0.95)
        expect(c.y).toBeGreaterThan(0.34)
        expect(c.y).toBeLessThan(0.92)
      }
    })

    it('ensures option coordinates (A, B, C, D) are strictly ordered left to right for each question', () => {
      for (let q = 1; q <= 50; q++) {
        const cellA = mcOptionToCell(q, 'A', 50)
        const cellB = mcOptionToCell(q, 'B', 50)
        const cellC = mcOptionToCell(q, 'C', 50)
        const cellD = mcOptionToCell(q, 'D', 50)

        expect(cellA.y).toBeCloseTo(cellB.y, 5)
        expect(cellB.y).toBeCloseTo(cellC.y, 5)
        expect(cellC.y).toBeCloseTo(cellD.y, 5)

        expect(cellA.x).toBeLessThan(cellB.x)
        expect(cellB.x).toBeLessThan(cellC.x)
        expect(cellC.x).toBeLessThan(cellD.x)
      }
    })
  })

  describe('SVG Generation (buildSingleAnswerSheetSvgString)', () => {
    it('generates complete 50-question SVG with 4 columns without NaN or negative positions', () => {
      const student = { id: 'std-1', code: 'TN-001', name: 'Maria Nguyễn Văn A' }
      const params = {
        sessionId: 'sess-123',
        subject: 'Giáo Lý Khảo Sát',
        scoreTypeLabel: '15 Phút',
        classLabel: 'Khai Tâm 1',
        maxScore: 10,
        examType: 'multiple_choice' as const,
        questionCount: 50,
      }

      const svg = buildSingleAnswerSheetSvgString(student, params)

      expect(svg).toContain('CỘT 1')
      expect(svg).toContain('CỘT 2')
      expect(svg).toContain('CỘT 3')
      expect(svg).toContain('CỘT 4')
      expect(svg).toContain('câu 1:')
      expect(svg).toContain('câu 50:')
      expect(svg).not.toContain('NaN')
      expect(svg).not.toContain('undefined')
      expect(svg).not.toContain('x="-')
      expect(svg).not.toContain('y="-')
    })
  })

  describe('OMR Detection on 50 questions', () => {
    it('scans and grades 50 questions accurately with answer key', () => {
      const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const filledAnswers: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']

      for (let i = 1; i <= 50; i++) {
        answerKey[i] = options[(i - 1) % 4]
        filledAnswers[i] = options[(i - 1) % 4]
      }

      // Tô đúng cả 50/50 câu
      const img = buildMcSheet(filledAnswers, 50)
      const res = detectAnswersFromImage(img, answerKey, 50, 10)

      expect(res.ok).toBe(true)
      expect(res.totalQuestions).toBe(50)
      expect(res.rawCorrectCount).toBe(50)
      expect(res.score).toBe(10)
    })

    it('computes proportional score when some questions are wrong in 50 questions', () => {
      const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const filledAnswers: Record<number, 'A' | 'B' | 'C' | 'D'> = {}

      for (let i = 1; i <= 50; i++) {
        answerKey[i] = 'A'
        // Làm đúng 40 câu, sai 10 câu
        filledAnswers[i] = i <= 40 ? 'A' : 'B'
      }

      const img = buildMcSheet(filledAnswers, 50)
      const res = detectAnswersFromImage(img, answerKey, 50, 10)

      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(40)
      expect(res.score).toBe(8) // 40/50 * 10 = 8.0
    })

    it('handles fail-safe gracefully when image is too small', () => {
      const smallImg = FakeImageData(40, 40)
      const result = detectAnswersFromImage(smallImg, {}, 50, 10)
      expect(result.ok).toBe(false)
      expect(result.totalQuestions).toBe(50)
      expect(result.reason).toBe('IMAGE_TOO_SMALL')
    })
  })

  describe('Integrated OMR Sheet (Khung phiếu gộp) — A-NEW-50', () => {
    it('integratedGridCols: 5 cột cho ≤20 câu, 8 cột cho 21..50 câu', () => {
      expect(integratedGridCols(10)).toBe(5)
      expect(integratedGridCols(20)).toBe(5)
      expect(integratedGridCols(21)).toBe(8)
      expect(integratedGridCols(50)).toBe(8)
    })

    it('integratedMcCells (template tĩnh) nằm gọn trong khung marker 0.04..0.96 × 0.16..0.36', () => {
      const cells = integratedMcCells(50)
      expect(cells).toHaveLength(200)
      for (const c of cells) {
        expect(c.x).toBeGreaterThan(0.04)
        expect(c.x).toBeLessThan(0.96)
        expect(c.y).toBeGreaterThan(0.16)
        expect(c.y).toBeLessThan(0.36)
      }
    })

    it('integratedMcCellsForRect theo rect in THẬT nằm gọn trong rect đó (single-print & batch)', () => {
      for (const frame of [REAL_SINGLE_PRINT_FRAME, REAL_BATCH_FRAME]) {
        const cells = integratedMcCellsForRect(50, frame)
        expect(cells).toHaveLength(200)
        for (const c of cells) {
          expect(c.x).toBeGreaterThan(frame.x0)
          expect(c.x).toBeLessThan(frame.x1)
          expect(c.y).toBeGreaterThan(frame.y0)
          expect(c.y).toBeLessThan(frame.y1)
        }
      }
    })

    it('bubble A/B/C/D cùng hàng, đúng thứ tự trái→phải, đủ khoảng cách pitch', () => {
      const cells = integratedMcCells(50)
      for (let q = 1; q <= 50; q++) {
        const opts = cells.filter(c => c.questionIndex === q).sort((a, b) => a.x - b.x)
        expect(opts.map(o => o.option)).toEqual(['A', 'B', 'C', 'D'])
        expect(opts[1].x - opts[0].x).toBeCloseTo(opts[3].x - opts[2].x, 5)
        expect(opts[0].x).toBeLessThan(opts[1].x)
      }
    })

    it('bubble in HTML dùng đúng kích thước SSOT (14px) và 8 cột cho 50 câu', () => {
      const questions = Array.from({ length: 50 }, (_, i) => ({
        index: i + 1,
        question: `Câu ${i + 1}: abc`,
        options: { A: 'a', B: 'b', C: 'c', D: 'd' },
        correctOption: 'A' as const,
      }))
      const html = buildExamPaperHtml({
        subject: 'Khảo Sát',
        classLabel: 'Khai Tâm 1',
        academicYear: '2025-2026',
        questions,
        includeAnswerGrid: true,
        student: { id: 'ST-001', code: 'TN001', name: 'Em 1' },
      })
      expect(html).toContain('repeat(8, 1fr)')
      expect(html).toContain('width: 14px')
      expect(html).toContain('height: 14px')
      expect(html).toContain('class="omr-frame"')
      expect(html).toContain('omr-marker-tl')
    })

    it('quét phiếu gộp 50 câu ở vị trí in THẬT (single-print): detect đúng đáp án trong khung integrated', () => {
      const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const filledAnswers: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
      for (let i = 1; i <= 50; i++) {
        answerKey[i] = options[(i - 1) % 4]
        filledAnswers[i] = options[(i - 1) % 4]
      }

      const img = buildIntegratedSheet(filledAnswers, 50, REAL_SINGLE_PRINT_FRAME)
      const res = detectAnswersFromImage(img, answerKey, 50, 10)

      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(50)
      expect(res.score).toBe(10)
      expect(res.questions[0].selectedAnswer).toBe('A')
      // q50: options[(50-1)%4] = 'B' — detector phải đọc đúng ô đã tô
      expect(res.questions[49].selectedAnswer).toBe('B')
      expect(res.questions[49].selectedAnswer).toBe(filledAnswers[50])
    })

    it('quét phiếu gộp 50 câu ở vị trí in THẬT (batch lề 8mm×2): vẫn detect đúng 50/50', () => {
      const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const filledAnswers: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
      for (let i = 1; i <= 50; i++) {
        answerKey[i] = options[(i - 1) % 4]
        filledAnswers[i] = options[(i - 1) % 4]
      }

      const img = buildIntegratedSheet(filledAnswers, 50, REAL_BATCH_FRAME)
      const res = detectAnswersFromImage(img, answerKey, 50, 10)
      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(50)
      expect(res.score).toBe(10)
    })

    it('quét phiếu gộp: 40/50 đúng → score 8.0 (rect in thật single-print)', () => {
      const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const filledAnswers: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      for (let i = 1; i <= 50; i++) {
        answerKey[i] = 'A'
        filledAnswers[i] = i <= 40 ? 'A' : 'B'
      }
      const img = buildIntegratedSheet(filledAnswers, 50, REAL_SINGLE_PRINT_FRAME)
      const res = detectAnswersFromImage(img, answerKey, 50, 10)
      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(40)
      expect(res.score).toBe(8)
    })

    it('quét phiếu gộp ở vị trí template tĩnh (compat cũ) vẫn detect được', () => {
      const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      const filledAnswers: Record<number, 'A' | 'B' | 'C' | 'D'> = {}
      for (let i = 1; i <= 50; i++) {
        answerKey[i] = 'A'
        filledAnswers[i] = 'A'
      }
      const img = buildIntegratedSheet(filledAnswers, 50, {
        x0: INTEGRATED_OMR_MARKERS[0].x,
        y0: INTEGRATED_OMR_MARKERS[0].y,
        x1: INTEGRATED_OMR_MARKERS[1].x,
        y1: INTEGRATED_OMR_MARKERS[2].y,
      })
      const res = detectAnswersFromImage(img, answerKey, 50, 10)
      expect(res.ok).toBe(true)
      expect(res.rawCorrectCount).toBe(50)
      expect(res.score).toBe(10)
    })
  })
})
