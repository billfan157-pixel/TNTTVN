import { generateExamQrSvg, generateExamQrDataUrl, buildExamQrPayload, getExamQrViewBoxSize } from '../lib/qr'
import type { ExamVersionCode } from '../types'
import { generateBarcodeSvg, getBarcodeViewBoxWidth } from '../lib/barcode'
import {
  CORNER_MARKERS,
  CORNER_SIZE,
  INTEGRATED_BORDER_W,
  INTEGRATED_BUBBLE_GAP,
  INTEGRATED_BUBBLE_W,
  INTEGRATED_GRID_GAP_X,
  INTEGRATED_GRID_GAP_Y,
  INTEGRATED_MARKER_SIZE,
  INTEGRATED_PAD_X,
  INTEGRATED_PAD_Y,
  INTEGRATED_QNUM_GAP,
  INTEGRATED_QNUM_W,
  INTEGRATED_ROW_BORDER_W,
  INTEGRATED_ROW_H,
  allCells,
  scoreToCell,
  mcOptionToCell,
  getMcColumnLayout,
  integratedGridCols,
  QR_X,
  QR_Y,
  QR_SIZE,
} from '../lib/answerSheetTemplate'
import { escapeHtml } from './grades'
import { ReportExportService } from '../services/reportExportService'
import type { ExamQuestion } from '../types'

/**
 * A01 Phase 2 + A-NEW-03 (2026-08-10): builder tách để test — KHÔNG dùng document.write;
 * popup nhận HTML qua Blob URL (như ReportExportService). Mọi field user data bắt buộc escapeHtml.
 */

/**
 * Sanitize SVG inner content before injecting via dangerouslySetInnerHTML.
 * Strips <script>, event handlers, and non-SVG elements as defense-in-depth.
 * Source data is app-generated (qrcode-generator) but this prevents any future misuse.
 */
export function sanitizeSvgInner(svgInner: string): string {
  return svgInner
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
}
export function buildQrSheetHtml(title: string, qrSvgs: { payload: string; svg: string; name: string; code: string }[]): string {
  return `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>
    body { font-family: sans-serif; padding: 24px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h2 { margin: 0 0 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .card { border: 1px dashed #999; border-radius: 8px; padding: 10px; text-align: center; page-break-inside: avoid; }
    .name { font-weight: bold; font-size: 13px; margin-top: 4px; }
    .code { font-size: 11px; color: #666; }
    .hint { font-size: 10px; color: #999; margin-top: 2px; }
    svg { width: 120px; height: 120px; }
  </style></head><body>
  <h2>${escapeHtml(title)}</h2>
  <div class="meta">Mỗi phiếu chứa mã QR riêng của học sinh — cắt rời trước khi phát. Quét mã sẽ ghi điểm vào đúng học sinh (Phase 2).</div>
  <div class="grid">${qrSvgs.map(q => `<div class="card">${q.svg}<div class="name">${escapeHtml(q.name)}</div><div class="code">${escapeHtml(q.code)}</div><div class="hint">${escapeHtml(q.payload)}</div></div>`).join('')}</div>
  </body></html>`
}

export function printQrSheet(title: string, qrSvgs: { payload: string; svg: string; name: string; code: string }[]) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  try {
    const url = URL.createObjectURL(new Blob([buildQrSheetHtml(title, qrSvgs)], { type: 'text/html;charset=utf-8' }))
    let printed = false
    win.location.href = url
    win.focus()
    win.onload = () => {
      if (printed) return
      printed = true
      win.print()
    }
    setTimeout(() => {
      if (!printed) {
        printed = true
        win.print()
      }
    }, 2000)
    // Giữ Blob URL sống 60s để driver in đọc đầy đủ ảnh/SVG
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    win.close()
  }
}

export interface BatchAnswerSheetParams {
  sessionId: string
  subject: string
  scoreTypeLabel: string
  classLabel: string
  maxScore: number
  examType?: 'written' | 'multiple_choice'
  questionCount?: number
  examVersion?: ExamVersionCode
}

export interface StudentSheetInfo {
  id: string
  code: string
  name: string
}

