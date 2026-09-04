import { db, type DbExecutor } from '../db/index.js'
import { systemSettings } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { DEFAULT_GRADE_WEIGHTS, type GradeWeightsConfig } from '../utils/gradeCalculation.js'
import { DEFAULT_PROMOTION_POLICY } from '../domain/PromotionSpecifications.js'

const WEIGHT_KEYS = ['weightOral', 'weight15m', 'weight1Period', 'weightMidterm', 'weightFinal'] as const

export interface ParishAttendancePolicy {
  excusedWeight: number
  minRateForExam: number
}

export const DEFAULT_ATTENDANCE_POLICY: ParishAttendancePolicy = {
  excusedWeight: 1.0,
  minRateForExam: 80,
}

/**
 * Đọc row settings dạng raw (gradeWeights/attendancePolicy/promotionPolicy).
 * Row thiếu hoặc JSON cấu hình hỏng được xem là chưa có cấu hình và dùng
 * defaults. Lỗi query/infrastructure phải propagate để decision/write path
 * không âm thầm chạy với policy khác.
 */
async function getSystemSettings(parishId: string, executor: DbExecutor = db): Promise<Record<string, any>> {
  const [row] = await executor
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(and(eq(systemSettings.key, 'parish_system_settings'), eq(systemSettings.parishId, parishId)))
    .limit(1)

  if (!row?.value) return {}

  try {
    const parsed = JSON.parse(row.value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    // Corrupt/invalid settings JSON is an allowed business fallback. This catch
    // deliberately excludes the database query above.
  }
  return {}
}

/** 
 * ADR-047: Get current policy version ID based on the latest settings update timestamp.
 * Format: policy-settings-{parishId}-{updatedAt.toISOString()}
 * This allows tracing grade overrides and other operations back to the exact policy snapshot active at that time.
 */
export async function getCurrentPolicyVersionId(parishId: string, executor: DbExecutor = db): Promise<string | null> {
  const [row] = await executor
    .select({ updatedAt: systemSettings.updatedAt })
    .from(systemSettings)
    .where(and(eq(systemSettings.key, 'parish_system_settings'), eq(systemSettings.parishId, parishId)))
    .limit(1)

  if (row?.updatedAt) {
    const timestamp = typeof row.updatedAt === 'string' ? row.updatedAt : new Date(row.updatedAt).toISOString()
    return `policy-settings-${parishId}-${timestamp}`
  }
  return null
}

/**
 * ADR-017 (F3): Trọng số điểm của giáo xứ từ parish settings
 * ('parish_system_settings' → gradeWeights). Mọi phép tính GPA server-side
 * (promotion evaluate, report card, class summary) dùng hàm này — trước đây
 * computeWeightedGpa luôn chạy với DEFAULT_GRADE_WEIGHTS, lệch với
 * DesktopGradeMatrix (client đã đọc settings).
 */
export async function getParishGradeWeights(parishId: string, executor: DbExecutor = db): Promise<GradeWeightsConfig> {
  const parsed = await getSystemSettings(parishId, executor)
  const w = parsed?.gradeWeights
  if (w && typeof w === 'object') {
    const out: GradeWeightsConfig = { ...DEFAULT_GRADE_WEIGHTS }
    for (const key of WEIGHT_KEYS) {
      if (typeof w[key] === 'number' && !Number.isNaN(w[key])) {
        out[key] = w[key]
      }
    }
    // ADR-added: roundingDecimal cũng đọc từ settings để khớp client GPA (F4).
    if (typeof w.roundingDecimal === 'number' && !Number.isNaN(w.roundingDecimal)) {
      const rd = Math.round(w.roundingDecimal)
      out.roundingDecimal = rd >= 1 && rd <= 2 ? rd : DEFAULT_GRADE_WEIGHTS.roundingDecimal
    }
    return out
  }
  return { ...DEFAULT_GRADE_WEIGHTS }
}

/**
 * Attendance policy từ settings (excusedWeight, minRateForExam) — khớp client
 * settingsStore.attendancePolicy. Dùng để tính tỷ lệ chuyên cần có trọng số
 * giống AttendanceRateSpecification bên promotion/evaluate.
 */
export async function getParishAttendancePolicy(parishId: string, executor: DbExecutor = db): Promise<ParishAttendancePolicy> {
  const parsed = await getSystemSettings(parishId, executor)
  const a = parsed?.attendancePolicy
  if (a && typeof a === 'object') {
    const out: ParishAttendancePolicy = { ...DEFAULT_ATTENDANCE_POLICY }
    if (typeof a.excusedWeight === 'number' && !Number.isNaN(a.excusedWeight)) {
      out.excusedWeight = Math.min(Math.max(a.excusedWeight, 0), 1)
    }
    if (typeof a.minRateForExam === 'number' && !Number.isNaN(a.minRateForExam)) {
      out.minRateForExam = a.minRateForExam
    }
    return out
  }
  return { ...DEFAULT_ATTENDANCE_POLICY }
}

/**
 * Policy xét thăng tiến từ settings (minGpa/minAttendance) — khớp client
 * settings.promotionPolicy và DEFAULT_PROMOTION_POLICY domain. Trước đây
 * evaluate/approve luôn chạy DEFAULT (5.0/80) bất kể giáo xứ cấu hình → quyết
 * định lệch với PromotionPanel (client đã đọc settings).
 */
export async function getParishPromotionPolicy(parishId: string, executor: DbExecutor = db): Promise<{ minGpa: number; minAttendance: number }> {
  const parsed = await getSystemSettings(parishId, executor)
  const p = parsed?.promotionPolicy
  if (p && typeof p === 'object') {
    const out: { minGpa: number; minAttendance: number } = { ...DEFAULT_PROMOTION_POLICY }
    if (typeof p.minGpa === 'number' && !Number.isNaN(p.minGpa)) {
      out.minGpa = Math.min(Math.max(p.minGpa, 0), 10)
    }
    if (typeof p.minAttendance === 'number' && !Number.isNaN(p.minAttendance)) {
      out.minAttendance = Math.min(Math.max(p.minAttendance, 0), 100)
    }
    return out
  }
  return { ...DEFAULT_PROMOTION_POLICY }
}

export interface ClassificationThresholds {
  xuatSac: number
  gioi: number
  kha: number
  trungBinh: number
}

export const DEFAULT_CLASSIFICATION_THRESHOLDS: ClassificationThresholds = {
  xuatSac: 9.0,
  gioi: 8.0,
  kha: 6.5,
  trungBinh: 5.0,
}

/**
 * Ngưỡng xếp loại (Xuất Sắc/Giỏi/Khá/Trung Bình/Yếu) từ parish settings
 * ('parish_system_settings' → gradeWeights.*Threshold) — khớp client
 * src/utils/grades.ts DEFAULT_GRADE_WEIGHTS. Dùng cho Finalize Year snapshot.
 */
export async function getParishClassificationThresholds(parishId: string, executor: DbExecutor = db): Promise<ClassificationThresholds> {
  const parsed = await getSystemSettings(parishId, executor)
  const w = parsed?.gradeWeights
  const out: ClassificationThresholds = { ...DEFAULT_CLASSIFICATION_THRESHOLDS }
  if (w && typeof w === 'object') {
    for (const key of ['xuatSacThreshold', 'gioiThreshold', 'khaThreshold', 'trungBinhThreshold'] as const) {
      const value = w[key]
      if (typeof value === 'number' && !Number.isNaN(value)) {
        const target = key === 'xuatSacThreshold' ? 'xuatSac' : key === 'gioiThreshold' ? 'gioi' : key === 'khaThreshold' ? 'kha' : 'trungBinh'
        out[target] = Math.min(Math.max(value, 0), 10)
      }
    }
  }
  return out
}
