import type { ExamVariantManifestSet, ExamVersionCode } from '../types'
import { EXAM_VERSION_CODES } from './examVariants'

export type VersionedExamDocument = 'exam_paper' | 'question_reader' | 'answer_sheet' | 'qr_sheet'

export function readExamVariantManifest(value: ExamVariantManifestSet | string | undefined): ExamVariantManifestSet | undefined {
  try {
    const manifest = typeof value === 'string' ? JSON.parse(value) : value
    if (manifest?.schemaVersion === 1 && manifest.variants && typeof manifest.variants === 'object' && !Array.isArray(manifest.variants)) {
      return manifest as ExamVariantManifestSet
    }
  } catch {
    return undefined
  }
}

export function getManifestExamVersions(manifest: ExamVariantManifestSet | undefined): ExamVersionCode[] {
  return EXAM_VERSION_CODES.filter(code => {
    const questions = manifest?.variants[code]?.questions
    return Array.isArray(questions) && questions.length > 0
  })
}

/**
 * A-H currently describe externally shuffled papers and their detached answer
 * sheets. Until an immutable per-version question manifest exists, any document
 * that contains question content must remain version A to avoid printing the
 * same questions with a different answer key/QR label.
 */
export function resolvePrintableExamVersion(
  docType: VersionedExamDocument,
  requested: ExamVersionCode,
  available: readonly ExamVersionCode[],
  manifestVersions: readonly ExamVersionCode[] = [],
): ExamVersionCode {
  if (docType === 'exam_paper' || docType === 'question_reader') {
    return manifestVersions.includes(requested) ? requested : 'A'
  }
  if (docType === 'qr_sheet') {
    return 'A'
  }
  return available.includes(requested) ? requested : (available[0] ?? 'A')
}

export function canSelectExternalExamVersion(docType: VersionedExamDocument, hasImmutableManifest = false): boolean {
  return docType === 'answer_sheet' || (hasImmutableManifest && (docType === 'exam_paper' || docType === 'question_reader'))
}
