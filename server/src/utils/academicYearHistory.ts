import { z } from 'zod'

const score = z.number().finite().min(0).max(10).nullable()
const count = z.number().int().nonnegative()
export const finalizationPolicySchema = z.object({
  version: z.literal(1),
  capturedAt: z.string().min(1),
  gradeWeights: z.object({
    weightOral: z.number().finite().nonnegative(), weight15m: z.number().finite().nonnegative(),
    weight1Period: z.number().finite().nonnegative(), weightMidterm: z.number().finite().nonnegative(),
    weightFinal: z.number().finite().nonnegative(), roundingDecimal: z.union([z.literal(1), z.literal(2)]),
  }),
  attendancePolicy: z.object({ excusedWeight: z.number().min(0).max(1) }),
  promotionPolicy: z.object({ minGpa: z.number().min(0).max(10), minAttendance: z.number().min(0).max(100) }),
  classificationThresholds: z.object({ xuatSac: z.number(), gioi: z.number(), kha: z.number(), trungBinh: z.number() }),
  range: z.object({ startDate: z.string().min(1), endDate: z.string().min(1) }),
  // branchId was added after the initial v1 rollout. It is optional when
  // parsing legacy evidence, but branch-based historical outputs must fail
  // closed when it is absent instead of reading the mutable class row.
  classes: z.array(z.object({ id: z.string().min(1), name: z.string(), branchId: z.string().min(1).optional() })),
})
export type FinalizationPolicy = z.infer<typeof finalizationPolicySchema>

// No student/parent identity is duplicated into this immutable academic payload.
export const academicReportSnapshotSchema = z.object({
  version: z.literal(1),
  grades: z.array(z.object({
    semester: z.union([z.literal(1), z.literal(2)]),
    scoreOral: score, score15m: score, score1Period: score,
    scoreMidterm: score, scoreFinal: score, scoreDaoDuc: score.optional(), gpa: score,
  })),
  attendanceSummary: z.object({
    massPresentCount: count, massTotalCount: count,
    catechismPresentCount: count, catechismTotalCount: count,
    overallAttendanceRate: z.number().min(0).max(100),
  }),
})

export function historicalEvidenceRequired(): Error & { status: number; code: string } {
  return Object.assign(new Error('Dữ liệu lịch sử thiếu hoặc không hợp lệ. Cần đối soát bản chốt năm; không thể tính lại bằng cấu hình hiện tại.'), {
    status: 409, code: 'HISTORICAL_EVIDENCE_REQUIRED',
  })
}

export function parseHistoricalEvidence<T>(schema: z.ZodType<T>, raw: string | null | undefined): T {
  if (!raw) throw historicalEvidenceRequired()
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw historicalEvidenceRequired() }
  const result = schema.safeParse(value)
  if (!result.success) throw historicalEvidenceRequired()
  return result.data
}
