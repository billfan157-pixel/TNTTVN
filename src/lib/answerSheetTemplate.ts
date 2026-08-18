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
/** Cửa sổ tìm marker integrated (normalized) — khớp marker in 18px @96dpi.
 * Detector quét đa tỉ lệ vì tờ A4 thường chỉ chiếm một phần khung camera. */
export const INTEGRATED_CORNER_SIZE = 0.025

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

/**
 * Tính toán layout chia cột tự động dựa trên tổng số câu hỏi (1..50).
 *
 * A-NEW-50 (2026-08-17): mật độ DỌC co giãn theo số câu/1 cột (qPerCol) thay vì
 * vùng Y cố định 0.36..0.90 — phiếu 50 câu trước đây chiếm 54% chiều cao trang
 * (rowPitch 0.045) dù ô tròn chỉ ~22px. Giờ:
 *   qPerCol  ≤ 7  → endY 0.90 (đề ít câu, thoáng)
 *   qPerCol 8-10 → endY 0.78
 *   qPerCol ≥ 11 → endY 0.72 (50 câu → pitch 0.030 ≈ 42px @1000px)
 * Giới hạn an toàn OMR: rowPitchY luôn ≥ 0.030 — detector sample annulus
 * (r*2.2 với r=sizePx*0.24 ≈ 29px) không chạm ô láng giềng khi quét chuẩn.
 */