/** Tạo chuỗi SVG cho 1 phiếu trả lời học viên. */
export function buildSingleAnswerSheetSvgString(
  student: StudentSheetInfo,
  params: BatchAnswerSheetParams
): string {
  const { sessionId, subject, scoreTypeLabel, classLabel, maxScore, examType = 'written', questionCount = 20, examVersion = 'A' } = params
  const qrPayload = buildExamQrPayload(sessionId, student.id, {
    templateMode: 'full_page',
    questionCount: examType === 'multiple_choice' ? questionCount : Math.max(1, maxScore + 1),
    examVersion,
  })
  const rawQr = generateExamQrSvg(qrPayload, 4)
  const qrViewBoxSize = getExamQrViewBoxSize(qrPayload)
  const qrInner = sanitizeSvgInner(rawQr.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''))
  const rawBarcode = generateBarcodeSvg(qrPayload, 28, 1.2)
  const barcodeViewBoxWidth = getBarcodeViewBoxWidth(qrPayload, 1.2)
  const barcodeInner = sanitizeSvgInner(rawBarcode.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''))

  const VW = 1000
  const VH = Math.round(VW / 0.707)
  const px = (nx: number) => nx * VW
  const py = (ny: number) => ny * VH
  const markerW = px(CORNER_SIZE)
  const markerH = markerW

  const cells = allCells(maxScore)
  const layout = getMcColumnLayout(questionCount)

  let contentSvg = ''

  if (examType === 'multiple_choice') {
    // Vẽ khối khung cột cho các câu hỏi
    const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
    let questionsMarkup = ''

    // Background khung cột
    for (let c = 0; c < layout.cols; c++) {
      const colX = px(0.05 + c * layout.colWidth) + 4
      const colW = px(layout.colWidth) - 8
      const colY = py(layout.startY) - 28
      const colH = py(layout.endY - layout.startY) + 44
      questionsMarkup += `<rect x="${colX}" y="${colY}" width="${colW}" height="${colH}" rx="8" fill="#FAFAFA" stroke="#E2E8F0" stroke-width="1.5" />`
      questionsMarkup += `<text x="${colX + colW / 2}" y="${colY + 18}" font-size="12" font-weight="bold" fill="#64748B" text-anchor="middle">CỘT ${c + 1}</text>`
    }

    // A-NEW-50: ô tròn co giãn theo số câu — 50 câu r=10 (pitch 0.030, detector
    // core ring ~8.6px vẫn nằm trong ô), đề ít câu giữ kích thước tô thoải mái.
    const circleR = questionCount > 35 ? 10 : (questionCount > 18 ? 11.5 : 12.5)
    const fontSize = questionCount > 35 ? 9.5 : (questionCount > 18 ? 10.5 : 11.5)
    const labelSize = questionCount > 35 ? 10.5 : (questionCount > 18 ? 11.5 : 12.5)
    const strokeW = questionCount > 35 ? 1.6 : (questionCount > 18 ? 1.8 : 2)
    const labelOffset = questionCount > 35 ? 12 : (questionCount > 18 ? 15 : 18)

    for (let i = 1; i <= questionCount; i++) {
      const q = i
      const colIndex = Math.floor((q - 1) / layout.qPerCol)
      const rowIndex = (q - 1) % layout.qPerCol
      // Alternating row highlight
      if (rowIndex % 2 === 1) {
        const firstPos = mcOptionToCell(q, 'A', questionCount)
        const colX = px(0.05 + colIndex * layout.colWidth) + 4
        const colW = px(layout.colWidth) - 8
        const rowX = colX + 4
        const rowW = colW - 8
        const rowH = Math.min(32, Math.max(18, py(layout.rowPitchY) * 0.82))
        questionsMarkup += `<rect x="${rowX}" y="${py(firstPos.y) - rowH / 2}" width="${rowW}" height="${rowH}" rx="4" fill="#F1F5F9" />`
      }

      for (const opt of options) {
        const pos = mcOptionToCell(q, opt, questionCount)
        if (opt === 'A') {
          questionsMarkup += `<text x="${px(pos.x) - labelOffset}" y="${py(pos.y)}" font-size="${labelSize}" font-weight="bold" fill="#334155" text-anchor="end" dominant-baseline="central">câu ${q}:</text>`
        }
        questionsMarkup += `<g>
          <circle cx="${px(pos.x)}" cy="${py(pos.y)}" r="${circleR}" fill="#FFFFFF" stroke="#64748B" stroke-width="${strokeW}" />
          <text x="${px(pos.x)}" y="${py(pos.y)}" font-size="${fontSize}" font-weight="600" fill="#64748B" text-anchor="middle" dominant-baseline="central">${opt}</text>
        </g>`
      }
    }
    contentSvg = questionsMarkup
  } else {
    // Tự luận — Khung điểm 0..maxScore + Khung Giám thị
    let writtenMarkup = ''
    writtenMarkup += `<rect x="${px(0.08)}" y="${py(0.46)}" width="${px(0.84)}" height="${py(0.24)}" rx="10" fill="#FAFAFA" stroke="#CBD5E1" stroke-width="1.5" />`
    writtenMarkup += `<text x="${px(0.50)}" y="${py(0.495)}" font-size="14" font-weight="bold" fill="#334155" text-anchor="middle">BẢNG TÔ ĐIỂM SỐ DÀNH CHO HUYNH TRƯỞNG / GLV (0 – ${maxScore})</text>`

    for (const c of cells) {
      const pos = scoreToCell(c.score, maxScore)
      writtenMarkup += `<g>
        <rect x="${px(pos.x) - 18}" y="${py(pos.y) - 18}" width="36" height="36" rx="7" fill="#FFFFFF" stroke="#1E293B" stroke-width="2" />
        <text x="${px(pos.x)}" y="${py(pos.y)}" font-size="18" font-weight="800" fill="#0F172A" text-anchor="middle" dominant-baseline="central">${c.score}</text>
      </g>`
    }

    // Khung Lời phê & Chữ ký
    writtenMarkup += `<rect x="${px(0.08)}" y="${py(0.73)}" width="${px(0.40)}" height="${py(0.15)}" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />`
    writtenMarkup += `<text x="${px(0.10)}" y="${py(0.758)}" font-size="13" font-weight="bold" fill="#475569">LỜI PHÊ CỦA GLV / GIÁM THỊ:</text>`
    writtenMarkup += `<line x1="${px(0.10)}" y1="${py(0.795)}" x2="${px(0.46)}" y2="${py(0.795)}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="3 3" />`
    writtenMarkup += `<line x1="${px(0.10)}" y1="${py(0.830)}" x2="${px(0.46)}" y2="${py(0.830)}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="3 3" />`

    writtenMarkup += `<rect x="${px(0.52)}" y="${py(0.73)}" width="${px(0.40)}" height="${py(0.15)}" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />`
    writtenMarkup += `<text x="${px(0.72)}" y="${py(0.758)}" font-size="13" font-weight="bold" fill="#475569" text-anchor="middle">CHỮ KÝ GIÁM THỊ</text>`

    contentSvg = writtenMarkup
  }

  // Visual Markers
  let markersSvg = ''
  for (const m of CORNER_MARKERS) {
    markersSvg += `<rect x="${px(m.x) - markerW * 0.72}" y="${py(m.y) - markerH * 0.72}" width="${markerW * 1.44}" height="${markerH * 1.44}" fill="#FFFFFF" />`
    markersSvg += `<rect x="${px(m.x) - markerW / 2}" y="${py(m.y) - markerH / 2}" width="${markerW}" height="${markerH}" fill="#000000" />`
  }

  return `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">
    <!-- Khung viền trang trí A4 -->
    <rect x="12" y="12" width="${VW - 24}" height="${VH - 24}" rx="12" fill="none" stroke="#CBD5E1" stroke-width="2" />
    <rect x="18" y="18" width="${VW - 36}" height="${VH - 36}" rx="8" fill="none" stroke="#94A3B8" stroke-width="1" stroke-dasharray="6 4" />

    <!-- Tiêu đề Header -->
    <text x="${px(0.04)}" y="${py(0.045)}" font-size="24" font-weight="900" fill="#1E3A8A" letter-spacing="0.5">PHIẾU TRẢ LỜI KIỂM TRA</text>
    <text x="${px(0.04)}" y="${py(0.075)}" font-size="15" font-weight="700" fill="#475569">${escapeHtml(subject)} — ${escapeHtml(scoreTypeLabel)} · Lớp: ${escapeHtml(classLabel)} · Mã đề: ${examVersion}</text>

    <!-- Khung thông tin học viên -->
    <rect x="${px(0.04)}" y="${py(0.100)}" width="${px(0.63)}" height="${py(0.125)}" rx="8" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="1" />
    <text x="${px(0.06)}" y="${py(0.130)}" font-size="14" font-weight="bold" fill="#1E293B">Họ & Tên: <tspan font-weight="900" fill="#1E3A8A">${escapeHtml(student.name)}</tspan></text>
    <text x="${px(0.06)}" y="${py(0.165)}" font-size="13" font-weight="600" fill="#475569">Mã thiếu nhi: <tspan font-weight="bold" fill="#0F172A">${escapeHtml(student.code)}</tspan></text>
    <text x="${px(0.38)}" y="${py(0.165)}" font-size="13" font-weight="600" fill="#475569">Lớp: <tspan font-weight="bold" fill="#0F172A">${escapeHtml(classLabel)}</tspan></text>

    <!-- QR Code định danh học viên (bên góc phải) -->
    <rect x="${px(QR_X)}" y="${py(QR_Y)}" width="${px(QR_SIZE)}" height="${px(QR_SIZE)}" rx="6" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.5" />
    <svg x="${px(QR_X) + 3}" y="${py(QR_Y) + 3}" width="${px(QR_SIZE) - 6}" height="${px(QR_SIZE) - 6}" viewBox="0 0 ${qrViewBoxSize} ${qrViewBoxSize}">${qrInner}</svg>
    <text x="${px(QR_X) + px(QR_SIZE) / 2}" y="${py(QR_Y) + px(QR_SIZE) + 16}" font-size="11" font-weight="bold" fill="#64748B" text-anchor="middle">MÃ QUÉT CHẤM TỰ ĐỘNG</text>

    <!-- Barcode Code128 backup — dải cuối phiếu full-width. Container ≥ 0.7 chiều
         rộng trang để pitch in A4 ≥ 0.19mm (đọc được); vị trí dưới mọi nội dung
         và trên marker góc BR/BL để không cản OMR. -->
    <svg x="${px(0.09)}" y="${py(0.955)}" width="${px(0.82)}" height="28" viewBox="0 0 ${barcodeViewBoxWidth} 28" preserveAspectRatio="none">${barcodeInner}</svg>

    <!-- Khung Hướng Dẫn Tô Ô -->
    <rect x="${px(0.04)}" y="${py(0.235)}" width="${px(0.92)}" height="${py(0.055)}" rx="6" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="1" />
    <text x="${px(0.06)}" y="${py(0.262)}" font-size="12.5" font-weight="800" fill="#1E40AF">HƯỚNG DẪN TÔ Ô:</text>
    <text x="${px(0.21)}" y="${py(0.262)}" font-size="11.5" font-weight="600" fill="#1E293B">${
      examType === 'multiple_choice'
        ? `T\\u00f4 k\\u00edn \\u0111\\u0103m M\\u1ed8T \\u0111\\u00e1p \\u00e1n \\u0111\\u00fang (A, B, C, D) cho t\\u1ea7ng c\\u00e2u (${questionCount} c\\u00e2u).`
        : `T\\u00f4 k\\u00edn \\u0111\\u0103m M\\u1ed8T \\u00f4 duy nh\\u1ea5t t\\u01b0\\u0303ng \\u1ee9ng v\\u1edbi \\u0111i\\u1ec3m \\u0111\\u1ea1t \\u0111\\u01b0\\u1ee3c (0 \\u2013 ${maxScore}).`
    }</text>

    <g transform="translate(${px(0.68)}, ${py(0.245)})">
      ${
        examType === 'multiple_choice'
          ? `<rect x="0" y="0" width="16" height="16" rx="3" fill="#0F172A" />
      <text x="22" y="13" font-size="11" font-weight="bold" fill="#166534">\u0110\u00daNG</text>
      <rect x="70" y="0" width="16" height="16" rx="3" fill="#FFFFFF" stroke="#64748B" stroke-width="1.5" />
      <line x1="72" y1="2" x2="84" y2="14" stroke="#DC2626" stroke-width="2" />
      <line x1="84" y1="2" x2="72" y2="14" stroke="#DC2626" stroke-width="2" />
      <text x="92" y="13" font-size="11" font-weight="bold" fill="#991B1B">SAI</text>
      <rect x="130" y="0" width="16" height="16" rx="3" fill="#FFFFFF" stroke="#64748B" stroke-width="1.5" />
      <circle cx="138" cy="8" r="5" fill="none" stroke="#DC2626" stroke-width="2" />
      <text x="152" y="13" font-size="11" font-weight="bold" fill="#991B1B">SAI</text>`
          : `<rect x="0" y="0" width="16" height="16" rx="3" fill="#0F172A" />
      <text x="22" y="13" font-size="11" font-weight="bold" fill="#166534">T\u00d4 \u0110\u00daNG</text>
      <rect x="80" y="0" width="16" height="16" rx="3" fill="#FFFFFF" stroke="#64748B" stroke-width="1.5" />
      <text x="102" y="13" font-size="11" font-weight="bold" fill="#991B1B">KH\u00d4NG T\u00d4</text>
      <rect x="160" y="0" width="16" height="16" rx="3" fill="#FFFFFF" stroke="#64748B" stroke-width="1.5" />
      <line x1="162" y1="2" x2="174" y2="14" stroke="#DC2626" stroke-width="2" />
      <line x1="174" y1="2" x2="162" y2="14" stroke="#DC2626" stroke-width="2" />
      <text x="182" y="13" font-size="11" font-weight="bold" fill="#991B1B">SAI</text>`
      }
    </g>

    <!-- 4 Homography Corner Markers -->
    ${markersSvg}

    <!-- Nội dung bài làm (Trắc nghiệm hoặc Tự luận) -->
    ${contentSvg}
  </svg>`
}

