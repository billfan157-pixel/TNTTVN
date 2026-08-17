import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { successResponse, errorResponse } from '../utils/response.js'
import { db } from '../db/index.js'
import { systemSettings, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { generateId } from '../utils/id.js'
import { getClientIp } from '../utils/ip.js'

const settingsRouter = new Hono()
settingsRouter.use('*', authMiddleware)

export const DEFAULT_PARISH_SETTINGS = {
  gradeWeights: {
    weightOral: 1,
    weight15m: 1,
    weight1Period: 2,
    weightMidterm: 2,
    weightFinal: 3,
    xuatSacThreshold: 9.0,
    gioiThreshold: 8.0,
    khaThreshold: 6.5,
    trungBinhThreshold: 5.0,
    roundingDecimal: 1,
  },
  attendancePolicy: {
    excusedWeight: 1.0,
    minRateForExam: 80,
  },
  promotionPolicy: {
    minGpa: 5.0,
    minAttendance: 80,
  },
  // Giờ Thánh Lễ Thiếu Nhi Chúa Nhật (HH:MM) — dùng cho reminder web push/telegram
  // tự động (sundayReminderScheduler) + render template + client useSundayReminder.
  sundayMassTime: '08:00',
  academicYear: '2025-2026',
  currentSemester: 1,
}

type GradePolicyAudit = ReturnType<typeof buildGradePolicyAudit>
type ParishSettingsValue = typeof DEFAULT_PARISH_SETTINGS & { gradePolicyAudit?: GradePolicyAudit }

function calculatePolicyAverage(weights: Record<string, any>, grade = { scoreOral: 8, score15m: 8, score1Period: 8, scoreMidterm: 8, scoreFinal: 8 }) {
  const normalized = {
    weightOral: Number(weights.weightOral ?? DEFAULT_PARISH_SETTINGS.gradeWeights.weightOral),
    weight15m: Number(weights.weight15m ?? DEFAULT_PARISH_SETTINGS.gradeWeights.weight15m),
    weight1Period: Number(weights.weight1Period ?? DEFAULT_PARISH_SETTINGS.gradeWeights.weight1Period),
    weightMidterm: Number(weights.weightMidterm ?? DEFAULT_PARISH_SETTINGS.gradeWeights.weightMidterm),
    weightFinal: Number(weights.weightFinal ?? DEFAULT_PARISH_SETTINGS.gradeWeights.weightFinal),
  }

  const totalWeight = normalized.weightOral + normalized.weight15m + normalized.weight1Period + normalized.weightMidterm + normalized.weightFinal
  const totalPoints = grade.scoreOral * normalized.weightOral + grade.score15m * normalized.weight15m + grade.score1Period * normalized.weight1Period + grade.scoreMidterm * normalized.weightMidterm + grade.scoreFinal * normalized.weightFinal
  const avg = totalWeight > 0 ? totalPoints / totalWeight : 0
  const factor = Math.pow(10, Number(weights.roundingDecimal ?? DEFAULT_PARISH_SETTINGS.gradeWeights.roundingDecimal))
  const rounded = Math.round(avg * factor) / factor

  const thresholds = {
    xuatSacThreshold: Number(weights.xuatSacThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.xuatSacThreshold),
    gioiThreshold: Number(weights.gioiThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.gioiThreshold),
    khaThreshold: Number(weights.khaThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.khaThreshold),
    trungBinhThreshold: Number(weights.trungBinhThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.trungBinhThreshold),
  }

  let label = 'Yếu'
  if (rounded >= thresholds.xuatSacThreshold) label = 'Xuất Sắc'
  else if (rounded >= thresholds.gioiThreshold) label = 'Giỏi'
  else if (rounded >= thresholds.khaThreshold) label = 'Khá'
  else if (rounded >= thresholds.trungBinhThreshold) label = 'Trung Bình'

  return { score: rounded, label }
}

function buildGradePolicyAudit(currentWeights: Record<string, any>, nextWeights: Record<string, any>, actor: string, reason: string, previousVersionId?: string, recordedAt = new Date().toISOString()) {
  const previousPolicy = currentWeights ?? DEFAULT_PARISH_SETTINGS.gradeWeights
  const currentPolicy = nextWeights ?? DEFAULT_PARISH_SETTINGS.gradeWeights
  const changedFields = Object.keys(DEFAULT_PARISH_SETTINGS.gradeWeights).filter((field) => previousPolicy[field] !== currentPolicy[field])
  const before = calculatePolicyAverage(previousPolicy)
  const after = calculatePolicyAverage(currentPolicy)
  const previousVersion = previousVersionId ?? `policy-${actor}-${recordedAt}`
  const currentVersion = `policy-${actor}-${recordedAt}`

  return {
    previousPolicyVersion: previousVersion,
    currentPolicyVersion: currentVersion,
    previousSnapshot: {
      versionId: previousVersion,
      effectiveAt: recordedAt,
      weights: { ...previousPolicy },
      thresholds: {
        xuatSacThreshold: Number(previousPolicy.xuatSacThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.xuatSacThreshold),
        gioiThreshold: Number(previousPolicy.gioiThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.gioiThreshold),
        khaThreshold: Number(previousPolicy.khaThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.khaThreshold),
        trungBinhThreshold: Number(previousPolicy.trungBinhThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.trungBinhThreshold),
      },
    },
    currentSnapshot: {
      versionId: currentVersion,
      effectiveAt: recordedAt,
      weights: { ...currentPolicy },
      thresholds: {
        xuatSacThreshold: Number(currentPolicy.xuatSacThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.xuatSacThreshold),
        gioiThreshold: Number(currentPolicy.gioiThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.gioiThreshold),
        khaThreshold: Number(currentPolicy.khaThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.khaThreshold),
        trungBinhThreshold: Number(currentPolicy.trungBinhThreshold ?? DEFAULT_PARISH_SETTINGS.gradeWeights.trungBinhThreshold),
      },
    },
    changedFields,
    changed: changedFields.length > 0,
    summary: {
      changed: changedFields.length > 0,
      diffFields: changedFields,
      gpaBefore: before.score,
      gpaAfter: after.score,
      labelBefore: before.label,
      labelAfter: after.label,
      note: changedFields.length > 0 ? 'Policy changed; GPA/labels should be recalculated for the affected semester.' : 'No policy change detected.',
    },
    actor,
    action: 'policy_update',
    reason,
    recordedAt,
  }
}

let settingsCache: { data: any; timestamp: number; parishId: string } | null = null


settingsRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  
  if (settingsCache && settingsCache.parishId === user.parishId && Date.now() - settingsCache.timestamp < 60000) {
    return successResponse(c, settingsCache.data)
  }

  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(and(eq(systemSettings.key, 'parish_system_settings'), eq(systemSettings.parishId, user.parishId)))
      .limit(1)

    if (row && row.value) {
      const parsed = JSON.parse(row.value)
      const data = { ...DEFAULT_PARISH_SETTINGS, ...parsed }
      settingsCache = { data, timestamp: Date.now(), parishId: user.parishId }
      return successResponse(c, data)
    }
    settingsCache = { data: DEFAULT_PARISH_SETTINGS, timestamp: Date.now(), parishId: user.parishId }
    return successResponse(c, DEFAULT_PARISH_SETTINGS)
  } catch {
    return successResponse(c, DEFAULT_PARISH_SETTINGS)
  }
})

