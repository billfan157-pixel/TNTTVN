import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import { detectScoreFromImage, detectAnswersFromImage, type OmrResult, type OmrMultipleChoiceResult, type OmrTemplateMode } from '../../lib/omr'
import { scanExamCode } from '../../lib/examCodeScanner'
import { createManualExamIdentity, EXAM_CODE_LOCK_TTL_MS, resolveExamIdentity, type ExamCodeLock } from '../../lib/examScanIdentity'
import { advanceOmrConsensus, OMR_REQUIRED_CONFIRMATIONS, shouldAutoAnalyzeOmrFrame, type OmrConsensusState } from '../../lib/omrScanConsensus'
import { getObjectCoverSourceRect } from '../../lib/cameraFrame'
import { captureHighResolutionCameraFrame } from '../../lib/cameraStillCapture'
import { assessScanQuality, type ScanQualityAssessment } from '../../lib/scanQuality'
import { recordScanDiagnostic } from '../../lib/scanDiagnostics'
import { CORNER_MARKERS, integratedFrameAspectRatio } from '../../lib/answerSheetTemplate'
import { useExamStore } from '../../stores/examStore'
import { useStudentStore } from '../../stores/studentStore'

interface ExamScanModalProps {
  sessionId: string
  maxScore: number
  examType?: 'written' | 'multiple_choice'
  questionCount?: number
  answerKey?: Record<number, 'A' | 'B' | 'C' | 'D'>
  fixedStudent?: { id: string; name: string; code: string }
  onClose: () => void
}

