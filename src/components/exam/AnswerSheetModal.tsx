import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { generateExamQrSvg, buildExamQrPayload, getExamQrModuleCount } from '../../lib/qr'
import { generateBarcodeSvg, getBarcodeViewBoxWidth } from '../../lib/barcode'
import { CORNER_MARKERS, CORNER_SIZE, allCells, scoreToCell, mcOptionToCell, getMcColumnLayout, QR_X, QR_Y, QR_SIZE } from '../../lib/answerSheetTemplate'
import { printBatchAnswerSheets, exportAnswerSheetPdf, sanitizeSvgInner } from '../../utils/examSheets'
import { X, Printer, Layers, Settings2, CheckSquare, Square, Loader2, FileDown } from 'lucide-react'

interface AnswerSheetProps {
  sessionId: string
  student: { id: string; code: string; name: string }
  subject: string
  scoreTypeLabel: string
  classLabel: string
  maxScore: number
  examType?: 'written' | 'multiple_choice'
  questionCount?: number
}

/**
 * Phiếu trả lời 1 học viên (Phase 2 & 4): Thiết kế chuẩn A4, QR định danh + 4 marker góc
 * + Lưới ô chấm 0..maxScore HOẶC ô A/B/C/D trắc nghiệm N câu với khung viền chuyên nghiệp.
 */
export const AnswerSheet: React.FC<AnswerSheetProps> = ({
  sessionId,
  student,
  subject,
  scoreTypeLabel,
  classLabel,
  maxScore,
  examType = 'written',
  questionCount = 20,
}) => {
  const qrPayload = useMemo(() => buildExamQrPayload(sessionId, student.id), [sessionId, student.id])
  const qrInner = useMemo(() => {
    const svg = generateExamQrSvg(qrPayload, 4)
    return sanitizeSvgInner(svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''))
  }, [qrPayload])
  const qrModuleCount = useMemo(() => getExamQrModuleCount(qrPayload), [qrPayload])

  const barcodeInner = useMemo(() => {
    const svg = generateBarcodeSvg(qrPayload, 28, 1.2)
    return sanitizeSvgInner(svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''))
  }, [qrPayload])
  const barcodeViewBoxWidth = useMemo(() => getBarcodeViewBoxWidth(qrPayload, 1.2), [qrPayload])

  const cells = useMemo(() => allCells(maxScore), [maxScore])
  const layout = useMemo(() => getMcColumnLayout(questionCount), [questionCount])

  const VW = 1000
  const VH = Math.round(VW / 0.707)
  const px = (nx: number) => nx * VW
  const py = (ny: number) => ny * VH
  const markerW = px(CORNER_SIZE)
  const markerH = markerW

  return (
    <div className="bg-white shadow-sm rounded-xl overflow-hidden">
      <svg viewBox={`0 0 ${VW} ${VH}`} xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Khung viền trang trí A4 */}
        <rect x="12" y="12" width={VW - 24} height={VH - 24} rx="12" fill="none" stroke="#CBD5E1" strokeWidth="2" />
        <rect x="18" y="18" width={VW - 36} height={VH - 36} rx="8" fill="none" stroke="#94A3B8" strokeWidth="1" strokeDasharray="6 4" />

        {/* Tiêu đề Header */}
        <text x={px(0.04)} y={py(0.045)} fontSize="24" fontWeight="900" fill="#1E3A8A" letterSpacing="0.5">PHIẾU TRẢ LỜI KIỂM TRA</text>
        <text x={px(0.04)} y={py(0.075)} fontSize="15" fontWeight="700" fill="#475569">
          {subject} — {scoreTypeLabel} · Lớp: {classLabel}
        </text>

        {/* Khung thông tin học viên */}
        <rect x={px(0.04)} y={py(0.100)} width={px(0.63)} height={py(0.125)} rx="8" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1" />
        <text x={px(0.06)} y={py(0.130)} fontSize="14" fontWeight="bold" fill="#1E293B">
          Họ & Tên: <tspan fontWeight="900" fill="#1E3A8A">{student.name}</tspan>
        </text>
        <text x={px(0.06)} y={py(0.165)} fontSize="13" fontWeight="600" fill="#475569">
          Mã thiếu nhi: <tspan fontWeight="bold" fill="#0F172A">{student.code}</tspan>
        </text>
        <text x={px(0.38)} y={py(0.165)} fontSize="13" fontWeight="600" fill="#475569">
          Lớp: <tspan fontWeight="bold" fill="#0F172A">{classLabel}</tspan>
        </text>

        {/* QR Code định danh học viên (ở góc trên bên phải) */}
        <rect x={px(QR_X)} y={py(QR_Y)} width={px(QR_SIZE)} height={px(QR_SIZE)} rx="6" fill="#FFFFFF" stroke="#0F172A" strokeWidth="1.5" />
        <svg
          x={px(QR_X) + 3}
          y={py(QR_Y) + 3}
          width={px(QR_SIZE) - 6}
          height={px(QR_SIZE) - 6}
          viewBox={`0 0 ${qrModuleCount} ${qrModuleCount}`}
          dangerouslySetInnerHTML={{ __html: qrInner }}
        />
        <text x={px(QR_X) + px(QR_SIZE) / 2} y={py(QR_Y) + px(QR_SIZE) + 16} fontSize="11" fontWeight="bold" fill="#64748B" textAnchor="middle">
          MÃ QUÉT CHẤM TỰ ĐỘNG
        </text>