const updateSettingsSchema = z.object({
  gradeWeights: z.object({
    weightOral: z.number().min(0).default(1),
    weight15m: z.number().min(0).default(1),
    weight1Period: z.number().min(0).default(2),
    weightMidterm: z.number().min(0).default(2),
    weightFinal: z.number().min(0).default(3),
    xuatSacThreshold: z.number().min(0).max(10).default(9.0),
    gioiThreshold: z.number().min(0).max(10).default(8.0),
    khaThreshold: z.number().min(0).max(10).default(6.5),
    trungBinhThreshold: z.number().min(0).max(10).default(5.0),
    roundingDecimal: z.number().int().min(1).max(2).default(1),
  }).partial().optional(),
  attendancePolicy: z.object({
    excusedWeight: z.number().min(0).max(1).default(1.0),
    minRateForExam: z.number().min(0).max(100).default(80),
  }).partial().optional(),
  promotionPolicy: z.object({
    minGpa: z.number().min(0).max(10).default(5.0),
    minAttendance: z.number().min(0).max(100).default(80),
  }).partial().optional(),
  sundayMassTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'sundayMassTime phải có định dạng HH:MM').optional(),
  academicYear: z.string().optional(),
  currentSemester: z.number().int().min(1).max(2).optional(),
})

settingsRouter.put('/', roleMiddleware('admin'), zValidator('json', updateSettingsSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const payload = c.req.valid('json')

  try {
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(and(eq(systemSettings.key, 'parish_system_settings'), eq(systemSettings.parishId, user.parishId)))
      .limit(1)

    let currentVal: ParishSettingsValue = DEFAULT_PARISH_SETTINGS
    if (existing && existing.value) {
      try { currentVal = { ...DEFAULT_PARISH_SETTINGS, ...JSON.parse(existing.value) } } catch {}
    }

    const now = new Date().toISOString()
    const updatedVal = {
      ...currentVal,
      ...payload,
      gradeWeights: { ...currentVal.gradeWeights, ...payload.gradeWeights },
      attendancePolicy: { ...currentVal.attendancePolicy, ...payload.attendancePolicy },
      promotionPolicy: { ...currentVal.promotionPolicy, ...payload.promotionPolicy },
      gradePolicyAudit: buildGradePolicyAudit(
        currentVal.gradeWeights,
        { ...currentVal.gradeWeights, ...payload.gradeWeights },
        user.userId,
        payload.gradeWeights ? 'Approved policy update for grade weights and thresholds.' : 'Settings updated.',
        currentVal.gradePolicyAudit?.currentPolicyVersion,
        now,
      ),
    }

    const ip = getClientIp(c)
    const userAgent = c.req.header('user-agent') || ''

    if (existing) {
      await db
        .update(systemSettings)
        .set({
          value: JSON.stringify(updatedVal),
          updatedBy: user.userId,
          updatedAt: now,
        })
        .where(and(eq(systemSettings.key, 'parish_system_settings'), eq(systemSettings.parishId, user.parishId)))
    } else {
      await db.insert(systemSettings).values({
        key: 'parish_system_settings',
        value: JSON.stringify(updatedVal),
        description: 'Parish System Configuration',
        updatedBy: user.userId,
        updatedAt: now,
        parishId: user.parishId,
      })
    }

    await db.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: user.userId,
      action: 'UPDATE',
      entityType: 'settings',
      entityId: 'parish_system_settings',
      oldValue: JSON.stringify(currentVal),
      newValue: JSON.stringify(updatedVal),
      ip,
      userAgent,
      parishId: user.parishId,
    })

    settingsCache = null

    return successResponse(c, updatedVal)
  } catch (err: any) {
    return errorResponse(c, 'UPDATE_SETTINGS_FAILED', err.message || 'Lỗi cập nhật cấu hình hệ thống', 400)
  }
})

export default settingsRouter
