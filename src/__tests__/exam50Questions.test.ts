import { describe, it, expect } from 'vitest'
import { getMcColumnLayout, mcOptionToCell, allMcCells, CORNER_MARKERS, CORNER_SIZE } from '../lib/answerSheetTemplate'
import { buildSingleAnswerSheetSvgString } from '../utils/examSheets'
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

describe('50 Questions Exam Answer Sheet & OMR Detection Tests', () => {
  describe('Layout & Coordinates (getMcColumnLayout)', () => {
    it('configures 4 columns and 13 questions per column for 50 questions', () => {
      const layout = getMcColumnLayout(50)
      expect(layout.cols).toBe(4)
      expect(layout.qPerCol).toBe(13)
      expect(layout.startY).toBe(0.36)
      expect(layout.endY).toBe(0.90)
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
})
