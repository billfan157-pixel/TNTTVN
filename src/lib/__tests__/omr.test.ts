import { describe, it, expect } from 'vitest'
import { detectScoreFromImage, detectAnswersFromImage } from '../omr'
import { CORNER_MARKERS, CORNER_SIZE, scoreToCell, mcOptionToCell } from '../answerSheetTemplate'

/** Fake ImageData cho môi trường node (không có browser API). */
function FakeImageData(width: number, height: number): ImageData {
  return { width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' } as unknown as ImageData
}

/**
 * Dựng ảnh giả lập phiếu trả lời: nền trắng + 4 marker góc đặc + cell được
 * "tô đen" (opts.fill). Kích thước 800×1130 (tỷ lệ A4 dọc).
 * Trả về ImageData đủ cho detector.
 */
function buildSheetImage(opts: { fill?: number } = {}): ImageData {
  const W = 800
  const H = 1130
  const img = FakeImageData(W, H)
  const data = img.data
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = 247
    data[i * 4 + 1] = 247
    data[i * 4 + 2] = 247
    data[i * 4 + 3] = 255
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
  if (opts.fill !== undefined) {
    const c = scoreToCell(opts.fill)
    // Renderer dùng ô 36px trên viewBox 1000px → ở ảnh rộng 800px còn ~28.8px,
    // tức half-size ~14.4px = 0.018 * 800. Fixture cũ dùng 0.028 (~44.8px)
    // lớn hơn hẳn ô in thật và làm local-background annulus nằm trong chính nét tô.
    const r = 0.018 * Math.min(W, H)
    fillRect(c.x * W - r, c.y * H - r, c.x * W + r, c.y * H + r, 25)
  }
  return img
}

/** Cảnh nền nâu có bốn vật tối và một vùng tối trùng tọa độ template nhưng
 * không hề có tờ giấy. Dùng để tái hiện false-positive từ camera điện thoại. */
function buildNonPaperLookalike(fill = 8): ImageData {
  const W = 800
  const H = 1130
  const img = FakeImageData(W, H)
  const fillRectRgb = (x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
        const i = (y * W + x) * 4
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255
      }
    }
  }
  fillRectRgb(0, 0, W, H, 155, 92, 42)
  const markerHalf = (CORNER_SIZE / 2) * Math.min(W, H)
  for (const marker of CORNER_MARKERS) {
    fillRectRgb(
      marker.x * W - markerHalf,
      marker.y * H - markerHalf,
      marker.x * W + markerHalf,
      marker.y * H + markerHalf,
      8, 8, 8,
    )
  }
  const cell = scoreToCell(fill)
  const cellHalf = 0.028 * Math.min(W, H)
  fillRectRgb(
    cell.x * W - cellHalf,
    cell.y * H - cellHalf,
    cell.x * W + cellHalf,
    cell.y * H + cellHalf,
    15, 15, 15,
  )
  return img
}

/** Làm lệch ảnh (dịch + xoay nhỏ) — mô phỏng camera nghiêng. */
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

describe('OMR detector (Phase 2 POC)', () => {
  it('phiếu trống → NO_CELL_FILLED, không ghi điểm', () => {
    const res = detectScoreFromImage(buildSheetImage())
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('NO_CELL_FILLED')
  })

  it('nền không có giấy dù có vùng tối trùng template → bị chặn fail-closed', () => {
    const res = detectScoreFromImage(buildNonPaperLookalike(8))
    expect(res.ok).toBe(false)
    expect(res.score).toBeNull()
    // Locator mới có thể chặn sớm ở isolation/geometry trước paper-surface gate.
    expect(res.reason).toMatch(/^(MISSING_MARKER_|NO_PAPER_SURFACE)/)
  })

  it('ô 8 tô đen → detect score 8 confidence cao', () => {
    const res = detectScoreFromImage(buildSheetImage({ fill: 8 }))
    expect(res.ok).toBe(true)
    expect(res.score).toBe(8)
    expect(res.confidence).toBeGreaterThan(0.3)
  })

  it('ô 0 tô → detect score 0', () => {
    const res = detectScoreFromImage(buildSheetImage({ fill: 0 }))
    expect(res.ok).toBe(true)
    expect(res.score).toBe(0)
  })

  it('ô 10 (hàng 2, cột 5) tô → detect score 10', () => {
    const res = detectScoreFromImage(buildSheetImage({ fill: 10 }))
    expect(res.ok).toBe(true)
    expect(res.score).toBe(10)
  })

  it('ảnh bị dịch/xoay nhẹ vẫn detect đúng (camera lệch)', () => {
    const warped = warpImage(buildSheetImage({ fill: 5 }), 12, -8, 0.06)
    const res = detectScoreFromImage(warped)
    expect(res.ok).toBe(true)
    expect(res.score).toBe(5)
  })

  it('thiếu marker góc → MISSING_MARKER_*, không ghi bừa', () => {
    const img = buildSheetImage({ fill: 4 })
    // Xóa marker TR (0.95, 0.30) — tô trắng vùng marker
    const half = (CORNER_SIZE / 2) * Math.min(img.width, img.height)
    const mx = Math.floor(0.95 * img.width)
    const my = Math.floor(0.30 * img.height)
    for (let y = my - half; y <= my + half; y++) {
      for (let x = mx - half; x <= mx + half; x++) {
        if (y < 0 || y >= img.height || x < 0 || x >= img.width) continue
        const i = (y * img.width + x) * 4
        img.data[i] = 247; img.data[i + 1] = 247; img.data[i + 2] = 247
      }
    }
    const res = detectScoreFromImage(img)
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('MISSING_MARKER')
  })

  it('ảnh quá nhỏ → IMAGE_TOO_SMALL', () => {
    const small = FakeImageData(50, 50)
    const res = detectScoreFromImage(small)
    expect(res.reason).toBe('IMAGE_TOO_SMALL')
  })
})

