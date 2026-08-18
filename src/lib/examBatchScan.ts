import { detectAnswersFromImage, detectScoreFromImage, type OmrTemplateMode } from './omr'
import { scanExamCode } from './examCodeScanner'
import { assessScanQuality, type ScanQualityAssessment } from './scanQuality'
import type { ExamAnswerVariants, ExamVersionCode, MultipleChoiceOption } from '../types'

export type BatchScanStatus = 'accepted' | 'review_required' | 'rejected'

export interface BatchScanConfig {
  sessionId: string
  examType: 'written' | 'multiple_choice'
  questionCount: number
  maxScore: number
  answerVariants: Partial<ExamAnswerVariants>
  defaultTemplateMode: Exclude<OmrTemplateMode, 'auto'>
  allowedStudentIds: ReadonlySet<string>
}

export interface BatchScanAnalysis {
  status: BatchScanStatus
  reason: string
  studentId?: string
  examVersion?: ExamVersionCode
  score?: number
  answers?: string
  scanMetadata?: string
  quality?: ScanQualityAssessment
}

/**
 * Phân tích một ảnh độc lập cho batch. Không giữ lại ImageData sau khi trả kết
 * quả và không tự lưu điểm; UI phải trình danh sách ngoại lệ rồi xác nhận batch.
 */
export function analyzeBatchExamImage(image: ImageData, config: BatchScanConfig): BatchScanAnalysis {
  const startedAt = performance.now()
  const code = scanExamCode(image)
  if (!code.payload) {
    return { status: 'rejected', reason: code.rawText ? 'Mã trên ảnh không phải mã phiếu TNTT.' : 'Không đọc được QR/Code128.' }
  }
  if (code.payload.sessionId !== config.sessionId) {
    return { status: 'rejected', reason: `Phiếu thuộc phiên khác (${code.payload.sessionId}).` }
  }
  if (!config.allowedStudentIds.has(code.payload.studentId)) {
    return { status: 'rejected', reason: 'Thiếu nhi trên phiếu không thuộc lớp của phiên chấm.', studentId: code.payload.studentId }
  }
  if (code.payload.questionCount !== undefined && code.payload.questionCount !== config.questionCount) {
    return { status: 'rejected', reason: `Phiếu có ${code.payload.questionCount} câu, phiên có ${config.questionCount} câu.`, studentId: code.payload.studentId }
  }

  const examVersion = code.payload.examVersion ?? 'A'
  const templateMode = code.payload.templateMode ?? config.defaultTemplateMode
  const answerKey = config.answerVariants[examVersion]
  if (config.examType === 'multiple_choice' && !answerKey) {
    return { status: 'rejected', reason: `Chưa cấu hình đáp án mã đề ${examVersion}.`, studentId: code.payload.studentId, examVersion }
  }

  const omr = config.examType === 'multiple_choice'
    ? detectAnswersFromImage(image, answerKey, config.questionCount, config.maxScore, templateMode)
    : detectScoreFromImage(image, config.maxScore)
  if (!omr.ok || omr.score === null) {
    return { status: 'rejected', reason: omr.reason, studentId: code.payload.studentId, examVersion }
  }
  if ('status' in omr && omr.status === 'review_required') {
    return { status: 'review_required', reason: 'Có ô tô nhiều lựa chọn hoặc quá nhạt; cần quét riêng để hiệu đính.', studentId: code.payload.studentId, examVersion }
  }

  let answers: string | undefined
  if ('questions' in omr) {
    const answerMap: Record<string, MultipleChoiceOption | null | string> = {}
    for (const question of omr.questions) answerMap[String(question.questionIndex)] = question.selectedAnswer
    answerMap._confidence = String(Math.round(omr.confidence * 100) / 100)
    answers = JSON.stringify(answerMap)
  }
  const quality = assessScanQuality(image)
  if (quality.status !== 'good') {
    return {
      status: 'review_required',
      reason: `Chất lượng ảnh cần kiểm tra: ${quality.reasons.join(', ') || quality.status}.`,
      studentId: code.payload.studentId,
      examVersion,
      quality,
    }
  }
  const scanMetadata = JSON.stringify({
    engineVersion: 'omr-v2-batch',
    protocolVersion: code.payload.protocolVersion ?? 1,
    templateMode,
    questionCount: config.examType === 'multiple_choice' ? config.questionCount : undefined,
    examVersion,
    formChecksum: code.payload.formChecksum,
    detectionStatus: 'accepted',
    quality,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
  })
  return {
    status: 'accepted',
    reason: 'Đủ điều kiện lưu',
    studentId: code.payload.studentId,
    examVersion,
    score: omr.score,
    answers,
    scanMetadata,
    quality,
  }
}