/** Dựng HTML đa trang A4 để in hàng loạt toàn bộ học viên trong 1 lớp. */
export function buildBatchAnswerSheetsHtml(
  students: StudentSheetInfo[],
  params: BatchAnswerSheetParams
): string {
  const title = `Phiếu Trả Lời — ${params.subject} (${params.classLabel})`
  const pagesHtml = students.map(student => {
    const svgString = buildSingleAnswerSheetSvgString(student, params)
    return `<div class="answer-sheet-page">${svgString}</div>`
  }).join('')

  return `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .answer-sheet-page {
      width: 210mm;
      height: 297mm;
      padding: 10mm;
      margin: 0 auto 8mm auto;
      background: #ffffff;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    @media print {
      body { background: #ffffff; }
      .answer-sheet-page {
        margin: 0;
        box-shadow: none;
        width: 100vw;
        height: 100vh;
        padding: 6mm;
      }
    }
  </style></head><body>
    ${pagesHtml}
  </body></html>`
}

/** In hàng loạt phiếu trả lời cho danh sách học viên qua Blob URL và ReportExportService. */
export function printBatchAnswerSheets(
  students: StudentSheetInfo[],
  params: BatchAnswerSheetParams
) {
  if (!students.length) return
  const htmlContent = buildBatchAnswerSheetsHtml(students, params)
  ReportExportService.print(htmlContent)
}