type ScanState =
  | { kind: 'scanning' }
  | { kind: 'detected'; studentId: string; omr: OmrResult | OmrMultipleChoiceResult; frame: ImageData; identity: ExamCodeLock; quality: ScanQualityAssessment; templateMode: Exclude<OmrTemplateMode, 'auto'> }
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
  fixedStudent,
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
  const consecutiveNoCodeFramesRef = useRef(0)
  const codeLockRef = useRef<ExamCodeLock | null>(null)
  const latestFrameRef = useRef<ImageData | null>(null)
  const omrConsensusRef = useRef<OmrConsensusState | null>(null)
  const lastDiagnosticReasonRef = useRef('')
  const lastScanFailureRef = useRef(fixedStudent
    ? 'Chưa nhận diện được khung OMR trên phiếu.'
    : 'Không nhận diện được mã QR / Barcode trên phiếu.')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [mcTemplateMode, setMcTemplateMode] = useState<Exclude<OmrTemplateMode, 'auto'>>('integrated')

  const [phase, setPhase] = useState<ScanState>({ kind: 'scanning' })
  const { saveScores, error, results } = useExamStore()
  const students = useStudentStore(s => s.students)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [serverAdjustment, setServerAdjustment] = useState<{ clientScore: number; serverScore: number } | null>(null)
  const [scanHint, setScanHint] = useState(fixedStudent
    ? `Đã chọn ${fixedStudent.name} — căn khung OMR rồi bấm “Chụp & chấm”.`
    : 'Bước 1/2 — đưa riêng mã QR lại gần camera.')
  const [codeLocked, setCodeLocked] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [scannedList, setScannedList] = useState<ScannedEntry[]>([])
  const [cameraLoading, setCameraLoading] = useState(true)
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)

  const resetIdentity = useCallback(() => {
    codeLockRef.current = fixedStudent
      ? createManualExamIdentity(sessionId, fixedStudent.id)
      : null
    omrConsensusRef.current = null
    setCodeLocked(Boolean(fixedStudent))
  }, [fixedStudent, sessionId])

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
      isWeakMark: false,
      needsReview: false,
      wasCorrected: true,
    }

    const rawCorrectCount = currentQuestions.filter(q => q.isCorrect).length
    const totalQ = currentQuestions.length
    const scaledScore = totalQ > 0 ? Math.round((rawCorrectCount / totalQ) * maxScore * 10) / 10 : 0
    const hasSelectedAnswer = currentQuestions.some(q => q.selectedAnswer !== null)
    const hasReviewQuestion = currentQuestions.some(q => q.needsReview)

    setPhase({
      ...phase,
      omr: {
        ...phase.omr,
        status: hasReviewQuestion ? 'review_required' : hasSelectedAnswer ? 'accepted' : 'rejected',
        reason: hasReviewQuestion ? 'REVIEW_REQUIRED' : hasSelectedAnswer ? 'OK' : 'ALL_BLANK',
        questions: currentQuestions,
        rawCorrectCount,
        score: hasSelectedAnswer ? scaledScore : null,
      }
    })
  }

  const processImageFrame = useCallback((frame: ImageData, explicitCapture = false): boolean => {
    const analysisStartedAt = performance.now()
    const now = Date.now()
    const activeLock = codeLockRef.current?.expiresAt && codeLockRef.current.expiresAt > now
      ? codeLockRef.current
      : null
    // Sau khi đã đọc đúng mã, dành CPU cho OMR ở các frame kế tiếp. Khi khóa
    // hết hạn scanner sẽ đọc QR lại, tránh gán nhầm nếu người dùng đổi tờ giấy.
    const codeResult = activeLock ? null : scanExamCode(frame)
    const identity = resolveExamIdentity(activeLock, codeResult, sessionId, now)
    codeLockRef.current = identity.lock

    if (identity.kind === 'acquired') omrConsensusRef.current = null

    if (identity.kind === 'wrong_session') {
      recordScanDiagnostic({ outcome: 'rejected', reason: 'WRONG_SESSION' })
      setCodeLocked(false)
      stopCamera()
      setPhase({
        kind: 'error',
        message: `Mã phiếu thuộc phiên khác (${identity.scannedSessionId}). Vui lòng dùng đúng phiếu cho phiên "${sessionId}".`,
      })
      return true
    }

    if (identity.lock) {
      consecutiveNoCodeFramesRef.current = 0
      setCodeLocked(true)

      const effectiveTemplateMode = identity.lock.templateMode ?? mcTemplateMode
      if (identity.kind === 'acquired' && identity.lock.templateMode && identity.lock.templateMode !== mcTemplateMode) {
        setMcTemplateMode(identity.lock.templateMode)
      }
      if (
        examType === 'multiple_choice'
        && identity.lock.questionCount !== undefined
        && identity.lock.questionCount !== questionCount
      ) {
        recordScanDiagnostic({ outcome: 'rejected', reason: 'QUESTION_COUNT_MISMATCH', templateMode: effectiveTemplateMode })
        stopCamera()
        setPhase({
          kind: 'error',
          message: `Phiếu có ${identity.lock.questionCount} câu nhưng phiên hiện tại có ${questionCount} câu. Hệ thống đã chặn ghi điểm để tránh chấm nhầm mẫu.`,
        })
        return true
      }

      if (!resolveRef.current) {
        const omr = examType === 'multiple_choice'
          ? detectAnswersFromImage(frame, answerKey, questionCount, maxScore, effectiveTemplateMode)
          : detectScoreFromImage(frame, maxScore)

        if (omr.ok && omr.score !== null) {
          if (!explicitCapture && identity.lock.source !== 'manual') {
            const consensus = advanceOmrConsensus(omrConsensusRef.current, omr, now)
            omrConsensusRef.current = consensus.state
            if (!consensus.confirmed) {
              setScanHint(`Đã thấy khung OMR — giữ yên để xác nhận (${consensus.state.confirmations}/${OMR_REQUIRED_CONFIRMATIONS}).`)
              return false
            }
          }
          resolveRef.current = true
          const quality = assessScanQuality(frame)
          recordScanDiagnostic({
            outcome: 'status' in omr ? omr.status : 'accepted',
            reason: omr.reason,
            templateMode: effectiveTemplateMode,
            qualityStatus: quality.status,
            durationMs: performance.now() - analysisStartedAt,
          })
          stopCamera()
          playFeedback()
          setScanHint(identity.lock.source === 'manual'
            ? 'Đã nhận diện khung OMR — đang xác nhận kết quả…'
            : 'Đã nhận diện mã QR / Barcode — đang xác nhận phiếu…')
          setPhase({
            kind: 'detected',
            studentId: identity.lock.studentId,
            omr,
            frame,
            identity: identity.lock,
            quality,
            templateMode: effectiveTemplateMode,
          })
          return true
        }
        omrConsensusRef.current = null
        const message = identity.lock.source === 'manual'
          ? `Đã chọn ${fixedStudent?.name ?? identity.lock.studentId} — ${formatOmrFailReason(omr.reason)}`
          : `Mã phiếu đã đọc và được giữ trong ${EXAM_CODE_LOCK_TTL_MS / 1_000} giây — ${formatOmrFailReason(omr.reason)}`
        lastScanFailureRef.current = message
        if (lastDiagnosticReasonRef.current !== omr.reason) {
          lastDiagnosticReasonRef.current = omr.reason
          recordScanDiagnostic({
            outcome: 'rejected',
            reason: omr.reason,
            templateMode: effectiveTemplateMode,
            durationMs: performance.now() - analysisStartedAt,
          })
        }
        setScanHint(message)
      }
    } else {
      omrConsensusRef.current = null
      setCodeLocked(false)
      consecutiveNoCodeFramesRef.current += 1
      const message = codeResult?.rawText
        ? 'Đã đọc được mã nhưng mã này không phải mã phiếu chấm điểm TNTT.'
        : consecutiveNoCodeFramesRef.current >= 4
          ? 'Chưa đọc được mã — đưa riêng QR vào gần camera, giữ nét và tránh chói sáng.'
          : 'Bước 1/2 — đưa riêng mã QR lại gần camera.'
      lastScanFailureRef.current = message
      setScanHint(message)
    }

    return false
  }, [sessionId, maxScore, examType, questionCount, answerKey, fixedStudent, mcTemplateMode, stopCamera])

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
          const displayRect = video.getBoundingClientRect()
          const source = getObjectCoverSourceRect(
            video.videoWidth,
            video.videoHeight,
            displayRect.width || 3,
            displayRect.height || 4,
          )
          // Xử lý đúng crop portrait đang hiển thị cho user, không quét toàn bộ
          // sensor landscape. Giữ tối đa 1280px để QR còn ≥3px/module.
          const targetW = Math.min(1280, Math.max(1, Math.round(source.sw)))
          const targetH = Math.round(targetW * source.sh / source.sw)
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW
            canvas.height = targetH
          }
          ctx.drawImage(video, source.sx, source.sy, source.sw, source.sh, 0, 0, targetW, targetH)
          const frame = ctx.getImageData(0, 0, targetW, targetH)
          latestFrameRef.current = frame
          // Chế độ đã chọn học sinh không được tự suy đoán từ camera. Chỉ phân
          // tích frame khi người dùng chủ động bấm “Chụp & chấm”.
          if (shouldAutoAnalyzeOmrFrame(Boolean(fixedStudent))) {
            const handled = processImageFrame(frame)
            if (handled) return
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [fixedStudent, processImageFrame])

  const captureFixedStudentOmr = useCallback(async () => {
    if (!fixedStudent) return
    const video = videoRef.current
    const track = streamRef.current?.getVideoTracks()[0]
    const frame = video
      ? await captureHighResolutionCameraFrame(video, track) ?? latestFrameRef.current
      : latestFrameRef.current
    if (!frame) {
      setScanHint('Camera chưa sẵn sàng — chờ hình ảnh hiện rõ rồi bấm lại.')
      return
    }
    setScanHint(`Đang phân tích khung OMR của ${fixedStudent.name}…`)
    processImageFrame(frame, true)
  }, [fixedStudent, processImageFrame])

  const startCamera = useCallback(async (mode: 'environment' | 'user' = facingMode) => {
    setCameraLoading(true)
    setPhase({ kind: 'scanning' })
    resolveRef.current = false
    resetIdentity()
    latestFrameRef.current = null
    lastDiagnosticReasonRef.current = ''
    consecutiveNoCodeFramesRef.current = 0
    lastScanFailureRef.current = fixedStudent
      ? 'Chưa nhận diện được khung OMR trên phiếu.'
      : 'Không nhận diện được mã QR / Barcode trên phiếu.'
    setScanHint(fixedStudent
      ? `Đã chọn ${fixedStudent.name} — căn khung OMR rồi bấm “Chụp & chấm”.`
      : 'Bước 1/2 — đưa riêng mã QR lại gần camera.')

    // Stop existing camera stream
    stopCamera()

    try {
      let stream: MediaStream | null = null
      
      // Tier 1: Try flexible environment resolution
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
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
          const continuousCapture: Record<string, string> = {}
          for (const key of ['focusMode', 'exposureMode', 'whiteBalanceMode']) {
            if (Array.isArray(capabilities?.[key]) && capabilities[key].includes('continuous')) {
              continuousCapture[key] = 'continuous'
            }
          }
          if (Object.keys(continuousCapture).length > 0) {
            await (track as any).applyConstraints({ advanced: [continuousCapture] })
          }
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
  }, [facingMode, fixedStudent, loopStart, resetIdentity, stopCamera])

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
    resetIdentity()
    setSaved(false)
    setServerAdjustment(null)
    setSaving(false)
    consecutiveNoCodeFramesRef.current = 0
    setScanHint(fixedStudent
      ? `Đã chọn ${fixedStudent.name} — căn khung OMR rồi bấm “Chụp & chấm”.`
      : 'Bước 1/2 — đưa riêng mã QR lại gần camera.')
    setPhase({ kind: 'scanning' })
    await startCamera()
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    stopCamera()
    resetIdentity()
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

      const handled = processImageFrame(frame, true)
      if (!handled) {
        setPhase({
          kind: 'error',
          message: `${lastScanFailureRef.current} Hãy chụp thẳng đứng, đủ sáng và bao trọn toàn bộ tờ giấy A4.`,
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
    const unresolvedQuestions = 'questions' in phase.omr
      ? phase.omr.questions.filter(question => question.needsReview)
      : []
    if (unresolvedQuestions.length > 0) {
      setScanHint(`Cần xác nhận ${unresolvedQuestions.length} câu tô mơ hồ trước khi ghi điểm.`)
      return
    }
    if ('questions' in phase.omr && !phase.omr.questions.some(question => question.selectedAnswer !== null)) {
      setScanHint('Phiếu chưa có đáp án nào được tô — hệ thống không ghi điểm.')
      return
    }
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
      const correctedQuestions = 'questions' in phase.omr
        ? phase.omr.questions.filter(question => question.wasCorrected).map(question => question.questionIndex)
        : []
      const scanMetadata = JSON.stringify({
        engineVersion: 'omr-v2',
        protocolVersion: phase.identity.protocolVersion ?? 1,
        templateMode: phase.templateMode,
        questionCount: examType === 'multiple_choice' ? questionCount : undefined,
        formChecksum: phase.identity.formChecksum,
        detectionStatus: 'accepted',
        correctedQuestions,
        quality: phase.quality,
      })
      const saveResult = await saveScores([{
        studentId: phase.studentId,
        score,
        source: fixedStudent ? 'omr' : 'qr_scan',
        answers,
        scanMetadata,
      }])
      // Không được báo “Đã lưu” hoặc đóng modal khi API/offline queue từ chối.
      if (!saveResult) return

      const adjustment = saveResult.adjustments?.find(item => item.studentId === phase.studentId) ?? null
      if (adjustment) setServerAdjustment({ clientScore: adjustment.clientScore, serverScore: adjustment.serverScore })

      const studentName = students.find(s => s.id === phase.studentId)?.fullName ?? phase.studentId
      const storedScore = adjustment?.serverScore ?? score
      setScannedList(prev => [...prev, { studentId: phase.studentId, studentName, score: storedScore, timestamp: Date.now() }])
      setSaved(true)

      if (adjustment) {
        // Version drift/tampering là ngoại lệ cần người chấm nhìn thấy; không tự
        // đóng hoặc nhảy sang phiếu kế tiếp dù server đã lưu an toàn.
      } else if (batchMode) {
        setTimeout(() => {
          resolveRef.current = false
          resetIdentity()
          setSaved(false)
          setSaving(false)
          setScanHint('Bước 1/2 — đưa riêng mã QR lại gần camera.')
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

  const detectedStudent = phase.kind === 'detected' ? students.find(s => s.id === phase.studentId) : undefined
  const studentName = phase.kind === 'detected' ? detectedStudent?.fullName ?? phase.studentId : ''
  const unresolvedReviewCount = phase.kind === 'detected' && 'questions' in phase.omr
    ? phase.omr.questions.filter(question => question.needsReview).length
    : 0
  const noDetectedAnswers = phase.kind === 'detected'
    && 'questions' in phase.omr
    && !phase.omr.questions.some(question => question.selectedAnswer !== null)

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="exam-scan-title" className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="bg-surface-card rounded-2xl p-4 w-full max-w-xl shadow-2xl flex flex-col gap-3 max-h-[94vh] border border-surface-border overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-surface-border">
          <h4 id="exam-scan-title" className="font-extrabold text-parish-primary flex items-center gap-2 text-base">
            <Camera size={19} /> {fixedStudent ? `Quét OMR — ${fixedStudent.name}` : 'Quét Phiếu Trả Lời'}
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

        {examType === 'multiple_choice' && phase.kind !== 'detected' && (
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-surface-border bg-surface-app p-1" role="group" aria-label="Loại mẫu phiếu OMR">
            <button
              type="button"
              className={`min-h-9 rounded-lg px-2 text-[11px] font-black transition-colors ${mcTemplateMode === 'integrated' ? 'bg-parish-primary text-white shadow-sm' : 'text-text-muted hover:bg-surface-card'}`}
              onClick={() => {
                setMcTemplateMode('integrated')
                omrConsensusRef.current = null
                setScanHint(codeLocked ? 'Căn riêng khung đáp án nằm trên đề thi.' : 'Bước 1/2 — đưa riêng mã QR lại gần camera.')
              }}
            >
              Khung trên đề thi
            </button>
            <button
              type="button"
              className={`min-h-9 rounded-lg px-2 text-[11px] font-black transition-colors ${mcTemplateMode === 'full_page' ? 'bg-parish-primary text-white shadow-sm' : 'text-text-muted hover:bg-surface-card'}`}
              onClick={() => {
                setMcTemplateMode('full_page')
                omrConsensusRef.current = null
                setScanHint(codeLocked ? 'Giữ trọn phiếu trả lời A4 và đủ 4 ô đen trong ảnh.' : 'Bước 1/2 — đưa riêng mã QR lại gần camera.')
              }}
            >
              Phiếu trả lời A4
            </button>
          </div>
        )}

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

          {!cameraLoading && phase.kind === 'scanning' && (
            <SheetAlignmentGuide
              examType={examType}
              questionCount={questionCount}
              mcTemplateMode={mcTemplateMode}
              skipIdentityCode={Boolean(fixedStudent)}
              identityLocked={codeLocked}
            />
          )}

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
            <div className={`absolute top-2 left-3 right-24 flex items-start gap-2 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-lg pointer-events-none z-10 ${codeLocked ? 'bg-emerald-600/95' : 'bg-amber-500/95'}`}>
              <Info size={14} className="shrink-0" />
              <span className="flex flex-col gap-0.5">
                <span>{fixedStudent
                  ? `✓ Học sinh: ${fixedStudent.name} (${fixedStudent.code}) · Chờ bạn chụp`
                  : codeLocked
                    ? '✓ Bước 1/2 xong · Bước 2/2: căn khung OMR'
                    : 'Bước 1/2: quét cận cảnh QR · OMR chưa chạy'}</span>
                <span className="font-medium opacity-95">{scanHint}</span>
              </span>
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
                    {studentName}{detectedStudent?.code ? ` (${detectedStudent.code})` : ''}
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
                  <span className="font-bold text-text-muted">Độ tách nét:</span>
                  <span className={`font-black px-2 py-0.5 rounded-full ${
                    phase.omr.confidence > 0.4 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'
                  }`}>
                    {(phase.omr.confidence * 100).toFixed(0)}% · chỉ báo kỹ thuật
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-surface-border pt-2 text-xs">
                  <span className="font-bold text-text-muted">Chất lượng ảnh:</span>
                  <span className={`font-black px-2 py-0.5 rounded-full ${
                    phase.quality.status === 'good'
                      ? 'bg-emerald-500/20 text-emerald-600'
                      : 'bg-amber-500/20 text-amber-600'
                  }`}>
                    {phase.quality.status === 'good' ? 'Đạt' : 'Nên kiểm tra'}
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
                    const needsReview = q.needsReview
                    const isBlank = q.isBlank
                    const bgClass = needsReview
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
                      : q.isWeakMark
                      ? `Câu ${q.questionIndex}: Vết tô quá nhạt — Nhấp để xác nhận`
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
                          {needsReview ? '⚠' : isBlank ? '—' : q.selectedAnswer || '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {(() => {
                  const multiFillCount = phase.omr.questions.filter(q => q.isMultiFill).length
                  const weakMarkCount = phase.omr.questions.filter(q => q.isWeakMark).length
                  const blankCount = phase.omr.questions.filter(q => q.isBlank).length
                  if (multiFillCount === 0 && blankCount === 0) return null
                  return (
                    <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-text-muted">
                      {multiFillCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <span className="w-2 h-2 rounded-full bg-amber-500" /> {multiFillCount} câu tô nhiều ô
                        </span>
                      )}
                      {weakMarkCount > 0 && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <span className="w-2 h-2 rounded-full bg-amber-500" /> {weakMarkCount} câu tô quá nhạt
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
            {unresolvedReviewCount > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-700">
                Chưa thể ghi điểm: hãy nhấp và xác nhận {unresolvedReviewCount} câu có nhiều ô hoặc vết tô quá nhạt.
              </div>
            )}
            {noDetectedAnswers && unresolvedReviewCount === 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-700">
                Chưa thể ghi điểm: phiếu không còn đáp án nào được chọn.
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

        {serverAdjustment && (
          <div className="rounded-xl bg-parish-warning-bg/40 border border-parish-warning/30 px-3.5 py-2.5 text-xs sm:text-sm text-parish-warning flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Server đã tính lại điểm từ đáp án: đề xuất {serverAdjustment.clientScore} → lưu {serverAdjustment.serverScore}.
              Hãy kiểm tra đáp án/phiên bản mẫu trước khi quét tiếp.
            </span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2 border-t border-surface-border pt-3">
          {phase.kind !== 'detected' ? (
            <>
              {!fixedStudent ? <label className="flex items-center gap-1.5 text-xs font-bold text-text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={batchMode}
                  onChange={e => setBatchMode(e.target.checked)}
                  className="w-3.5 h-3.5 accent-parish-primary rounded"
                />
                Quét liên tiếp
              </label> : <span className="text-xs font-bold text-emerald-600">Không cần QR</span>}

              <div className="flex flex-wrap items-center justify-end gap-2">
                {fixedStudent && phase.kind === 'scanning' && (
                  <button
                    className="btn btn-primary btn-sm flex items-center gap-1"
                    onClick={() => void captureFixedStudentOmr()}
                  >
                    <Camera size={14} /> Chụp &amp; chấm
                  </button>
                )}
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
                <button className="btn btn-primary btn-sm" onClick={() => void handleSave()} disabled={saving || saved || unresolvedReviewCount > 0 || noDetectedAnswers}>
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
  NO_PAPER_SURFACE: 'Không thấy nền giấy hợp lệ — đưa khung đáp án trên tờ giấy vào camera',
  MISSING_MARKER_TL: 'Không thấy ô đen góc trên trái — căn lại 4 góc',
  MISSING_MARKER_TR: 'Không thấy ô đen góc trên phải — căn lại 4 góc',
  MISSING_MARKER_BR: 'Không thấy ô đen góc dưới phải — căn lại 4 góc',
  MISSING_MARKER_BL: 'Không thấy ô đen góc dưới trái — căn lại 4 góc',
  HOMOGRAPHY_FAILED: 'Góc chụp quá nghiêng — giữ điện thoại song song với mặt giấy',
  NO_CELL_FILLED: 'Chưa nhận diện được ô tô — dùng bút xanh/đen hoặc bút chì đậm',
  AMBIGUOUS: 'Tô chưa rõ — cần tô đậm duy nhất một ô',
  CELL_OUT_OF_IMAGE: 'Phiếu bị lệch ra ngoài khung camera',
  ALL_BLANK: 'Chưa thấy đáp án nào được tô — hệ thống chưa ghi điểm',
  LOW_CONFIDENCE: 'Hình ảnh bị mờ hoặc chói sáng — chụp lại rõ hơn',
}

function formatOmrFailReason(reason: string): string {
  return OMR_FAIL_REASONS[reason] || `Đang nhận diện (${reason})…`
}

/** Hướng dẫn hai pha: QR cần cận cảnh; OMR cần khung đáp án đủ lớn. */
const SheetAlignmentGuide: React.FC<{
  examType: 'written' | 'multiple_choice'
  questionCount: number
  mcTemplateMode: Exclude<OmrTemplateMode, 'auto'>
  skipIdentityCode?: boolean
  identityLocked?: boolean
}> = ({ examType, questionCount, mcTemplateMode, skipIdentityCode = false, identityLocked = false }) => {
  if (!skipIdentityCode && !identityLocked) {
    return (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
        <div className="relative w-[68%] aspect-square rounded-2xl border-2 border-dashed border-sky-300 bg-sky-950/10 shadow-[0_0_20px_rgba(125,211,252,0.25)]">
          <div className="absolute inset-x-[-12%] -bottom-20 rounded-lg bg-black/75 px-3 py-2 text-center">
            <p className="text-xs font-black text-white">Bước 1/2 · Đưa riêng mã QR vào khung</p>
            <p className="mt-1 text-[10px] text-sky-200">Giữ gần và rõ nét; đọc xong app sẽ chuyển sang căn OMR</p>
          </div>
        </div>
      </div>
    )
  }

  if (examType === 'multiple_choice' && mcTemplateMode === 'integrated') {
    const guideAspect = integratedFrameAspectRatio(questionCount)
    return (
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-3">
        <div className="relative w-[92%] rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-950/10 shadow-[0_0_18px_rgba(52,211,153,0.2)]" style={{ aspectRatio: String(guideAspect) }}>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-emerald-100">
            KHUNG ĐÁP ÁN OMR + 4 Ô ĐEN
          </span>
          <div className="absolute inset-x-0 -bottom-20 rounded-lg bg-black/75 px-3 py-2 text-center">
            <p className="text-[11px] font-black text-white">{skipIdentityCode ? 'Căn xong rồi bấm “Chụp & chấm”' : 'Bước 2/2 · Lùi camera và căn khung đáp án'}</p>
            <p className="mt-1 text-[9px] text-emerald-200">Không dùng khung lớn giả bao quanh phần câu hỏi bên dưới</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-3">
      <div className="relative h-[88%] aspect-[210/297] rounded-[3%] border border-dashed border-sky-300/80 bg-sky-950/10 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]">
        {CORNER_MARKERS.map(marker => (
          <span
            key={marker.id}
            aria-hidden="true"
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-emerald-100 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.95)]"
            style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
          />
        ))}
        <div className="absolute inset-x-2 bottom-2 rounded-md bg-black/70 px-2 py-1.5 text-center">
          <p className="text-[10px] font-bold text-white">{examType === 'multiple_choice' ? 'Giữ trọn phiếu A4 và căn đủ 4 ô đen' : 'Căn 4 chấm xanh vào 4 ô đen trên phiếu'}</p>
          <p className="mt-0.5 text-[9px] text-emerald-200">{skipIdentityCode ? 'Căn xong rồi bấm “Chụp & chấm”' : 'Bước 2/2 · Mã đã đọc, đang xác nhận OMR'}</p>
        </div>
      </div>
    </div>
  )
}
