import { beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeBatchExamImage } from '../examBatchScan'
import { scanExamCode } from '../examCodeScanner'
import { detectAnswersFromImage } from '../omr'
import { assessScanQuality } from '../scanQuality'

vi.mock('../examCodeScanner', () => ({ scanExamCode: vi.fn() }))
vi.mock('../omr', () => ({ detectAnswersFromImage: vi.fn(), detectScoreFromImage: vi.fn() }))
vi.mock('../scanQuality', () => ({ assessScanQuality: vi.fn() }))

const image = { width: 100, height: 100, data: new Uint8ClampedArray(40_000), colorSpace: 'srgb' } as ImageData
const config = {
  sessionId: 'EXS-12345678',
  examType: 'multiple_choice' as const,
  questionCount: 2,
  maxScore: 10,
  answerVariants: { A: { 1: 'A' as const, 2: 'B' as const }, B: { 1: 'C' as const, 2: 'D' as const } },
  defaultTemplateMode: 'full_page' as const,
  allowedStudentIds: new Set(['ST-12345678']),
}

describe('batch exam scan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(scanExamCode).mockReturnValue({
      source: 'qr', rawText: 'T3', payload: { sessionId: config.sessionId, studentId: 'ST-12345678', protocolVersion: 3, templateMode: 'full_page', questionCount: 2, examVersion: 'B' },
    })
    vi.mocked(detectAnswersFromImage).mockReturnValue({
      ok: true, status: 'accepted', score: 10, rawCorrectCount: 2, totalQuestions: 2, confidence: 0.9, reason: 'OK',
      questions: [
        { questionIndex: 1, selectedAnswer: 'C', isCorrect: true, isBlank: false, isMultiFill: false, needsReview: false, isWeakMark: false, wasCorrected: false, confidence: 0.9, readings: [] },
        { questionIndex: 2, selectedAnswer: 'D', isCorrect: true, isBlank: false, isMultiFill: false, needsReview: false, isWeakMark: false, wasCorrected: false, confidence: 0.9, readings: [] },
      ],
    })
    vi.mocked(assessScanQuality).mockReturnValue({ status: 'good', meanLuma: 180, highlightRatio: 0, shadowRatio: 0, edgeEnergy: 10, reasons: [] })
  })

  it('dùng đúng đáp án mã đề từ QR và chỉ tạo payload sau khi qua quality gate', () => {
    const result = analyzeBatchExamImage(image, config)
    expect(detectAnswersFromImage).toHaveBeenCalledWith(image, config.answerVariants.B, 2, 10, 'full_page')
    expect(result).toMatchObject({ status: 'accepted', studentId: 'ST-12345678', examVersion: 'B', score: 10 })
    expect(JSON.parse(result.answers!)).toMatchObject({ 1: 'C', 2: 'D' })
  })

  it('không ghi nhận ảnh mờ/chói vào nhóm đạt', () => {
    vi.mocked(assessScanQuality).mockReturnValue({ status: 'review', meanLuma: 180, highlightRatio: 0.3, shadowRatio: 0, edgeEnergy: 10, reasons: ['GLARE'] })
    expect(analyzeBatchExamImage(image, config)).toMatchObject({ status: 'review_required', examVersion: 'B' })
  })

  it('từ chối mã đề chưa cấu hình trước khi chạy OMR', () => {
    vi.mocked(scanExamCode).mockReturnValue({ source: 'qr', rawText: 'T3', payload: { sessionId: config.sessionId, studentId: 'ST-12345678', examVersion: 'C' } })
    expect(analyzeBatchExamImage(image, config)).toMatchObject({ status: 'rejected', examVersion: 'C' })
    expect(detectAnswersFromImage).not.toHaveBeenCalled()
  })
})
