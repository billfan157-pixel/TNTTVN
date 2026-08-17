import type { ScoreField } from './GradeAggregate.js'

/**
 * GRADE-ARCH-02 / GRADE-TD-03 (audit 2026-08-09): SSOT chính thức cho danh sách
 * cột điểm + ánh xạ source/updatedAt.
 *
 * Trước đây literal `SCORE_FIELDS` và bảng `sourceMapping` (`scoreOral_source →
 * scoreOralSource`) được khai báo 2 lần trong gradeService, còn repository tự
 * viết tay `${field}Source`/`${field}UpdatedAt` khi restore (P5) — 3 nguồn lặp.
 * Mọi nơi (gradeService, DrizzleGradeRepository, ...) phải derive từ đây.
 */
export const SCORE_FIELDS: readonly ScoreField[] = [
  'scoreOral',
  'score15m',
  'score1Period',
  'scoreMidterm',
  'scoreFinal',
  'scoreDaoDuc',
] as const satisfies readonly ScoreField[]

export interface ScoreFieldMeta {
  field: ScoreField
  /** Key client gửi trong payload JSON (vd: `scoreOral_source`) */
  sourceKey: string
  /** Key client gửi trong payload JSON (vd: `scoreOral_updated_at`) */
  updatedAtKey: string
  /** Cột drizzle trong bảng grades (vd: `scoreOralSource`) */
  sqlSourceColumn: string
  /** Cột drizzle trong bảng grades (vd: `scoreOralUpdatedAt`) */
  sqlUpdatedAtColumn: string
}

export const SCORE_FIELD_METAS: readonly ScoreFieldMeta[] = SCORE_FIELDS.map((field) => ({
  field,
  sourceKey: `${field}_source`,
  updatedAtKey: `${field}_updated_at`,
  sqlSourceColumn: `${field}Source`,
  sqlUpdatedAtColumn: `${field}UpdatedAt`,
}))

/** GRADE-ARCH-02: sourceMapping dùng chung cho gradeService + repository. */
export function buildSourceMapping(): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const meta of SCORE_FIELD_METAS) {
    mapping[meta.sourceKey] = meta.sqlSourceColumn
    mapping[meta.updatedAtKey] = meta.sqlUpdatedAtColumn
  }
  return mapping
}