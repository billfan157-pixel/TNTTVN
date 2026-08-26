import { db } from '../db/index.js'
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

/** Đọc row settings dạng raw (gradeWeights/attendancePolicy/promotionPolicy) với fallback defaults. */
async function getSystemSettings(parishId: string): Promise<Record<string, any>> {
  try {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(and(eq(systemSettings.key, 'parish_system_settings'), eq(systemSettings.parishId, parishId)))
      .limit(1)
    if (row?.value) {
      const parsed = JSON.parse(row.value)
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch {
    // corrupt/invalid settings JSON → defaults
  }
  return {}
}

/** 
 * ADR-047: Get current policy version ID based on the latest settings update timestamp.
 * Format: policy-settings-{parishId}-{updatedAt.toISOString()}
 * This allows tracing grade overrides and other operations back to the exact policy snapshot active at that time.
 */
export async function getCurrentPolicyVersionId(parishId: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ updatedAt: systemSettings.updatedAt })
      .from(systemSettings)
      .where(and(eq(systemSettings.key, 'parish_system_settings'), eq(systemSettings.parishId, parishId)))
      .limit(1)
    
    if (row?.updatedAt) {
      const timestamp = typeof row.updatedAt === 'string' ? row.updatedAt : new Date(row.updatedAt).toISOString()
      return `policy-settings-${parishId}-${timestamp}`
    }
  } catch {
    // fallback
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
export async function getParishGradeWeights(parishId: string): Promise<GradeWeightsConfig> {
  const parsed = await getSystemSettings(parishId)
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
export async function getParishAttendancePolicy(parishId: string): Promise<ParishAttendancePolicy> {
  const parsed = await getSystemSettings(parishId)
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
export async function getParishPromotionPolicy(parishId: string): Promise<{ minGpa: number; minAttendance: number }> {
  const parsed = await getSystemSettings(parishId)
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
export async function getParishClassificationThresholds(parishId: string): Promise<ClassificationThresholds> {
  const parsed = await getSystemSettings(parishId)
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