{/* Barcode Code128 backup — dải cuối phiếu full-width (pitch in A4 ≥ 0.19mm) */}
        <svg
          x={px(0.09)}
          y={py(0.955)}
          width={px(0.82)}
          height={28}
          viewBox={`0 0 ${barcodeViewBoxWidth} 28`}
          preserveAspectRatio="none"
          dangerouslySetInnerHTML={{ __html: barcodeInner }}
        />

        {/* Khung Hướng Dẫn Tô Ô */}
        <rect x={px(0.04)} y={py(0.235)} width={px(0.92)} height={py(0.055)} rx="6" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="1" />
        <text x={px(0.06)} y={py(0.262)} fontSize="12.5" fontWeight="800" fill="#1E40AF">HƯỚNG DẪN TÔ Ô:</text>
        <text x={px(0.21)} y={py(0.262)} fontSize="11.5" fontWeight="600" fill="#1E293B">
          {examType === 'multiple_choice'
            ? `Tô kín đậm MỘT đáp án đúng (A, B, C, D) cho từng câu (${questionCount} câu).`
            : `Tô kín đậm MỘT ô duy nhất tương ứng với điểm đạt được (0 – ${maxScore}).`}
        </text>

        {/* Visual examples — khác nhau theo examType */}
        <g transform={`translate(${px(0.68)}, ${py(0.245)})`}>
          {examType === 'multiple_choice' ? (
            <>
              <rect x="0" y="0" width="16" height="16" rx="3" fill="#0F172A" />
              <text x="22" y="13" fontSize="11" fontWeight="bold" fill="#166534">ĐÚNG</text>

              <rect x="70" y="0" width="16" height="16" rx="3" fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5" />
              <line x1="72" y1="2" x2="84" y2="14" stroke="#DC2626" strokeWidth="2" />
              <line x1="84" y1="2" x2="72" y2="14" stroke="#DC2626" strokeWidth="2" />
              <text x="92" y="13" fontSize="11" fontWeight="bold" fill="#991B1B">SAI</text>

              <rect x="130" y="0" width="16" height="16" rx="3" fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5" />
              <circle cx="138" cy="8" r="5" fill="none" stroke="#DC2626" strokeWidth="2" />
              <text x="152" y="13" fontSize="11" fontWeight="bold" fill="#991B1B">SAI</text>
            </>
          ) : (
            <>
              {/* Tự luận:示例 tô đúng điểm */}
              <rect x="0" y="0" width="16" height="16" rx="3" fill="#0F172A" />
              <text x="22" y="13" fontSize="11" fontWeight="bold" fill="#166534">TÔ ĐÚNG</text>

              <rect x="80" y="0" width="16" height="16" rx="3" fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5" />
              <text x="102" y="13" fontSize="11" fontWeight="bold" fill="#991B1B">KHÔNG TÔ</text>

              <rect x="160" y="0" width="16" height="16" rx="3" fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5" />
              <line x1="162" y1="2" x2="174" y2="14" stroke="#DC2626" strokeWidth="2" />
              <line x1="174" y1="2" x2="162" y2="14" stroke="#DC2626" strokeWidth="2" />
              <text x="182" y="13" fontSize="11" fontWeight="bold" fill="#991B1B">SAI</text>
            </>
          )}
        </g>

        {/* 4 Homography Corner Markers */}
        {CORNER_MARKERS.map(m => (
          <rect key={m.id} x={px(m.x) - markerW / 2} y={py(m.y) - markerH / 2} width={markerW} height={markerH} fill="#000000" />
        ))}

        {/* Nội dung bài làm */}
        {examType === 'multiple_choice' ? (
          <g>
            {/* Background khung cột */}
            {Array.from({ length: layout.cols }).map((_, c) => {
              const colX = px(0.05 + c * layout.colWidth) + 4
              const colW = px(layout.colWidth) - 8
              const colY = py(layout.startY) - 28
              const colH = py(layout.endY - layout.startY) + 44
              return (
                <g key={c}>
                  <rect x={colX} y={colY} width={colW} height={colH} rx="8" fill="#FAFAFA" stroke="#E2E8F0" strokeWidth="1.5" />
                  <text x={colX + colW / 2} y={colY + 18} fontSize="12" fontWeight="bold" fill="#64748B" textAnchor="middle">
                    CỘT {c + 1}
                  </text>
                </g>
              )
            })}

            {Array.from({ length: questionCount }).map((_, i) => {
              const q = i + 1
              const options: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']
              const colIndex = Math.floor((q - 1) / layout.qPerCol)
              const rowIndex = (q - 1) % layout.qPerCol
              const firstPos = mcOptionToCell(q, 'A', questionCount)
              const colX = px(0.05 + colIndex * layout.colWidth) + 4
              const colW = px(layout.colWidth) - 8
              const rowX = colX + 4
              const rowW = colW - 8
              const rowH = Math.min(32, Math.max(18, py(layout.rowPitchY) * 0.82))
              // A-NEW-50: cùng bộ sizing với buildSingleAnswerSheetSvgString
              const circleR = questionCount > 35 ? 10 : questionCount > 18 ? 11.5 : 12.5
              const fontSize = questionCount > 35 ? 9.5 : questionCount > 18 ? 10.5 : 11.5
              const labelSize = questionCount > 35 ? 10.5 : questionCount > 18 ? 11.5 : 12.5
              const labelOffset = questionCount > 35 ? 12 : questionCount > 18 ? 15 : 18

              return (
                <g key={q}>
                  {rowIndex % 2 === 1 && (
                    <rect x={rowX} y={py(firstPos.y) - rowH / 2} width={rowW} height={rowH} rx="4" fill="#F1F5F9" />
                  )}
                  {options.map(opt => {
                    const pos = mcOptionToCell(q, opt, questionCount)
                    return (
                      <g key={opt}>
                        {opt === 'A' && (
                          <text x={px(pos.x) - labelOffset} y={py(pos.y)} fontSize={labelSize} fontWeight="bold" fill="#334155" textAnchor="end" dominantBaseline="central">
                            câu {q}:
                          </text>
                        )}
                        <circle cx={px(pos.x)} cy={py(pos.y)} r={circleR} fill="#FFFFFF" stroke="#334155" strokeWidth={questionCount > 35 ? 1.6 : questionCount > 18 ? 1.8 : 2} />
                        <text x={px(pos.x)} y={py(pos.y)} fontSize={fontSize} fontWeight="bold" fill="#0F172A" textAnchor="middle" dominantBaseline="central">
                          {opt}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </g>
        ) : (
          <g>
            {/* Khung Tự Luận */}
            <rect x={px(0.08)} y={py(0.46)} width={px(0.84)} height={py(0.24)} rx="10" fill="#FAFAFA" stroke="#CBD5E1" strokeWidth="1.5" />
            <text x={px(0.50)} y={py(0.495)} fontSize="14" fontWeight="bold" fill="#334155" textAnchor="middle">
              BẢNG TÔ ĐIỂM SỐ DÀNH CHO HUYNH TRƯỞNG / GLV (0 – {maxScore})
            </text>

            {cells.map(c => {
              const pos = scoreToCell(c.score, maxScore)
              return (
                <g key={c.score}>
                  <rect x={px(pos.x) - 18} y={py(pos.y) - 18} width="36" height="36" rx="7" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2" />
                  <text x={px(pos.x)} y={py(pos.y)} fontSize="18" fontWeight="800" fill="#0F172A" textAnchor="middle" dominantBaseline="central">
                    {c.score}
                  </text>
                </g>
              )
            })}

            {/* Lời phê & Chữ ký */}
            <rect x={px(0.08)} y={py(0.73)} width={px(0.40)} height={py(0.15)} rx="8" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1" />
            <text x={px(0.10)} y={py(0.758)} fontSize="13" fontWeight="bold" fill="#475569">LỜI PHÊ CỦA GLV / GIÁM THỊ:</text>
            <line x1={px(0.10)} y1={py(0.795)} x2={px(0.46)} y2={py(0.795)} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />
            <line x1={px(0.10)} y1={py(0.830)} x2={px(0.46)} y2={py(0.830)} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />

            <rect x={px(0.52)} y={py(0.73)} width={px(0.40)} height={py(0.15)} rx="8" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1" />
            <text x={px(0.72)} y={py(0.758)} fontSize="13" fontWeight="bold" fill="#475569" textAnchor="middle">CHỮ KÝ GIÁM THỊ</text>
          </g>
        )}
      </svg>
    </div>
  )
}

interface AnswerSheetModalProps {
  sessionId: string
  students: { id: string; code: string; name: string }[]
  subject: string
  scoreTypeLabel: string
  classLabel: string
  maxScore: number
  examType?: 'written' | 'multiple_choice'
  questionCount?: number
  onClose: () => void
}

/** Modal duyệt từng phiếu hoặc in hàng loạt toàn lớp (Blob URL multi-page). */
export const AnswerSheetModal: React.FC<AnswerSheetModalProps> = ({
  sessionId,
  students,
  subject,
  scoreTypeLabel,
  classLabel,
  maxScore,
  examType: initialExamType = 'written',
  questionCount: initialQuestionCount = 20,
  onClose,
}) => {
  const [idx, setIdx] = useState(0)
  const [examType, setExamType] = useState<'written' | 'multiple_choice'>(initialExamType)
  const [questionCount, setQuestionCount] = useState<number>(initialQuestionCount)
  const [viewMode, setViewMode] = useState<'single' | 'batch'>('single')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set(students.map(s => s.id)))
  const [printing, setPrinting] = useState(false)
  const [printProgress, setPrintProgress] = useState(0)

  const current = students[idx]

  const toggleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedStudentIds.size === students.length) {
      setSelectedStudentIds(new Set())
    } else {
      setSelectedStudentIds(new Set(students.map(s => s.id)))
    }
  }

  const selectedStudentsList = useMemo(() => {
    return students.filter(s => selectedStudentIds.has(s.id))
  }, [students, selectedStudentIds])

  const handlePrintBatch = useCallback(async () => {
    if (selectedStudentsList.length === 0) return
    setPrinting(true)
    setPrintProgress(0)
    // Chunk SVG generation to keep UI responsive
    const total = selectedStudentsList.length
    const CHUNK = 5
    for (let i = 0; i < total; i += CHUNK) {
      await new Promise(r => setTimeout(r, 0))
      setPrintProgress(Math.round(((Math.min(i + CHUNK, total)) / total) * 80))
    }
    setPrintProgress(90)
    printBatchAnswerSheets(selectedStudentsList, {
      sessionId,
      subject,
      scoreTypeLabel,
      classLabel,
      maxScore,
      examType,
      questionCount,
    })
    setPrintProgress(100)
    setTimeout(() => { setPrinting(false); setPrintProgress(0) }, 800)
  }, [selectedStudentsList, sessionId, subject, scoreTypeLabel, classLabel, maxScore, examType, questionCount])

  const handlePrintSingle = useCallback(() => {
    if (!current) return
    setPrinting(true)
    setPrintProgress(50)
    printBatchAnswerSheets([current], {
      sessionId,
      subject,
      scoreTypeLabel,
      classLabel,
      maxScore,
      examType,
      questionCount,
    })
    setPrintProgress(100)
    setTimeout(() => { setPrinting(false); setPrintProgress(0) }, 800)
  }, [current, sessionId, subject, scoreTypeLabel, classLabel, maxScore, examType, questionCount])

  const handleExportPdfSingle = useCallback(() => {
    if (!current) return
    exportAnswerSheetPdf([current], {
      sessionId,
      subject,
      scoreTypeLabel,
      classLabel,
      maxScore,
      examType,
      questionCount,
    })
  }, [current, sessionId, subject, scoreTypeLabel, classLabel, maxScore, examType, questionCount])

  const handleExportPdfBatch = useCallback(() => {
    if (selectedStudentsList.length === 0) return
    exportAnswerSheetPdf(selectedStudentsList, {
      sessionId,
      subject,
      scoreTypeLabel,
      classLabel,
      maxScore,
      examType,
      questionCount,
    })
  }, [selectedStudentsList, sessionId, subject, scoreTypeLabel, classLabel, maxScore, examType, questionCount])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="answer-sheet-title" className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-card rounded-2xl p-5 w-full max-w-3xl shadow-2xl flex flex-col gap-4 max-h-[94vh] border border-surface-border" onClick={e => e.stopPropagation()}>
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-surface-border pb-3">
          <div>
            <h3 id="answer-sheet-title" className="text-lg font-black text-parish-primary flex items-center gap-2 m-0">
              <Printer className="text-parish-primary" size={20} />
              Quản Lý In Phiếu Trả Lời — {scoreTypeLabel}
            </h3>
            <p className="text-xs text-text-muted mt-1 m-0 font-medium">
              Môn: <strong className="text-text-main">{subject}</strong> · Lớp: <strong className="text-text-main">{classLabel}</strong> ({students.length} thiếu nhi)
            </p>
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm rounded-xl"><X size={16} /> Đóng</button>
        </div>

        {/* Thanh Điều Khiển Cấu Hình Phiếu */}
        <div className="bg-surface-app p-3 rounded-xl border border-surface-border flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="text-text-muted" />
            <span className="font-bold text-text-main">Hình thức:</span>
            <div className="flex bg-surface-card p-0.5 rounded-lg border border-surface-border">
              <button
                type="button"
                onClick={() => setExamType('written')}
                className={`px-3 py-1 rounded-md font-bold transition-all ${examType === 'written' ? 'bg-parish-primary text-white shadow-xs' : 'text-text-muted hover:bg-surface-hover'}`}
              >
                Tự Luận (0–10)
              </button>
              <button
                type="button"
                onClick={() => setExamType('multiple_choice')}
                className={`px-3 py-1 rounded-md font-bold transition-all ${examType === 'multiple_choice' ? 'bg-parish-primary text-white shadow-xs' : 'text-text-muted hover:bg-surface-hover'}`}
              >
                Trắc Nghiệm
              </button>
            </div>
          </div>

          {examType === 'multiple_choice' && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-text-main">Số câu hỏi:</span>
              <select
                value={questionCount}
                onChange={e => setQuestionCount(Number(e.target.value))}
                className="bg-surface-card border border-surface-border rounded-lg px-2.5 py-1 font-bold text-text-main outline-none cursor-pointer"
              >
                <option value={10}>10 câu</option>
                <option value={15}>15 câu</option>
                <option value={20}>20 câu</option>
                <option value={25}>25 câu</option>
                <option value={30}>30 câu</option>
                <option value={40}>40 câu</option>
                <option value={50}>50 câu</option>
              </select>
            </div>
          )}

          <div className="flex bg-surface-hover p-0.5 rounded-lg ml-auto border border-surface-border">
            <button
              type="button"
              onClick={() => setViewMode('single')}
              className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${viewMode === 'single' ? 'bg-surface-card text-parish-primary shadow-xs' : 'text-text-muted'}`}
            >
              Xem từng phiếu
            </button>
            <button
              type="button"
              onClick={() => setViewMode('batch')}
              className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${viewMode === 'batch' ? 'bg-surface-card text-parish-primary shadow-xs' : 'text-text-muted'}`}
            >
              In hàng loạt ({selectedStudentIds.size})
            </button>
          </div>
        </div>

        {/* Nội Dung Xem Trực Quan */}
        {viewMode === 'single' ? (
          current ? (
            <>
              <div className="overflow-y-auto rounded-xl border border-surface-border p-2 bg-surface-app max-h-[55vh]">
                <AnswerSheet
                  sessionId={sessionId}
                  student={current}
                  subject={subject}
                  scoreTypeLabel={scoreTypeLabel}
                  classLabel={classLabel}
                  maxScore={maxScore}
                  examType={examType}
                  questionCount={questionCount}
                />
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap pt-2">
                <div className="text-xs font-bold text-text-secondary">
                  {idx + 1} / {students.length} — <span className="text-parish-primary">{current.name}</span> ({current.code})
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-secondary btn-sm rounded-xl" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0 || printing}>← Trước</button>
                  <button className="btn btn-secondary btn-sm rounded-xl gap-1.5" onClick={handleExportPdfSingle} disabled={printing}>
                    <FileDown size={14} /> PDF
                  </button>
                  <button className="btn btn-primary btn-sm rounded-xl gap-1.5" onClick={handlePrintSingle} disabled={printing}>
                    {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} In Phiếu Này
                  </button>
                  <button className="btn btn-secondary btn-sm rounded-xl" onClick={() => setIdx(i => Math.min(students.length - 1, i + 1))} disabled={idx >= students.length - 1 || printing}>Sau →</button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-text-muted text-center py-10">Chưa có học viên nào trong danh sách.</p>
          )
        ) : (
          /* Chế độ Chọn Danh Sách & In Hàng Loạt */
          <div className="flex flex-col gap-3 max-h-[55vh]">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-text-main">Chọn thiếu nhi cần xuất phiếu A4 ({selectedStudentIds.size}/{students.length}):</span>
              <button onClick={toggleSelectAll} className="text-xs font-bold text-parish-primary hover:underline flex items-center gap-1">
                {selectedStudentIds.size === students.length ? <CheckSquare size={14} /> : <Square size={14} />}
                {selectedStudentIds.size === students.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            </div>
            <div className="overflow-y-auto border border-surface-border rounded-xl divide-y divide-surface-border p-1 max-h-[42vh]">
              {students.map((s, index) => {
                const checked = selectedStudentIds.has(s.id)
                return (
                  <label key={s.id} className="flex items-center gap-3 p-2.5 hover:bg-surface-hover rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectStudent(s.id)}
                      className="w-4 h-4 accent-parish-primary rounded"
                    />
                    <span className="text-xs font-bold text-text-muted w-6">{index + 1}.</span>
                    <span className="text-xs font-black text-text-main">{s.name}</span>
                    <span className="text-xs font-mono text-text-muted ml-auto">{s.code}</span>
                  </label>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              {printing && (
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-2 bg-surface-app rounded-full overflow-hidden">
                    <div
                      className="h-full bg-parish-primary rounded-full transition-all duration-300"
                      style={{ width: `${printProgress}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-text-muted whitespace-nowrap">{printProgress}%</span>
                </div>
              )}
              <button
                onClick={handleExportPdfBatch}
                disabled={selectedStudentIds.size === 0 || printing}
                className="btn btn-secondary rounded-xl gap-2 font-bold disabled:opacity-50"
              >
                <FileDown size={16} /> Xuất PDF
              </button>
              <button
                onClick={handlePrintBatch}
                disabled={selectedStudentIds.size === 0 || printing}
                className="btn btn-primary rounded-xl gap-2 font-bold disabled:opacity-50"
              >
                {printing ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
                {printing ? 'Đang in…' : `In Hàng Loạt (${selectedStudentIds.size} Phiếu A4)`}
              </button>
            </div>
          </div>
        )}

        <div className="bg-parish-primary/10 border border-parish-primary/20 rounded-xl p-2.5 text-[11px] text-parish-primary font-medium flex items-center gap-2">
          <span>💡 <strong>Hướng dẫn:</strong> Phiếu A4 chuẩn tự động chứa Mã QR cá nhân + 4 góc định vị. Phát phiếu cho thiếu nhi tô chì, sau đó mở tab <strong>"Quét Phiếu"</strong> để camera tự động ghi điểm.</span>
        </div>
      </div>
    </div>
  )
}
