/**
 * Smart Exam Grading — AnswerSheet template (SSOT Phase 2).
 * Cùng 1 bộ hằng số cho cả printer (SVG/CSS) và OMR detector — đảm bảo
 * mẫu in khớp chính xác vị trí marker/ô chấm detector tìm kiếm.
 *
 * Hệ tọa độ: normalized 0..1 theo chiều rộng (x) và chiều cao (y) của phiếu
 * (khẩu hình A4 dọc 210×297 → ratio ~0.707). Detector sẽ tự map sang pixel.
 */

export const SHEET_ASPECT_RATIO = 0.707 // 210/297 — A4 portrait

/** Ô chấm điểm mặc định — maxScore = 10 (11 ô). */
export const SHEET_MAX_SCORE = 10

/** 4 marker góc (square) — anchor chuẩn homography cho Phiếu Trả Lời Toàn Trang (Full-page sheet). */
export const CORNER_MARKERS = [
  { id: 'TL', x: 0.05, y: 0.30 },
  { id: 'TR', x: 0.95, y: 0.30 },
  { id: 'BR', x: 0.95, y: 0.93 },
  { id: 'BL', x: 0.05, y: 0.93 },
] as const
export const CORNER_SIZE = 0.055 // normalized (marker = ô vuông đặc)

/** 4 marker góc dành riêng cho Khung OMR Tích Hợp trên Đề Thi Gộp (Integrated Exam Sheet). */
export const INTEGRATED_OMR_MARKERS = [
  { id: 'TL', x: 0.04, y: 0.16 },
  { id: 'TR', x: 0.96, y: 0.16 },
  { id: 'BR', x: 0.96, y: 0.36 },
  { id: 'BL', x: 0.04, y: 0.36 },
] as const
export const INTEGRATED_CORNER_SIZE = 0.045

/** Khung lưới ô điểm — 6 cột, số hàng tự động theo maxScore. */
export const GRID_COLS = 6
export const GRID_X0 = 0.15
export const GRID_X1 = 0.85
export const GRID_Y0 = 0.53
export const GRID_Y1 = 0.64
/** Vùng Y dành cho score grid mở rộng (khi maxScore > 10). */
export const GRID_Y_MAX = 0.88

/** Vùng QR per-student — góc trên phải (không che đè tiêu đề). */
export const QR_X = 0.70
export const QR_Y = 0.025
export const QR_SIZE = 0.24

export interface CellPosition {
  /** score 0..maxScore */
  score: number
  row: number
  col: number
  /** center normalized (x, y) */
  x: number
  y: number
}

/** Tính số hàng cần thiết cho maxScore (6 cột). */
function gridRows(maxScore: number): number {
  return Math.ceil((maxScore + 1) / GRID_COLS)
}

/**
 * Layout tuyến tính: hàng 1 = 0..5, hàng 2 = 6..10, hàng 3 = 11..15, ...
 * Khi maxScore > 10, mở rộng vùng Y xuống GRID_Y_MAX.
 */
export function scoreToCell(score: number, maxScore = SHEET_MAX_SCORE): CellPosition {
  if (score < 0 || score > maxScore) throw new Error(`score ${score} ngoài 0..${maxScore}`)
  const rows = gridRows(maxScore)
  const pitchX = (GRID_X1 - GRID_X0) / (GRID_COLS - 1)
  const row = Math.floor(score / GRID_COLS)
  const col = score % GRID_COLS
  // Khi maxScore <= 10: dùng vùng Y cố định (0.53..0.64)
  // Khi maxScore > 10: mở rộng xuống GRID_Y_MAX
  const y0 = rows > 2 ? GRID_Y0 : GRID_Y0
  const y1 = rows > 2 ? GRID_Y_MAX : GRID_Y1
  const pitchY = rows > 1 ? (y1 - y0) / (rows - 1) : 0
  return {
    score,
    row,
    col,
    x: GRID_X0 + col * pitchX,
    y: y0 + row * pitchY,
  }
}

/** Danh sách ô cho detector — score 0..maxScore. */
export function allCells(maxScore = SHEET_MAX_SCORE): CellPosition[] {
  const out: CellPosition[] = []
  for (let s = 0; s <= maxScore; s++) out.push(scoreToCell(s, maxScore))
  return out
}

export interface McQuestionCellPosition {
  questionIndex: number
  option: 'A' | 'B' | 'C' | 'D'
  x: number
  y: number
}

export interface McColumnLayout {
  cols: number
  qPerCol: number
  colWidth: number
  colX0: (colIndex: number) => number
  optPitchX: number
  rowPitchY: number
  startY: number
  endY: number
}

/** Tính toán layout chia cột tự động dựa trên tổng số câu hỏi (1..50). */
export function getMcColumnLayout(totalQuestions = 20): McColumnLayout {
  const qCount = Math.max(1, Math.min(50, totalQuestions))
  const cols = qCount > 30 ? 4 : (qCount > 18 ? 3 : (qCount > 8 ? 2 : 1))
  const qPerCol = Math.ceil(qCount / cols)

  const startX = 0.05
  const endX = 0.95
  const startY = 0.36
  const endY = 0.90
  const totalWidth = endX - startX
  const colWidth = totalWidth / cols

  const labelMargin = cols === 4 ? 0.055 : (cols === 3 ? 0.065 : (cols === 2 ? 0.080 : 0.120))
  const optPitchX = cols === 4 ? 0.034 : (cols === 3 ? 0.044 : (cols === 2 ? 0.065 : 0.090))
  const rowPitchY = qPerCol > 1 ? (endY - startY) / (qPerCol - 1) : 0

  return {
    cols,
    qPerCol,
    colWidth,
    colX0: (colIndex: number) => startX + colIndex * colWidth + labelMargin,
    optPitchX,
    rowPitchY,
    startY,
    endY,
  }
}

/** Tọa độ ô chọn A/B/C/D cho trắc nghiệm N câu. */
export function mcOptionToCell(
  questionIndex: number,
  option: 'A' | 'B' | 'C' | 'D',
  totalQuestions = 20
): McQuestionCellPosition {
  const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
  const optIndex = options.indexOf(option)
  const q0 = questionIndex - 1
  const layout = getMcColumnLayout(totalQuestions)
  const colIndex = Math.floor(q0 / layout.qPerCol)
  const rowIndex = q0 % layout.qPerCol

  const baseX = layout.colX0(colIndex)
  const x = baseX + optIndex * layout.optPitchX
  const y = layout.qPerCol > 1 ? layout.startY + rowIndex * layout.rowPitchY : (layout.startY + layout.endY) / 2

  return {
    questionIndex,
    option,
    x,
    y,
  }
}

export function allMcCells(totalQuestions = 20): McQuestionCellPosition[] {
  const out: McQuestionCellPosition[] = []
  const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
  for (let q = 1; q <= totalQuestions; q++) {
    for (const opt of options) {
      out.push(mcOptionToCell(q, opt, totalQuestions))
    }
  }
  return out
}