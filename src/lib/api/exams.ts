import { request, newIdempotencyKey } from './core'

// Phase 3: tách từ lib/api.ts (verbatim, chỉ đổi import core). Contract/API giữ nguyên.
export const examsApi = {
  createExam: (data: { classId: string; subject: string; scoreType: string; maxScore?: number; semester: number; academicYear?: string; examType?: string; questionCount?: number; answerKey?: string; answerVariants?: string; questions?: string; idempotencyKey?: string }) => {
    const payload = data.idempotencyKey ? data : { ...data, idempotencyKey: newIdempotencyKey() }
    return request<any>('POST', '/exams', payload, 0, undefined, true)
  },
  getExamSessionsForClass: (classId: string, params?: { subject?: string; scoreType?: string; status?: string }) => {
    const qs = new URLSearchParams()
    if (params?.subject) qs.set('subject', params.subject)
    if (params?.scoreType) qs.set('scoreType', params.scoreType)
    if (params?.status) qs.set('status', params.status)
    const q = qs.toString()
    return request<any[]>('GET', `/exams/class/${encodeURIComponent(classId)}${q ? `?${q}` : ''}`)
  },
  getMyExamSessions: () => request<any[]>('GET', '/exams/my-classes'),
  getExam: (id: string) => request<any>('GET', `/exams/${id}`),
  decodeBarcode: (barcodeText: string) =>
    request<{ sessionId: string; studentId: string; classId: string; subject: string; examType: string; maxScore: number; questionCount: number; protocolVersion?: 2 | 3; templateMode?: 'integrated' | 'full_page'; examVersion?: string; formChecksum?: string }>('POST', '/exams/barcode/decode', { barcodeText }),
  updateAnswerKey: (id: string, answerKey: string, questionCount: number) =>
    request<{ session: any; rescored: number; skipped: number }>('PATCH', `/exams/${id}/answer-key`, { answerKey, questionCount }),
  updateAnswerVariants: (id: string, answerVariants: string, questionCount: number) =>
    request<{ session: any; rescored: number; skipped: number }>('PATCH', `/exams/${id}/answer-variants`, { answerVariants, questionCount }),
  generateExamVariantManifests: (id: string, variantCount: number) =>
    request<{ session: any; manifests: unknown }>('POST', `/exams/${id}/variant-manifests`, { variantCount }),
  saveExamResults: (id: string, results: { studentId: string; score: number; essayScore?: number; source?: string; answers?: string; scanMetadata?: string; examVersion?: string; clientMutationId?: string; attemptFingerprint?: string; capturedAt?: string }[]) => {
    const capturedAt = new Date().toISOString()
    const withMutationIds = results.map(result => ({
      ...result,
      clientMutationId: result.clientMutationId || newIdempotencyKey(),
      capturedAt: result.capturedAt || capturedAt,
    }))
    // Request header enables method-aware retry; durable dedup is enforced per
    // item by clientMutationId on the server, so a lost response is safe to replay.
    const requestId = withMutationIds.length === 1
      ? withMutationIds[0].clientMutationId
      : newIdempotencyKey()
    return request<{
      saved: number
      upserted: number
      total: number
      adjustments?: Array<{ studentId: string; clientScore: number; serverScore: number }>
      items?: Array<{
        clientMutationId?: string
        studentId: string
        status: 'created' | 'updated' | 'duplicate'
        clientScore: number
        serverScore: number
      }>
    }>('POST', `/exams/${id}/results`, { results: withMutationIds }, 0, { 'Idempotency-Key': requestId })
  },
  removeExamResult: (id: string, studentId: string) => request<{ deleted: boolean }>('DELETE', `/exams/${id}/results/${encodeURIComponent(studentId)}`),
  getExamResults: (id: string) => request<{ session: any; results: any[] }>('GET', `/exams/${id}/results`),
  completeExam: (id: string) => request<any>('POST', `/exams/${id}/complete`),
  reopenExam: (id: string) => request<any>('POST', `/exams/${id}/reopen`),
  deleteExam: (id: string) => request<{ deleted: boolean; sessionId: string; resultsDeleted: number }>('DELETE', `/exams/${id}`),
}
