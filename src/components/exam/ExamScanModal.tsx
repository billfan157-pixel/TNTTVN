import React, { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import {
  X,
  Camera,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Info,
  Zap,
  Upload,
  SwitchCamera,
  Image as ImageIcon,
  Flashlight,
  FlashlightOff,
  Edit3
} from 'lucide-react'
import { parseExamQrPayload } from '../../lib/qr'
import { detectScoreFromImage, detectAnswersFromImage, type OmrResult, type OmrMultipleChoiceResult } from '../../lib/omr'
import { detectBarcodeFromImageData } from '../../lib/barcode'
import { CORNER_MARKERS, QR_SIZE, QR_X, QR_Y } from '../../lib/answerSheetTemplate'
import { useExamStore } from '../../stores/examStore'
import { useStudentStore } from '../../stores/studentStore'

interface ExamScanModalProps {
  sessionId: string
  maxScore: number
  examType?: 'written' | 'multiple_choice'
  questionCount?: number
  answerKey?: Record<number, 'A' | 'B' | 'C' | 'D'>
  onClose: () => void
}

type ScanState =
  | { kind: 'scanning' }
  | { kind: 'detected'; studentId: string; omr: OmrResult | OmrMultipleChoiceResult; frame: ImageData }
  | { kind: 'error'; message: string }

interface ScannedEntry {
  studentId: string
  studentName: string
  score: number
  timestamp: number
}

/**
 * ExamScanModal — Quét phiếu trả lời tự luận & trắc nghiệm qua camera hoặc upload ảnh.
 * Tương thích cao với thiết bị di động (iOS WebKit / Android), xử lý mượt mà race condition
 * của luồng video và khung căn chỉnh phiếu A4.
 */
export const ExamScanModal: React.FC<ExamScanModalProps> = ({
  sessionId,
  maxScore,
  examType = 'written',
  questionCount = 20,
  answerKey,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const lastScanAt = useRef(0)
  const resolveRef = useRef(false)
  const liveRef = useRef(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')

  const [phase, setPhase] = useState<ScanState>({ kind: 'scanning' })
  const { saveScores, error, results } = useExamStore()
  const students = useStudentStore(s => s.students)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [scanHint, setScanHint] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [scannedList, setScannedList] = useState<ScannedEntry[]>([])
  const [cameraLoading, setCameraLoading] = useState(true)
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)

  const playFeedback = () => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(60)
      }
    } catch {
      // ignore
    }
  }

  const stopCamera = useCallback(() => {
    liveRef.current = false
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setTorchOn(false)
    setHasTorch(false)
  }, [])

  const toggleTorch = async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return
    try {
      const nextState = !torchOn
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }]
      })
      setTorchOn(nextState)
    } catch (e) {
      console.warn('Torch constraint error:', e)
    }
  }

  const handleQuickEditQuestion = (questionIndex: number, newOption: 'A' | 'B' | 'C' | 'D' | null) => {
    if (phase.kind !== 'detected' || !('questions' in phase.omr)) return
    const currentQuestions = [...phase.omr.questions]
    const qIdx = currentQuestions.findIndex(q => q.questionIndex === questionIndex)
    if (qIdx === -1) return

    const targetQ = currentQuestions[qIdx]
    const updatedOption = targetQ.selectedAnswer === newOption ? null : newOption
    const correctAnswer = targetQ.correctAnswer
    const isCorrect = updatedOption && correctAnswer ? updatedOption === correctAnswer : undefined

    currentQuestions[qIdx] = {
      ...targetQ,
      selectedAnswer: updatedOption,
      isCorrect,
      isBlank: updatedOption === null,
      isMultiFill: false,
    }

    const rawCorrectCount = currentQuestions.filter(q => q.isCorrect).length
    const totalQ = currentQuestions.length
    const scaledScore = totalQ > 0 ? Math.round((rawCorrectCount / totalQ) * maxScore * 10) / 10 : 0

    setPhase({
      ...phase,
      omr: {
        ...phase.omr,
        questions: currentQuestions,
        rawCorrectCount,
        score: scaledScore,
      }
    })
  }

  const processImageFrame = useCallback((frame: ImageData): boolean => {
    const code = jsQR(frame.data, frame.width, frame.height)
    let payload = code?.data ? parseExamQrPayload(code.data) : null

    if (!payload) {
      const barcodeText = detectBarcodeFromImageData(frame)
      if (barcodeText) {
        payload = parseExamQrPayload(barcodeText)
      }
    }

    if (payload) {
      if (payload.sessionId !== sessionId) {
        stopCamera()
        setPhase({
          kind: 'error',
          message: `Mã phiếu thuộc phiên khác (${payload.sessionId}). Vui lòng dùng đúng phiếu cho phiên "${sessionId}".`,
        })
        return true
      }

      if (!resolveRef.current) {
        const omr = examType === 'multiple_choice'
          ? detectAnswersFromImage(frame, answerKey, questionCount, maxScore)
          : detectScoreFromImage(frame, maxScore)

        if (omr.ok && omr.score !== null) {
          resolveRef.current = true
          stopCamera()
          playFeedback()
          setScanHint(null)
          setPhase({ kind: 'detected', studentId: payload.studentId, omr, frame })
          return true
        }
        setScanHint(formatOmrFailReason(omr.reason))
      }
    } else {
      setScanHint(null)
    }

    return false
  }, [sessionId, maxScore, examType, questionCount, answerKey, stopCamera])

  const loopStart = useCallback(() => {
    liveRef.current = true
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { willReadFrequently: true })
    if (!video || !canvas || !ctx) return

    const tick = () => {
      if (!liveRef.current) return
      const now = performance.now()
      if (now - lastScanAt.current > 350) {
        lastScanAt.current = now
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          const targetW = Math.min(1080, video.videoWidth)
          const targetH = Math.round((targetW * video.videoHeight) / video.videoWidth)
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW
            canvas.height = targetH
          }
          ctx.drawImage(video, 0, 0, targetW, targetH)
          const frame = ctx.getImageData(0, 0, targetW, targetH)
          const handled = processImageFrame(frame)
          if (handled) return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [processImageFrame])

  const startCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setCameraLoading(true)
    setPhase({ kind: 'scanning' })
    resolveRef.current = false
    setScanHint(null)

    // Stop existing camera stream
    stopCamera()

    try {
      let stream: MediaStream | null = null
      
      // Tier 1: Try flexible environment resolution
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
          },
          audio: false,
        })
      } catch {
        // Tier 2: Fallback without strict dimensions
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: mode },
            audio: false,
          })
        } catch {
          // Tier 3: Generic video fallback
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
        }
      }

      streamRef.current = stream

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.onloadedmetadata = async () => {
          try {
            await video.play()
            setCameraLoading(false)
            loopStart()
          } catch (playErr) {
            console.warn('Video play interrupted:', playErr)
            setCameraLoading(false)
            loopStart()
          }
        }
        // Check torch support
        try {
          const track = stream.getVideoTracks()[0]
          const capabilities = (track as any)?.getCapabilities?.()
          if (capabilities && 'torch' in capabilities) {
            setHasTorch(true)
          }
        } catch {
          // ignore
        }

        // If metadata is already loaded
        if (video.readyState >= 1) {
          try {
            await video.play()
            setCameraLoading(false)
            loopStart()
          } catch {
            setCameraLoading(false)
            loopStart()
          }
        }
      }
    } catch (err) {
      setCameraLoading(false)
      setPhase({
        kind: 'error',
        message: (err as Error)?.message || 'Không mở được camera — Vui lòng cấp quyền camera hoặc tải ảnh phiếu lên.',
      })
    }
  }, [facingMode, loopStart, stopCamera])

  // Auto-start camera on mount
  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = prev }
  }, [onClose])

  const toggleCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextMode)
    void startCamera(nextMode)
  }

  const retake = async () => {
    resolveRef.current = false
    setSaved(false)
    setSaving(false)
    setScanHint(null)
    setPhase({ kind: 'scanning' })
    await startCamera()
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    stopCamera()
    setCameraLoading(true)

    const img = new Image()
    const url = URL.createObjectURL(file)
    img.src = url

    img.onload = () => {
      URL.revokeObjectURL(url)
      const offCanvas = document.createElement('canvas')
      const MAX_SIDE = 1400
      let w = img.naturalWidth || img.width
      let h = img.naturalHeight || img.height

      if (w > MAX_SIDE || h > MAX_SIDE) {
        if (w > h) {
          h = Math.round((h * MAX_SIDE) / w)
          w = MAX_SIDE
        } else {
          w = Math.round((w * MAX_SIDE) / h)
          h = MAX_SIDE
        }
      }

      offCanvas.width = w
      offCanvas.height = h
      const ctx = offCanvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        setCameraLoading(false)
        setPhase({ kind: 'error', message: 'Không thể xử lý dữ liệu ảnh này.' })
        return
      }

      ctx.drawImage(img, 0, 0, w, h)
      const frame = ctx.getImageData(0, 0, w, h)
      setCameraLoading(false)

      const handled = processImageFrame(frame)
      if (!handled) {
        setPhase({
          kind: 'error',
          message: 'Không nhận diện được mã QR hoặc 4 góc định vị. Hãy chụp thẳng đứng, đủ sáng và bao trọn toàn bộ tờ giấy A4.',
        })
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      setCameraLoading(false)
      setPhase({ kind: 'error', message: 'Không thể đọc tệp hình ảnh được chọn.' })
    }

    // Reset input value to allow re-selection
    e.target.value = ''
  }

  const handleSave = async () => {
    if (phase.kind !== 'detected') return
    setSaving(true)
    try {
      const score = Math.min(maxScore, Math.max(0, phase.omr.score ?? 0))
      let answers: string | undefined
      if (examType === 'multiple_choice' && 'questions' in phase.omr) {
        const answerMap: Record<string, string | null> = {}
        for (const q of phase.omr.questions) {
          answerMap[String(q.questionIndex)] = q.selectedAnswer
        }
        answerMap['_confidence'] = String(Math.round(phase.omr.confidence * 100) / 100)
        answers = JSON.stringify(answerMap)
      }
      await saveScores([{ studentId: phase.studentId, score, source: 'qr_scan', answers }])

      const studentName = students.find(s => s.id === phase.studentId)?.fullName ?? phase.studentId
      setScannedList(prev => [...prev, { studentId: phase.studentId, studentName, score, timestamp: Date.now() }])
      setSaved(true)

      if (batchMode) {
        setTimeout(() => {
          resolveRef.current = false
          setSaved(false)
          setSaving(false)
          setScanHint(null)
          setPhase({ kind: 'scanning' })
          void startCamera()
        }, 600)
      } else {
        setTimeout(onClose, 1200)
      }
    } finally {
      setSaving(false)
    }
  }

  const studentName = phase.kind === 'detected'
    ? students.find(s => s.id === phase.studentId)?.fullName ?? phase.studentId
    : ''

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="exam-scan-title" className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-surface-card rounded-2xl p-4 w-full max-w-xl shadow-2xl flex flex-col gap-3 max-h-[94vh] border border-surface-border overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-surface-border">
          <h4 id="exam-scan-title" className="font-extrabold text-parish-primary flex items-center gap-2 text-base">
            <Camera size={19} /> Quét Phiếu Trả Lời
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary btn-xs sm:btn-sm flex items-center gap-1.5"
              title="Tải ảnh chụp từ máy"
            >
              <Upload size={14} /> Tải ảnh
            </button>
            <button onClick={onClose} className="btn btn-secondary btn-xs sm:btn-sm">
              <X size={14} /> Đóng
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Video & Scan Container */}
        <div className={`relative rounded-xl overflow-hidden bg-black aspect-[3/4] max-h-[52vh] flex items-center justify-center ${phase.kind === 'detected' ? 'hidden' : 'block'}`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {cameraLoading && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 size={32} className="animate-spin text-parish-primary" />
              <span className="text-xs font-semibold">Đang khởi tạo camera…</span>
            </div>
          )}

          {/* Khung A4 dùng cùng hệ toạ độ với marker phiếu rời. */}
          {!cameraLoading && phase.kind === 'scanning' && <SheetAlignmentGuide examType={examType} />}

          {/* Floating Controls inside Camera View */}
          {phase.kind === 'scanning' && !cameraLoading && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
              {hasTorch && (
                <button
                  onClick={toggleTorch}
                  className={`p-2 rounded-full backdrop-blur-sm transition-colors pointer-events-auto ${
                    torchOn ? 'bg-amber-400 text-black font-bold' : 'bg-black/50 hover:bg-black/75 text-white'
                  }`}
                  title={torchOn ? 'Tắt đèn pin' : 'Bật đèn pin trợ sáng'}
                >
                  {torchOn ? <Flashlight size={15} /> : <FlashlightOff size={15} />}
                </button>
              )}
              <button
                onClick={toggleCamera}
                className="bg-black/50 hover:bg-black/75 text-white p-2 rounded-full backdrop-blur-sm transition-colors pointer-events-auto"
                title="Đổi camera trước/sau"
              >
                <SwitchCamera size={15} />
              </button>
            </div>
          )}

          {scanHint && phase.kind === 'scanning' && (
            <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2 bg-amber-500/95 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-lg pointer-events-none z-10">
              <Info size={14} className="shrink-0" />
              <span>{scanHint}</span>
            </div>
          )}
        </div>

        {/* Kết Quả Nhận Diện (Detected State) */}
        {phase.kind === 'detected' && phase.frame && (
          <div className="flex flex-col gap-3 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-surface-border overflow-hidden relative bg-black aspect-[3/4] flex items-center justify-center">
                <img src={frameToDataUrl(phase.frame)} alt="preview đã quét" className="w-full h-full object-cover opacity-90" />
                <div className="absolute top-2 left-2 bg-emerald-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                  <CheckCircle2 size={12} /> Khung đã nhận diện
                </div>
              </div>
              <div className="flex flex-col justify-center gap-2 text-sm bg-surface-app p-3 rounded-xl border border-surface-border">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-text-muted uppercase">Học viên</span>
                  <span className="text-xs font-black text-parish-primary bg-parish-primary-light border border-parish-primary/30 px-2 py-0.5 rounded-md truncate max-w-[130px]">
                    {studentName}
                  </span>
                </div>

                <div className="flex items-baseline justify-between border-t border-surface-border pt-2">
                  <span className="text-xs font-bold text-text-muted">Điểm quy đổi:</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-emerald-500">{phase.omr.score}</span>
                    <span className="text-xs font-bold text-text-muted">/ {maxScore}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-surface-border pt-2 text-xs">
                  <span className="font-bold text-text-muted">Độ tin cậy:</span>
                  <span className={`font-black px-2 py-0.5 rounded-full ${
                    phase.omr.confidence > 0.4 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'
                  }`}>
                    {(phase.omr.confidence * 100).toFixed(0)}% ({phase.omr.confidence > 0.4 ? 'Cao 🟢' : 'Vừa 🟡'})
                  </span>
                </div>

                {(() => {
                  const existing = results.find(r => r.studentId === phase.studentId)
                  if (existing && existing.score !== phase.omr.score) {
                    return (
                      <div className="flex items-center justify-between border-t border-surface-border pt-2 text-xs">
                        <span className="font-bold text-text-muted">Điểm cũ:</span>
                        <span className="font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500">
                          {existing.score} (sẽ ghi đè)
                        </span>
                      </div>
                    )
                  }
                  return null
                })()}
              </div>
            </div>

            {/* Chi tiết trắc nghiệm */}
            {'questions' in phase.omr && phase.omr.questions.length > 0 && (
              <div className="bg-surface-app border border-surface-border rounded-xl p-2.5 sm:p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-bold text-text-main">
                  <span>Chi tiết đáp án ({phase.omr.rawCorrectCount}/{phase.omr.totalQuestions} câu đúng):</span>
                  <span className="text-[10px] text-text-muted font-normal flex items-center gap-1">
                    <Edit3 size={11} /> Nhấp ô để sửa nhanh
                  </span>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 max-h-36 sm:max-h-44 overflow-y-auto p-1.5 bg-surface-card rounded-xl border border-surface-border">
                  {phase.omr.questions.map(q => {
                    const isMultiFill = q.isMultiFill
                    const isBlank = q.isBlank
                    const bgClass = isMultiFill
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-600'
                      : isBlank
                      ? 'bg-surface-app border-surface-border text-text-muted'
                      : q.isCorrect === true
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                      : q.isCorrect === false
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-500'
                      : 'bg-surface-card border-surface-border text-text-main'
                    const title = isMultiFill
                      ? `Câu ${q.questionIndex}: Tô nhiều ô — Nhấp để chọn đáp án`
                      : isBlank
                      ? `Câu ${q.questionIndex}: Trống — Nhấp để chọn đáp án`
                      : q.correctAnswer
                      ? `Câu ${q.questionIndex}: ${q.selectedAnswer || '—'} (${q.isCorrect ? 'Đúng' : 'Sai'} — Đáp án: ${q.correctAnswer})`
                      : `Câu ${q.questionIndex}: ${q.selectedAnswer || '—'}`

                    // Cycle to next option: A -> B -> C -> D -> null -> A
                    const getNextOption = (curr: 'A' | 'B' | 'C' | 'D' | null): 'A' | 'B' | 'C' | 'D' | null => {
                      if (curr === 'A') return 'B'
                      if (curr === 'B') return 'C'
                      if (curr === 'C') return 'D'
                      if (curr === 'D') return null
                      return 'A'
                    }

                    return (
                      <button
                        type="button"
                        key={q.questionIndex}
                        onClick={() => handleQuickEditQuestion(q.questionIndex, getNextOption(q.selectedAnswer))}
                        className={`flex flex-col items-center justify-center p-1 rounded border text-[11px] font-bold cursor-pointer hover:ring-2 hover:ring-parish-primary/40 transition-all ${bgClass}`}
                        title={title}
                      >
                        <span className="text-[9px] text-text-muted">câu {q.questionIndex}</span>
                        <span className="font-black text-xs">
                          {isMultiFill ? '⚡' : isBlank ? '—' : q.selectedAnswer || '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {(() => {
                  const multiFillCount = phase.omr.questions.filter(q => q.isMultiFill).length
                  const blankCount = phase.omr.questions.filter(q => q.isBlank).length
                  if (multiFillCount === 0 && blankCount === 0) return null
                  return (
                    <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-text-muted">
                      {multiFillCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <span className="w-2 h-2 rounded-full bg-amber-500" /> {multiFillCount} câu tô nhiều ô
                        </span>
                      )}
                      {blankCount > 0 && (
                        <span className="flex items-center gap-1 text-text-muted">
                          <span className="w-2 h-2 rounded-full bg-gray-400" /> {blankCount} câu bỏ trống
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {/* Thông báo lỗi nếu có */}
        {phase.kind === 'error' && (
          <div className="rounded-xl bg-parish-warning-bg/40 border border-parish-warning/30 px-3.5 py-2.5 text-xs sm:text-sm text-parish-warning flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div className="flex flex-col gap-1">
              <span>{phase.message}</span>
              <span className="text-[11px] text-text-muted">
                Mẹo: Bạn cũng có thể dùng nút <strong>"Tải ảnh"</strong> ở trên để chọn ảnh phiếu đã chụp sẵn trong máy.
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-parish-danger-bg/40 border border-parish-danger/30 px-3.5 py-2.5 text-xs sm:text-sm text-parish-danger flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2 border-t border-surface-border pt-3">
          {phase.kind !== 'detected' ? (
            <>
              <label className="flex items-center gap-1.5 text-xs font-bold text-text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={batchMode}
                  onChange={e => setBatchMode(e.target.checked)}
                  className="w-3.5 h-3.5 accent-parish-primary rounded"
                />
                Quét liên tiếp
              </label>

              <div className="flex items-center gap-2">
                <button
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon size={14} /> Chọn Ảnh
                </button>
                {phase.kind === 'error' ? (
                  <button className="btn btn-primary btn-sm" onClick={retake}>
                    <RefreshCw size={14} /> Thử Lại
                  </button>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={onClose}>
                    Đóng
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-text-muted mr-auto">
                {saved ? 'Đã lưu' : 'Kiểm tra kỹ trước khi ghi'}
              </span>
              <div className="flex items-center gap-2">
                <button className="btn btn-secondary btn-sm" onClick={retake} disabled={saving}>
                  <RefreshCw size={14} /> Quét Lại
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => void handleSave()} disabled={saving || saved}>
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {saved ? 'Đã Lưu' : batchMode ? 'Ghi & Quét Tiếp' : 'Ghi Điểm'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Batch Mode Scanned List */}
        {batchMode && scannedList.length > 0 && (
          <div className="bg-surface-app border border-surface-border rounded-xl p-2.5 flex flex-col gap-1.5 max-h-28 overflow-y-auto">
            <span className="text-[11px] font-bold text-text-muted flex items-center gap-1">
              <Zap size={12} /> Đã quét ({scannedList.length}):
            </span>
            {scannedList.map((entry, i) => (
              <div key={`${entry.studentId}-${entry.timestamp}`} className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-text-main">{i + 1}. {entry.studentName}</span>
                <span className="font-black text-emerald-500">{entry.score}/{maxScore}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function frameToDataUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.8)
}

const OMR_FAIL_REASONS: Record<string, string> = {
  IMAGE_TOO_SMALL: 'Ảnh quá nhỏ — hãy đưa phiếu lại gần camera hơn',
  MISSING_MARKER_TL: 'Không thấy ô đen góc trên trái — căn lại 4 góc',
  MISSING_MARKER_TR: 'Không thấy ô đen góc trên phải — căn lại 4 góc',
  MISSING_MARKER_BR: 'Không thấy ô đen góc dưới phải — căn lại 4 góc',
  MISSING_MARKER_BL: 'Không thấy ô đen góc dưới trái — căn lại 4 góc',
  HOMOGRAPHY_FAILED: 'Góc chụp quá nghiêng — giữ điện thoại song song với mặt giấy',
  NO_CELL_FILLED: 'Chưa nhận diện được ô tô — hãy tô đậm chì',
  AMBIGUOUS: 'Tô chưa rõ — cần tô đậm duy nhất một ô',
  CELL_OUT_OF_IMAGE: 'Phiếu bị lệch ra ngoài khung camera',
  ALL_BLANK: 'Phiếu chưa được tô điểm',
  LOW_CONFIDENCE: 'Hình ảnh bị mờ hoặc chói sáng — chụp lại rõ hơn',
}

function formatOmrFailReason(reason: string): string {
  return OMR_FAIL_REASONS[reason] || `Đang nhận diện (${reason})…`
}

/** Overlay chỉ hướng dẫn căn ảnh. Phiếu rời dùng toạ độ SSOT của marker;
 * đề gộp có khung OMR dịch theo nội dung nên không vẽ marker cố định giả. */
const SheetAlignmentGuide: React.FC<{ examType: 'written' | 'multiple_choice' }> = ({ examType }) => (
  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-3">
    <div className="relative h-[88%] aspect-[210/297] rounded-[3%] border border-dashed border-sky-300/80 bg-sky-950/10 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]">
      <div
        className="absolute rounded border border-dashed border-sky-300/90 bg-sky-400/10"
        style={{ left: `${QR_X * 100}%`, top: `${QR_Y * 100}%`, width: `${QR_SIZE * 100}%`, height: `${QR_SIZE * 100}%` }}
      >
        <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-sky-100">QR / Barcode</span>
      </div>

      {examType === 'written' ? CORNER_MARKERS.map(marker => (
        <span
          key={marker.id}
          aria-hidden="true"
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-emerald-100 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.95)]"
          style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
        />
      )) : (
        <div className="absolute inset-x-[5%] top-[30%] bottom-[8%] rounded border border-dashed border-emerald-400/60 bg-emerald-950/10" />
      )}

      <div className="absolute inset-x-2 bottom-2 rounded-md bg-black/65 px-2 py-1.5 text-center backdrop-blur-xs">
        <p className="text-[10px] font-bold leading-tight text-white">
          {examType === 'written' ? 'Căn 4 chấm xanh vào 4 ô đen trên phiếu' : 'Giữ toàn bộ tờ A4 và 4 ô đen trong ảnh'}
        </p>
        <p className="mt-0.5 text-[9px] leading-tight text-emerald-200">
          {examType === 'written'
            ? 'Chấm xanh mô phỏng đúng vị trí marker của phiếu rời'
            : 'Đề gộp có khung OMR thay đổi theo nội dung — không căn theo marker giả'}
        </p>
      </div>
    </div>
  </div>
)