export function getMcColumnLayout(totalQuestions = 20): McColumnLayout {
  const qCount = Math.max(1, Math.min(50, totalQuestions))
  const cols = qCount > 30 ? 4 : (qCount > 18 ? 3 : (qCount > 8 ? 2 : 1))
  const qPerCol = Math.ceil(qCount / cols)

  const startX = 0.05
  const endX = 0.95
  const startY = 0.36
  const endY = qPerCol > 10 ? 0.72 : (qPerCol > 7 ? 0.78 : 0.90)
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * KHUNG OMR TÍCH HỢP (Integrated) — geometry in px@96dpi, dùng CHUNG cho cả
 * printer (buildExamPaperHtml) và detector (omr.ts nhánh INTEGRATED_OMR_MARKERS).
 *
 * A-NEW-50 (2026-08-17): sửa mismatch lịch sử — detector cũ nhận diện marker
 * integrated (frame y 0.16..0.36) nhưng vẫn lấy tọa độ ô từ `allMcCells` (hệ
 * TOÀN TRANG y 0.36..0.90) → sample sai chỗ, không bao giờ đọc được phiếu gộp.
 * Giờ layout integrated có tọa độ RIÊNG: mỗi hàng câu hỏi xếp q-num (12px) bên
 * trái, nhóm 4 bubble (16px, gap 2px) ép sát MÉP PHẢI của ô grid
 * (justify-content: space-between — 2 phần tử nên vị trí xác định tuyệt đối),
 * độc lập với độ rộng ô grid → detector quét đúng từng ô.
 *
 * An toàn hình học: marker 18px có halo trắng và nằm lệch ra ngoài khung nên
 * không đè bubble. 8 cột × 7 hàng (50 câu) → khoảng tâm marker cao 174px.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const INTEGRATED_MARKER_SIZE = 18
export const INTEGRATED_MARKER_OVERHANG = INTEGRATED_MARKER_SIZE / 2
export const INTEGRATED_PAD_X = 5
export const INTEGRATED_PAD_Y = 3
export const INTEGRATED_BORDER_W = 1.5
export const INTEGRATED_QNUM_W = 12
export const INTEGRATED_QNUM_GAP = 2
export const INTEGRATED_BUBBLE_W = 16
export const INTEGRATED_BUBBLE_GAP = 2
export const INTEGRATED_ROW_H = 18
export const INTEGRATED_ROW_BORDER_W = 1
export const INTEGRATED_GRID_GAP_X = 4
export const INTEGRATED_GRID_GAP_Y = 4
/**
 * Hiệu chỉnh theo DOMRect của Chromium @96dpi. Tâm marker tuyệt đối được tính
 * từ padding-box của `.omr-frame`, vì vậy border ngoài không nằm trong khoảng
 * marker-center. REF_W là chiều rộng tâm marker của bản in A4 chuẩn.
 */
export const INTEGRATED_REF_W = 749.2
/** Chiều cao tham chiếu 50 câu, giữ export để chẩn đoán/compat tài liệu. */
export const INTEGRATED_REF_H = 174

/** Số cột của khung integrated — 5 cột (≤20 câu), 8 cột (21..50 câu). */
export function integratedGridCols(totalQuestions = 20): number {
  return totalQuestions <= 20 ? 5 : 8
}

/** Chiều cao rect marker (px @96dpi) — mẫu số normalize y. */
export function integratedFrameH(totalQuestions: number): number {
  const rows = Math.ceil(totalQuestions / integratedGridCols(totalQuestions))
  return 2 * INTEGRATED_MARKER_OVERHANG + rows * INTEGRATED_ROW_H + (rows - 1) * INTEGRATED_GRID_GAP_Y + 2 * INTEGRATED_PAD_Y
}

/** Tỷ lệ marker-center width/height của khung OMR theo đúng số câu in. */
export function integratedFrameAspectRatio(totalQuestions: number): number {
  return INTEGRATED_REF_W / integratedFrameH(totalQuestions)
}

/** Hình chữ nhật khung integrated trong page space (normalized) — 4 góc khung. */
export interface FrameRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Rect mặc định suy từ INTEGRATED_OMR_MARKERS — dùng cho template tĩnh và test. */
export function integratedDefaultFrameRect(): FrameRect {
  return {
    x0: INTEGRATED_OMR_MARKERS[0].x,
    x1: INTEGRATED_OMR_MARKERS[1].x,
    y0: INTEGRATED_OMR_MARKERS[0].y,
    y1: INTEGRATED_OMR_MARKERS[2].y,
  }
}

/** Tọa độ ô A/B/C/D của câu hỏi trong KHUNG INTEGRATED — trả về PAGE-normalized
 * (cùng hệ tọa độ với marker và homography), nhưng vị trí trong khung tính theo
 * geometry px in (INTEGRATED_*). `frame` là rect khung đo được thực tế trên ảnh
 * (độc lập vị trí khung trên trang — bản in thật đặt khung lệch khỏi template
 * tĩnh do header/meta phía trên và lề in batch 8mm). */
export function integratedMcOptionToCellForRect(
  questionIndex: number,
  option: 'A' | 'B' | 'C' | 'D',
  totalQuestions: number,
  frame: FrameRect
): McQuestionCellPosition {
  const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
  const optIndex = options.indexOf(option)
  const cols = integratedGridCols(totalQuestions)
  const q0 = questionIndex - 1
  // A-NEW-50: CSS `grid-template-columns: repeat(cols, 1fr)` xếp hàng MAJOR
  // (câu 1..cols ở hàng 1, cols+1..2cols ở hàng 2...) — model cũ col-major
  // (floor(q0/rows)) đảo ngược → đọc nhầm câu hỏi hàng loạt (chỉ test tổng
  // hợp tự-fill cùng model nên không bắt được; E2E render thật lộ ra).
  const colIndex = q0 % cols
  const rowIndex = Math.floor(q0 / cols)

  // Absolute marker offsets are resolved from the padding-box. Therefore the
  // outer frame border cancels out; adding it here shifts every sample inward.
  const gridLeft = INTEGRATED_MARKER_OVERHANG + INTEGRATED_PAD_X
  const gridTop = INTEGRATED_MARKER_OVERHANG + INTEGRATED_PAD_Y
  const contentW = INTEGRATED_REF_W - 2 * gridLeft
  const colW = (contentW - (cols - 1) * INTEGRATED_GRID_GAP_X) / cols
  const rowPitch = INTEGRATED_ROW_H + INTEGRATED_GRID_GAP_Y

  const bubbleCenterFromRowRight = (3 - optIndex) * (INTEGRATED_BUBBLE_W + INTEGRATED_BUBBLE_GAP) + INTEGRATED_BUBBLE_W / 2
  // Bubble group is aligned to the row content-box, one row border inside the
  // grid-cell border-box.
  const rowRight = (colIndex + 1) * colW + colIndex * INTEGRATED_GRID_GAP_X - INTEGRATED_ROW_BORDER_W
  const xf = (gridLeft + rowRight - bubbleCenterFromRowRight) / INTEGRATED_REF_W
  // Chiều cao khung thay đổi theo số hàng. Dùng REF_H cố định của đề 50 câu
  // khiến đề 10/20 câu sample lệch 11–27px trên render Chromium thật.
  const frameRefH = integratedFrameH(totalQuestions)
  const yf = (gridTop + rowIndex * rowPitch + INTEGRATED_ROW_H / 2) / frameRefH

  // frame-relative → page space theo rect đo được
  const x = frame.x0 + xf * (frame.x1 - frame.x0)
  const y = frame.y0 + yf * (frame.y1 - frame.y0)

  return { questionIndex, option, x, y }
}

/** Tương đương integratedMcOptionToCellForRect với rect template tĩnh (INTEGRATED_OMR_MARKERS). */
export function integratedMcOptionToCell(
  questionIndex: number,
  option: 'A' | 'B' | 'C' | 'D',
  totalQuestions = 20
): McQuestionCellPosition {
  return integratedMcOptionToCellForRect(questionIndex, option, totalQuestions, integratedDefaultFrameRect())
}

/** Danh sách ô cho detector khi quét khung INTEGRATED theo rect đo được — questionIndex 1..totalQuestions. */
export function integratedMcCellsForRect(totalQuestions = 20, frame: FrameRect): McQuestionCellPosition[] {
  const out: McQuestionCellPosition[] = []
  const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
  for (let q = 1; q <= totalQuestions; q++) {
    for (const opt of options) {
      out.push(integratedMcOptionToCellForRect(q, opt, totalQuestions, frame))
    }
  }
  return out
}

/** Danh sách ô cho detector khi quét khung INTEGRATED theo template tĩnh — questionIndex 1..totalQuestions. */
export function integratedMcCells(totalQuestions = 20): McQuestionCellPosition[] {
  return integratedMcCellsForRect(totalQuestions, integratedDefaultFrameRect())
}