/** Xuất PDF phiếu trả lời — mở print dialog để user chọn "Save as PDF". */
export function exportAnswerSheetPdf(
  students: StudentSheetInfo[],
  params: BatchAnswerSheetParams
) {
  if (!students.length) return
  const htmlContent = buildBatchAnswerSheetsHtml(students, params)
  const filename = `PhieuTraLoi_${params.subject}_${params.classLabel}`.replace(/[<>:"/\\|?*]/g, '_')
  ReportExportService.exportPdf(htmlContent, filename)
}

export interface ExamPaperPrintOptions {
  parishName?: string
  dioceseName?: string
  subject: string
  classLabel: string
  academicYear: string
  durationMinutes?: number
  questions: ExamQuestion[]
  showAnswerKey?: boolean
  layoutColumns?: 1 | 2
  includeAnswerGrid?: boolean
  includeGradingBox?: boolean
  includeStudentInfo?: boolean
  includeExplanations?: boolean
  sessionId?: string
  examVersion?: ExamVersionCode
  student?: {
    id: string
    code: string
    name: string
  }
}

/** Lấy toàn bộ CSS style dùng chung cho in Đề Thi đơn lẻ và in Đề Thi hàng loạt */
export function getExamPaperStyles(layoutColumns: 1 | 2 = 2, includeGradingBox = true): string {
  return `
    @page {
      size: A4 portrait;
      /* QB-MARGIN (2026-08-21): 10/8/8/8 → 8/6/6/6 theo yêu cầu thu hẹp viền in.
         Marker khung OMR còn cách mép giấy ~8.2mm (>5mm hardware margin thông thường). */
      margin: 8mm 6mm 6mm 6mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.3;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .exam-paper-container {
      width: 100%;
      max-width: 210mm;
      min-width: 0;
      margin: 0 auto;
      position: relative;
      /* Lề ngang 7mm (QB-MARGIN 2026-08-21, trước 8mm) — khớp lề wrapper batch (buildBatchExamPapersHtml): marker
         khung integrated nằm lệch ra ngoài theo INTEGRATED_MARKER_SIZE; lề này cùng
         @page margin bảo đảm marker TL/BL không bị clip mép giấy (~8.2mm đề đơn /
         ~6.4mm đề gộp tính đến mép marker). KHÔNG giảm thêm nếu không chạy lại E2E scan. */
      padding: 0 7mm;
    }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 48pt;
      font-weight: 900;
      color: rgba(0, 0, 0, 0.035);
      white-space: nowrap;
      pointer-events: none;
      z-index: 0;
      user-select: none;
      letter-spacing: 8px;
    }
    /* Header V4: tổng chiều rộng hữu hạn. Bản cũ dùng 40% + 46% + 20% =
       106%, khiến browser/driver in tự shrink khác nhau và làm QR/header lệch. */
    .paper-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr) 122px;
      column-gap: 8px;
      align-items: start;
      width: 100%;
      min-width: 0;
      border-bottom: 2px solid #000;
      padding-bottom: 4px;
      margin-bottom: 5px;
    }
    .header-left {
      text-align: center;
      width: auto;
      min-width: 0;
      font-size: 10.25pt;
      line-height: 1.22;
    }
    .header-left .org-top {
      text-transform: uppercase;
      font-weight: bold;
    }
    .header-left .org-parish {
      text-transform: uppercase;
      font-weight: 800;
      color: #1e3a8a;
    }
    .header-right {
      text-align: center;
      width: auto;
      min-width: 0;
      line-height: 1.22;
      padding-top: 1px;
    }
    .header-right .exam-title {
      font-size: 12.5pt;
      font-weight: 800;
      text-transform: uppercase;
      color: #b91c1c;
      margin: 2px 0;
      overflow-wrap: break-word;
    }
    .header-right .exam-sub {
      font-size: 10.5pt;
      font-weight: bold;
    }
    .header-right .exam-time {
      font-size: 9.75pt;
      font-style: italic;
    }
    .header-qr-zone {
      width: 122px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .qr-box {
      /* QR production gồm 21 data module + quiet zone. 120px tạo dư địa hơn
         4px/module trước khi camera thu nhỏ cả tờ A4, vẫn nằm gọn trong cột. */
      width: 120px;
      height: 120px;
      padding: 0;
      background: #fff;
      border: 1px solid #0f172a;
      border-radius: 4px;
    }
    .qr-label {
      font-size: 6.5pt;
      font-weight: bold;
      color: #475569;
      text-align: center;
      margin-top: 2px;
      line-height: 1.1;
    }

    /* Khung thông tin học sinh & Khung chấm điểm của Giáo Lý Viên gộp chung */
    .top-meta-container {
      display: flex;
      gap: 6px;
      width: 100%;
      min-width: 0;
      margin-bottom: 5px;
      align-items: stretch;
    }
    .student-info-box {
      flex: 1 1 auto;
      min-width: 0;
      border: 1px solid #000;
      border-radius: 4px;
      padding: 5px 8px;
      font-size: 10.25pt;
      background: #fafafa;
      display: flex;
      flex-direction: column;
      justify-content: space-around;
      gap: 3px;
    }
    .student-info-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      min-width: 0;
      gap: 6px;
    }
    .student-info-row > span {
      min-width: 0;
      white-space: nowrap;
    }
    .dots {
      border-bottom: 1px dotted #666;
      flex: 1;
      min-width: 24px;
      margin-bottom: 3px;
    }

    /* Bảng chấm điểm & Lời phê của GLV */
    .grading-box {
      width: ${includeGradingBox ? '280px' : '0'};
      max-width: ${includeGradingBox ? '39%' : '0'};
      min-width: ${includeGradingBox ? '250px' : '0'};
      flex: ${includeGradingBox ? '0 1 280px' : '0 0 0'};
      display: ${includeGradingBox ? 'flex' : 'none'};
      flex-direction: column;
      border: 1px solid #000;
      border-radius: 4px;
      overflow: hidden;
      background: #fff;
    }
    .grading-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      height: 100%;
      text-align: center;
      font-size: 9pt;
    }
    .grading-table th {
      background: #f1f5f9;
      border: 1px solid #000;
      padding: 2px;
      font-weight: bold;
      font-size: 8pt;
      line-height: 1.15;
      overflow-wrap: break-word;
    }
    .grading-table td {
      border: 1px solid #000;
      padding: 2px;
      height: 34px;
      vertical-align: middle;
    }
    .grade-score-cell {
      font-size: 13pt;
      font-weight: 900;
      color: #b91c1c;
    }
    .feedback-cell {
      font-size: 8pt;
      font-style: italic;
      color: #64748b;
      text-align: left;
      padding-left: 4px;
    }

    /* Khung OMR Tích Hợp với 4 Góc Định Vị Homography — geometry px phải
       khớp 100% hằng số SSOT (INTEGRATED_* trong answerSheetTemplate.ts).
       V4 chỉ sửa cách browser phân bổ track; không thay tâm marker/bubble. */
    .integrated-omr-wrapper {
      width: 100%;
      min-width: 0;
      margin-bottom: 8px;
      background: #f8fafc;
      border-radius: 4px;
    }
    .omr-frame {
      position: relative;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      padding: ${INTEGRATED_PAD_Y}px ${INTEGRATED_PAD_X}px;
      border: ${INTEGRATED_BORDER_W}px solid #0f172a;
      border-radius: 4px;
      box-sizing: border-box;
    }
    .omr-corner-marker {
      position: absolute;
      width: ${INTEGRATED_MARKER_SIZE}px;
      height: ${INTEGRATED_MARKER_SIZE}px;
      background: #000000;
      box-shadow: 0 0 0 3px #ffffff;
    }
    /* Marker nằm LỆCH RA NGOÀI khung (.omr-frame) — không đè bubble cạnh mép.
       Kích thước, overhang và detector dùng chung SSOT answerSheetTemplate.ts. */
    .omr-marker-tl { top: -${INTEGRATED_MARKER_SIZE}px; left: -${INTEGRATED_MARKER_SIZE}px; }
    .omr-marker-tr { top: -${INTEGRATED_MARKER_SIZE}px; right: -${INTEGRATED_MARKER_SIZE}px; }
    .omr-marker-bl { bottom: -${INTEGRATED_MARKER_SIZE}px; left: -${INTEGRATED_MARKER_SIZE}px; }
    .omr-marker-br { bottom: -${INTEGRATED_MARKER_SIZE}px; right: -${INTEGRATED_MARKER_SIZE}px; }

    .answer-sheet-header {
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
      gap: 8px;
      align-items: center;
      width: 100%;
      min-width: 0;
      margin-bottom: 4px;
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 3px;
    }
    .omr-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      font-size: 6.5pt;
      font-weight: 900;
      padding: 0.5px 3.5px;
      border-radius: 2px;
      margin-right: 3px;
      letter-spacing: 0.4px;
    }
    .answer-sheet-title {
      min-width: 0;
      font-size: 8.5pt;
      font-weight: 800;
      color: #1e3a8a;
      text-transform: uppercase;
      letter-spacing: 0.2px;
      line-height: 1.15;
    }
    .answer-sheet-guide {
      min-width: 0;
      font-size: 7.25pt;
      font-style: italic;
      color: #475569;
      text-align: right;
      line-height: 1.15;
      white-space: normal;
      overflow-wrap: break-word;
    }
    /* 1fr có min-content floor; với 8 cột × (số câu + 4 bubble), Chromium
       từng nới grid vượt frame ở 50 câu. minmax(0,1fr) ép track tuân theo
       frame thật. Bubble được neo tuyệt đối vào content-box đúng công thức
       integratedMcOptionToCellForRect nên tâm OMR không đổi. */
    .answer-grid-container {
      display: grid;
      width: 100%;
      min-width: 0;
      gap: ${INTEGRATED_GRID_GAP_Y}px ${INTEGRATED_GRID_GAP_X}px;
    }
    .grid-q-row {
      position: relative;
      display: block;
      min-width: 0;
      overflow: hidden;
      background: #fff;
      border: ${INTEGRATED_ROW_BORDER_W}px solid #cbd5e1;
      border-radius: 2px;
      padding: 0;
      box-sizing: border-box;
      height: ${INTEGRATED_ROW_H}px;
    }
    .q-num {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      display: block;
      font-weight: 800;
      font-size: 6pt;
      width: ${INTEGRATED_QNUM_W}px;
      color: #1e293b;
      line-height: 1;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
    }
    .bubble-group {
      position: absolute;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      display: inline-flex;
      align-items: center;
      gap: ${INTEGRATED_BUBBLE_GAP}px;
      white-space: nowrap;
    }
    .bubble {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: ${INTEGRATED_BUBBLE_W}px;
      height: ${INTEGRATED_BUBBLE_W}px;
      box-sizing: border-box;
      border-radius: 50%;
      border: 1.1px solid #64748b;
      font-size: 7pt;
      font-weight: 600;
      color: #64748b;
      line-height: 1;
      background: #fff;
      flex: 0 0 ${INTEGRATED_BUBBLE_W}px;
    }
    .bubble-correct {
      background: #16a34a !important;
      color: #ffffff !important;
      border-color: #15803d !important;
      font-weight: 900;
    }
    .bubble-filled {
      background: #0f172a !important;
      color: #ffffff !important;
      border-color: #0f172a !important;
    }

    /* Khối câu hỏi đề thi */
    .questions-wrapper {
      min-width: 0;
      ${layoutColumns === 2 ? 'column-count: 2; column-gap: 16px; column-rule: 1px solid #e2e8f0;' : ''}
    }
    .question-block {
      min-width: 0;
      margin-bottom: 5px;
      break-inside: avoid;
      page-break-inside: avoid;
      font-size: 10pt;
    }
    .question-title {
      min-width: 0;
      font-weight: normal;
      margin-bottom: 2px;
      text-align: left;
      line-height: 1.27;
      overflow-wrap: break-word;
      word-break: normal;
    }
    .options-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: start;
      gap: 2px 8px;
      min-width: 0;
      padding-left: 4px;
    }
    .option-item {
      min-width: 0;
      font-size: 10pt;
      line-height: 1.2;
      overflow-wrap: break-word;
      word-break: normal;
    }
    .option-label {
      font-weight: bold;
      margin-right: 2px;
    }
    .option-correct {
      font-weight: bold;
      color: #15803d;
      background: #dcfce7;
      border-radius: 3px;
      padding: 0 3px;
    }
    .answer-key-summary {
      margin-top: 12px;
      border-top: 2px solid #000;
      padding-top: 6px;
      break-inside: avoid;
    }
    .key-header {
      font-weight: bold;
      text-align: center;
      margin-bottom: 5px;
      color: #1e3a8a;
      font-size: 10.5pt;
    }
    .key-grid {
      display: grid;
      grid-template-columns: repeat(10, minmax(0, 1fr));
      gap: 3px;
      text-align: center;
    }
    .key-cell {
      min-width: 0;
      border: 1px solid #94a3b8;
      border-radius: 3px;
      padding: 2px;
      font-size: 9pt;
    }
    .key-q {
      color: #64748b;
      font-size: 8pt;
      display: block;
    }
    .key-ans {
      font-weight: bold;
      color: #b91c1c;
      font-size: 10pt;
    }
  `
}

/**
 * Dựng HTML đề thi A4 chuẩn in ấn gộp Phiếu Chấm & Bảng Trả Lời Trắc Nghiệm (tùy chọn 1/2 cột, có/không kèm đáp án).
 */
export function buildExamPaperHtml(options: ExamPaperPrintOptions): string {
  const {
    parishName = 'Giáo Xứ',
    dioceseName = 'Giáo Phận',
    subject,
    classLabel,
    academicYear,
    durationMinutes = 45,
    questions = [],
    showAnswerKey = false,
    layoutColumns = 2,
    includeAnswerGrid = true,
    includeGradingBox = true,
    sessionId = 'SESS-001',
    examVersion = 'A',
    student,
  } = options

  const title = `Đề Thi & Phiếu Trả Lời — ${subject} (${classLabel})`
  const effectiveQuestions = [...questions].sort((a, b) => (a.index || 0) - (b.index || 0))

  const questionsHtml = effectiveQuestions.map((q) => {
    const isA = q.correctOption === 'A' && showAnswerKey
    const isB = q.correctOption === 'B' && showAnswerKey
    const isC = q.correctOption === 'C' && showAnswerKey
    const isD = q.correctOption === 'D' && showAnswerKey

    return `
      <div class="question-block">
        <div class="question-title">
          <strong>Câu ${q.index}:</strong> ${escapeHtml(q.question)}
        </div>
        <div class="options-grid">
          <div class="option-item ${isA ? 'option-correct' : ''}">
            <span class="option-label">A.</span> ${escapeHtml(q.options.A)}
          </div>
          <div class="option-item ${isB ? 'option-correct' : ''}">
            <span class="option-label">B.</span> ${escapeHtml(q.options.B)}
          </div>
          <div class="option-item ${isC ? 'option-correct' : ''}">
            <span class="option-label">C.</span> ${escapeHtml(q.options.C)}
          </div>
          <div class="option-item ${isD ? 'option-correct' : ''}">
            <span class="option-label">D.</span> ${escapeHtml(q.options.D)}
          </div>
        </div>
      </div>
    `
  }).join('')

  // Sinh QR code định danh dạng Base64 Data URL (tương thích 100% cả trình duyệt, in ấn, PDF và Microsoft Word)
  // P0 Guard: Nếu là bản Đáp Án GLV hoặc không có khung OMR (includeAnswerGrid = false), không encode templateMode: 'integrated'
  const qrPayload = showAnswerKey
    ? `tntt-exam:${sessionId}:KEY:${examVersion}`
    : student
      ? (includeAnswerGrid && effectiveQuestions.length > 0
          ? buildExamQrPayload(sessionId, student.id, {
              templateMode: 'integrated',
              questionCount: Math.max(1, effectiveQuestions.length),
              examVersion,
            })
          : buildExamQrPayload(sessionId, student.id))
      : `tntt-exam:${sessionId}:GENERIC`
  const qrDataUrl = generateExamQrDataUrl(qrPayload, 4)

  // Bảng ma trận phiếu trả lời trắc nghiệm tích hợp (gộp trực tiếp trên tờ đề)
  let answerGridHtml = ''
  if (includeAnswerGrid && effectiveQuestions.length > 0) {
    const totalQ = effectiveQuestions.length
    // V3 compatibility: giữ nguyên 5 cột ≤20 và 8 cột 21..50. V4 chỉ sửa
    // CSS track sizing/min-content để không thay tọa độ detector hay phiếu cũ.
    const gridCols = integratedGridCols(totalQ)

    answerGridHtml = `
      <div class="integrated-omr-wrapper">
        <div class="answer-sheet-header">
          <div class="answer-sheet-title">
            <span class="omr-badge">OMR SCAN</span> BẢNG TRẢ LỜI TRẮC NGHIỆM · ${totalQ} CÂU
          </div>
          <div class="answer-sheet-guide">
            Tô kín 1 ô A/B/C/D bằng bút xanh/đen hoặc chì đậm.
          </div>
        </div>

        <div class="omr-frame">
          <!-- 4 Góc định vị OMR Homography — tâm marker nằm đúng mép khung lưới -->
          <div class="omr-corner-marker omr-marker-tl" title="Marker TL"></div>
          <div class="omr-corner-marker omr-marker-tr" title="Marker TR"></div>
          <div class="omr-corner-marker omr-marker-bl" title="Marker BL"></div>
          <div class="omr-corner-marker omr-marker-br" title="Marker BR"></div>

          <div class="answer-grid-container" style="grid-template-columns: repeat(${gridCols}, minmax(0, 1fr));">
            ${effectiveQuestions.map((q) => {
              const correct = q.correctOption
              return `
                <div class="grid-q-row">
                  <span class="q-num">${q.index}</span>
                  <div class="bubble-group">
                    <span class="bubble ${showAnswerKey && correct === 'A' ? 'bubble-correct' : ''}">A</span>
                    <span class="bubble ${showAnswerKey && correct === 'B' ? 'bubble-correct' : ''}">B</span>
                    <span class="bubble ${showAnswerKey && correct === 'C' ? 'bubble-correct' : ''}">C</span>
                    <span class="bubble ${showAnswerKey && correct === 'D' ? 'bubble-correct' : ''}">D</span>
                  </div>
                </div>
              `
            }).join('')}
          </div>
        </div>
      </div>
    `
  }

  // Bảng đáp án chuẩn tóm tắt (nếu bật chế độ Hiện Đáp Án)
  let answerKeyTableHtml = ''
  if (showAnswerKey && effectiveQuestions.length > 0) {
    answerKeyTableHtml = `
      <div class="answer-key-summary">
        <div class="key-header">
          📋 BẢNG ĐÁP ÁN CHUẨN DÀNH CHO GIÁO LÝ VIÊN — MÃ ĐỀ: <strong>${examVersion}</strong> (${effectiveQuestions.length} CÂU)
        </div>
        <div class="key-grid">
          ${effectiveQuestions.map(q => `
            <div class="key-cell">
              <span class="key-q">C${q.index}:</span>
              <span class="key-ans">${q.correctOption}</span>
            </div>
          `).join('')}
        </div>
        ${options.includeExplanations && effectiveQuestions.some(q => Boolean(q.explanation)) ? `
          <div class="explanations-wrapper" style="margin-top: 8px; border-top: 1px dashed #cbd5e1; padding-top: 6px;">
            <div style="font-weight: bold; color: #1e3a8a; font-size: 10pt; margin-bottom: 4px;">💡 HƯỚNG DẪN GIẢI CHI TIẾT:</div>
            ${effectiveQuestions.filter(q => Boolean(q.explanation)).map(q => `
              <div style="font-size: 9.5pt; margin-bottom: 3px; line-height: 1.3;">
                <strong>Câu ${q.index} (${q.correctOption}):</strong> <em>${escapeHtml(q.explanation || '')}</em>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `
  }

  const styles = getExamPaperStyles(layoutColumns, includeGradingBox)

  return `<!DOCTYPE html>
<html lang="vi" xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 210mm 297mm;
      margin: 12mm 8mm 10mm 8mm;
      mso-header-margin: 0pt;
      mso-footer-margin: 0pt;
      mso-paper-source: 0;
    }
    div.Section1 {
      page: Section1;
    }
    ${styles}
  </style>
</head>
<body>
  <div class="Section1">
    <div class="exam-paper-container">
      <div class="watermark">${escapeHtml(showAnswerKey ? 'ĐÁP ÁN GIÁO VIÊN' : (parishName || 'TNTT'))}</div>
      <div class="paper-header">
        <div class="header-left">
          <div class="org-top">${escapeHtml(dioceseName)}</div>
          <div class="org-parish">${escapeHtml(parishName)}</div>
          <div>XỨ ĐOÀN THIẾU NHI THÁNH THỂ</div>
          <div>Lớp: <strong>${escapeHtml(classLabel)}</strong> · Mã đề: <strong>${examVersion}</strong></div>
        </div>
        <div class="header-right">
          <div class="exam-title">${escapeHtml(subject)}</div>
          <div class="exam-sub">Niên Khóa: ${escapeHtml(academicYear)}</div>
          <div class="exam-time">Thời gian: ${durationMinutes} phút (${effectiveQuestions.length} câu)</div>
        </div>
        <div class="header-qr-zone">
          <div class="qr-box">
            <img src="${qrDataUrl}" width="105" height="105" alt="QR" style="display: block; width: 105px; height: 105px; margin: 0 auto;" />
          </div>
          <div class="qr-label">${showAnswerKey ? 'ĐÁP ÁN GLV — KHÔNG CHẤM' : 'MÃ QUÉT TỰ ĐỘNG'}</div>
        </div>
      </div>

    <!-- Khung thông tin học sinh & Khung chấm điểm của Giáo Lý Viên -->
    ${options.includeStudentInfo !== false || includeGradingBox ? `
    <div class="top-meta-container">
      ${options.includeStudentInfo !== false ? `
      <div class="student-info-box">
        <div class="student-info-row">
          <span>Họ & tên: <strong>${student ? escapeHtml(student.name) : ''}</strong></span>
          ${!student ? '<div class="dots"></div>' : ''}
          <span>Mã TN: <strong>${student ? escapeHtml(student.code) : ''}</strong></span>
          ${!student ? '<div class="dots" style="max-width: 80px;"></div>' : ''}
        </div>
        <div class="student-info-row">
          <span>Lớp: <strong>${escapeHtml(classLabel)}</strong></span>
          <span>Phòng: <div class="dots" style="max-width: 60px;"></div></span>
          <span>Ngày thi: <div class="dots" style="max-width: 90px;"></div></span>
        </div>
      </div>` : ''}

      ${includeGradingBox ? `
        <div class="grading-box">
          <table class="grading-table">
            <thead>
              <tr>
                <th style="width: 25%;">TRẮC NGHIỆM</th>
                <th style="width: 25%;">TỰ LUẬN</th>
                <th style="width: 25%;">TỔNG ĐIỂM</th>
                <th style="width: 25%;">LỜI PHÊ</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="grade-score-cell"></td>
                <td class="grade-score-cell"></td>
                <td class="grade-score-cell"></td>
                <td class="feedback-cell"></td>
              </tr>
            </tbody>
          </table>
        </div>
      ` : ''}
    </div>` : ''}

    <!-- Bảng ma trận phiếu trả lời trắc nghiệm tích hợp (nếu bật) -->
    ${answerGridHtml}

    <!-- Nội dung câu hỏi đề thi -->
    <div class="questions-wrapper">
      ${questionsHtml}
    </div>

    ${answerKeyTableHtml}
    </div>
  </div>
</body>
</html>`
}

/** Dựng HTML in hàng loạt đề thi tích hợp cho từng học viên (mỗi em 1 đề kèm QR riêng). */
export function buildBatchExamPapersHtml(
  students: StudentSheetInfo[],
  options: ExamPaperPrintOptions
): string {
  const { layoutColumns = 2, includeGradingBox = true, subject, classLabel } = options
  const title = `Đề Thi & Phiếu Trả Lời Hàng Loạt — ${subject} (${classLabel})`
  const baseStyles = getExamPaperStyles(layoutColumns, includeGradingBox)

  // P0 Guard: Không bao giờ in hàng loạt đề thi kèm đáp án và mã QR học sinh (tránh gian lận điểm)
  if (options.showAnswerKey) {
    return buildExamPaperHtml(options)
  }

  const pagesHtml = students.map((student) => {
    const singleHtml = buildExamPaperHtml({
      ...options,
      student: { id: student.id, code: student.code, name: student.name },
    })
    // Trích xuất body content để bọc vào .batch-exam-page
    const bodyMatch = singleHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    const content = bodyMatch ? bodyMatch[1] : singleHtml
    return `<div class="batch-exam-page">${content}</div>`
  }).join('')

  return `<!DOCTYPE html><html lang="vi" xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 210mm 297mm;
      margin: 12mm 8mm 10mm 8mm;
      mso-header-margin: 0pt;
      mso-footer-margin: 0pt;
      mso-paper-source: 0;
    }
    div.Section1 {
      page: Section1;
    }
    ${baseStyles}
    @page { size: A4 portrait; margin: 0; }
    body {
      margin: 0;
      padding: 0;
      background: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .batch-exam-page {
      width: 210mm;
      min-height: 297mm;
      /* A-NEW-50: padding 0 — khớp hoàn toàn layout buildExamPaperHtml (container
         lề 7mm — QB-MARGIN 2026-08-21) để khung OMR integrated có cùng geometry
         trên cả 2 luồng in — detector hiệu chỉnh tọa độ ô theo rect đo được của
         đúng layout chuẩn này. */
      padding: 0;
      margin: 0 auto 10mm auto;
      background: #ffffff;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      page-break-after: always;
      break-after: page;
      position: relative;
    }
    @media print {
      body { background: #ffffff; }
      .batch-exam-page {
        margin: 0;
        box-shadow: none;
        width: 100vw;
        height: auto;
        padding: 0;
        page-break-after: always;
        break-after: page;
      }
    }
  </style></head><body>
    <div class="Section1">
      ${pagesHtml}
    </div>
  </body></html>`
}

/** In đề thi A4 trực tiếp qua ReportExportService */
export function printExamPaper(options: ExamPaperPrintOptions) {
  if (!options.questions || !options.questions.length) return
  const htmlContent = buildExamPaperHtml(options)
  ReportExportService.print(htmlContent)
}

/** In hàng loạt đề thi kèm phiếu chấm tích hợp theo danh sách học viên */
export function printBatchExamPapers(
  students: StudentSheetInfo[],
  options: ExamPaperPrintOptions
) {
  if (!students.length || !options.questions?.length) return
  const htmlContent = buildBatchExamPapersHtml(students, options)
  ReportExportService.print(htmlContent)
}