describe('OMR trắc nghiệm (Phase 4 — detectAnswersFromImage)', () => {
  const ANSWER_KEY: Record<number, 'A' | 'B' | 'C' | 'D'> = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' }

  /** Dựng phiếu MC: marker + các ô A/B/C/D, opts.fill = {question: option} */
  function buildMcSheet(fill: Record<number, 'A' | 'B' | 'C' | 'D'> = {}, totalQuestions = 4): ImageData {
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

  it('tô đúng 4/4 theo answerKey → score = maxScore, ok:true', () => {
    const res = detectAnswersFromImage(buildMcSheet({ 1: 'A', 2: 'B', 3: 'C', 4: 'D' }), ANSWER_KEY, 4, 10)
    expect(res.ok).toBe(true)
    expect(res.rawCorrectCount).toBe(4)
    expect(res.score).toBe(10)
    expect(res.questions.every(q => q.isCorrect === true)).toBe(true)
  })

  it('tô sai 1 câu → score giảm theo tỷ lệ (3/4 → 7.5)', () => {
    const res = detectAnswersFromImage(buildMcSheet({ 1: 'A', 2: 'B', 3: 'C', 4: 'A' }), ANSWER_KEY, 4, 10)
    expect(res.ok).toBe(true)
    expect(res.rawCorrectCount).toBe(3)
    expect(res.score).toBe(7.5)
  })

  it('để trống 1 câu → isBlank, không tính là đúng', () => {
    const res = detectAnswersFromImage(buildMcSheet({ 1: 'A', 2: 'B', 3: 'C' }), ANSWER_KEY, 4, 10)
    expect(res.rawCorrectCount).toBe(3)
    expect(res.questions[3].isBlank).toBe(true)
    expect(res.questions[3].selectedAnswer).toBeNull()
  })

  it('tô 2 đáp án 1 câu → isMultiFill, không chọn (giống xác nhận 2 bước)', () => {
    const img = buildMcSheet({ 1: 'A', 2: 'B', 3: 'C', 4: 'D' }, 4)
    // Tô thêm cả B ở câu 1
    const cell = mcOptionToCell(1, 'B', 4)
    const W = img.width, H = img.height
    const r = Math.max(6, Math.floor(0.016 * Math.min(W, H)))
    const x0 = Math.max(0, Math.floor(cell.x * W - r)), x1 = Math.min(W, Math.ceil(cell.x * W + r))
    const y0 = Math.max(0, Math.floor(cell.y * H - r)), y1 = Math.min(H, Math.ceil(cell.y * H + r))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4
        img.data[i] = 25; img.data[i + 1] = 25; img.data[i + 2] = 25
      }
    }
    const res = detectAnswersFromImage(img, ANSWER_KEY, 4, 10)
    expect(res.questions[0].isMultiFill).toBe(true)
    expect(res.questions[0].selectedAnswer).toBeNull()
    expect(res.questions[0].needsReview).toBe(true)
    expect(res.status).toBe('review_required')
    expect(res.reason).toBe('REVIEW_REQUIRED')
  })

  it('vết tô quá nhạt được route review_required, không tự coi là câu trắng', () => {
    const img = buildMcSheet({ 2: 'B', 3: 'C', 4: 'D' }, 4)
    const cell = mcOptionToCell(1, 'A', 4)
    const W = img.width, H = img.height
    const r = Math.max(6, Math.floor(0.016 * Math.min(W, H)))
    for (let y = Math.floor(cell.y * H - r); y < Math.ceil(cell.y * H + r); y++) {
      for (let x = Math.floor(cell.x * W - r); x < Math.ceil(cell.x * W + r); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        const i = (y * W + x) * 4
        img.data[i] = 175; img.data[i + 1] = 175; img.data[i + 2] = 175
      }
    }
    const res = detectAnswersFromImage(img, ANSWER_KEY, 4, 10)
    expect(res.ok).toBe(true)
    expect(res.status).toBe('review_required')
    expect(res.questions[0]).toMatchObject({ selectedAnswer: null, isWeakMark: true, needsReview: true })
  })

  it('thiếu marker → MISSING_MARKER_*, không ghi bừa', () => {
    const img = buildMcSheet({ 1: 'A' }, 4)
    const half = (CORNER_SIZE / 2) * Math.min(img.width, img.height)
    const mx = Math.floor(0.95 * img.width)
    const my = Math.floor(0.30 * img.height)
    for (let y = my - half; y <= my + half; y++) {
      for (let x = mx - half; x <= mx + half; x++) {
        if (y < 0 || y >= img.height || x < 0 || x >= img.width) continue
        const i = (y * img.width + x) * 4
        img.data[i] = 247; img.data[i + 1] = 247; img.data[i + 2] = 247
      }
    }
    const res = detectAnswersFromImage(img, ANSWER_KEY, 4, 10)
    expect(res.ok).toBe(false)
    expect(res.reason).toContain('MISSING_MARKER')
  })

  it('ảnh quá nhỏ → IMAGE_TOO_SMALL', () => {
    const res = detectAnswersFromImage(FakeImageData(40, 40), ANSWER_KEY, 4, 10)
    expect(res.reason).toBe('IMAGE_TOO_SMALL')
  })
})
