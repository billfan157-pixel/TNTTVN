/**
 * Phase 2 (error-ownership): shared application errors sống ở domain để
 * services ↔ repositories không phải import lẫn nhau chỉ vì 1 error class.
 * Trước đây VersionConflictError nằm trong services/gradeService.ts trong khi
 * DrizzleGradeRepository (được gradeService import) cũng cần nó → cycle thật.
 * Module này PURE (zero imports) — domain giữ được dependency rule.
 */
export class VersionConflictError extends Error {
  public statusCode = 409
  public currentGrade: any
  constructor(message: string, currentGrade: any) {
    super(message)
    this.name = 'VersionConflictError'
    this.currentGrade = currentGrade
  }
}
