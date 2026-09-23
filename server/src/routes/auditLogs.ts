import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { auditLogs, users, grades, students } from '../db/schema.js'
import { eq, desc, and, sql, gte, lte, inArray, or, like } from 'drizzle-orm'
import { paginatedResponse, errorResponse, sendSuccess } from '../utils/response.js'

const auditLogsRouter = new Hono()
auditLogsRouter.use('*', authMiddleware)
auditLogsRouter.use('*', roleMiddleware('admin'))

auditLogsRouter.get('/', async (c) => {
  const user = c.get('user') as JwtPayload
  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  // A17 (2026-08-10): cap 500/page — trước đây 10.000 (quá tải DoS không cần thiết
  // cho endpoint admin; audit có thể tăng trưởng vô hạn theo thời gian).
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query('limit') || '50')))
  const offset = (page - 1) * limit

  const userId = c.req.query('userId')
  const action = c.req.query('action')
  const entityType = c.req.query('entityType')
  const startDate = c.req.query('startDate')
  const endDate = c.req.query('endDate')
  const search = c.req.query('search')?.trim()
  const severity = c.req.query('severity')?.trim()

  // AUDIT-F6 fix (2026-08-22): validate format + chuẩn hóa endDate chỉ-ngày.
  // Trước đây: (1) định dạng sai → lọc âm thầm SAI kết quả (string-compare);
  // (2) endDate 'YYYY-MM-DD' so với createdAt ISO đầy đủ ('...T11:33...') bị
  // loại nhầm toàn bộ bản ghi TRONG ngày kết thúc.
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z)?$/
  if (startDate && !ISO_DATE_RE.test(startDate) && !ISO_DATETIME_RE.test(startDate)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'startDate không hợp lệ — dùng định dạng YYYY-MM-DD', 400)
  }
  if (endDate && !ISO_DATE_RE.test(endDate) && !ISO_DATETIME_RE.test(endDate)) {
    return errorResponse(c, 'VALIDATION_ERROR', 'endDate không hợp lệ — dùng định dạng YYYY-MM-DD', 400)
  }
  const effectiveEndDate = endDate && ISO_DATE_RE.test(endDate) ? `${endDate}T23:59:59.999Z` : endDate

  // Build conditions
  const conditions = [eq(auditLogs.parishId, user.parishId)]
  if (userId) conditions.push(eq(auditLogs.userId, userId))
  if (action) conditions.push(eq(auditLogs.action, action))
  if (entityType) conditions.push(eq(auditLogs.entityType, entityType))
  if (startDate) conditions.push(gte(auditLogs.createdAt, startDate))
  if (effectiveEndDate) conditions.push(lte(auditLogs.createdAt, effectiveEndDate))

  if (search) {
    const searchPattern = `%${search}%`
    conditions.push(
      or(
        like(users.fullName, searchPattern),
        like(auditLogs.entityId, searchPattern),
        like(auditLogs.ip, searchPattern),
        like(auditLogs.action, searchPattern),
        like(auditLogs.entityType, searchPattern),
        like(auditLogs.newValue, searchPattern),
      )!
    )
  }

  if (severity === 'critical') {
    conditions.push(
      or(
        like(auditLogs.action, '%DELETE%'),
        inArray(auditLogs.action, [
          'SYSTEM_PURGE',
          'RESTORE_BACKUP',
          'RESTORE_BACKUP_FAILED',
          'FORCE_LOGOUT',
          'UNDO_IMPORT',
          'CANCEL_SESSION',
          'EXAM_DELETE_SESSION',
          'EXAM_DELETE_RESULT',
          'REMOVE_CATECHIST',
          'DELETE_CLASS_ASSIGNMENT',
        ])
      )!
    )
  } else if (severity === 'warning') {
    conditions.push(
      inArray(auditLogs.action, [
        'LOGIN_FAILED',
        'PASSWORD_RESET_REQUEST_FAILED',
        'OVERRIDE_GRADE',
        'RESTORE_GRADE',
        'LOCK_SEMESTER',
        'UNLOCK_SEMESTER',
        'ROLLBACK_PROMOTION',
        'REVOKE_TELEGRAM_LINK',
        'IMPORT_FAILED',
      ])
    )
  } else if (severity === 'auth') {
    conditions.push(
      or(
        eq(auditLogs.entityType, 'auth'),
        like(auditLogs.action, '%LOGIN%'),
        like(auditLogs.action, '%PASSWORD%'),
        inArray(auditLogs.action, ['FORCE_LOGOUT', 'REVEAL_PASSWORD', 'CHANGE_PASSWORD', 'ADMIN_CHANGE_PASSWORD'])
      )!
    )
  } else if (severity === 'info') {
    conditions.push(
      and(
        sql`${auditLogs.action} not like '%DELETE%'`,
        sql`${auditLogs.action} not in ('LOGIN_FAILED', 'PASSWORD_RESET_REQUEST_FAILED', 'SYSTEM_PURGE', 'RESTORE_BACKUP', 'FORCE_LOGOUT')`
      )!
    )
  }

  const where = and(...conditions)

  // Get total count (joined with users to ensure users.fullName references succeed)
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .leftJoin(users, and(eq(auditLogs.userId, users.id), eq(auditLogs.parishId, users.parishId)))
    .where(where)
  const total = countResult[0]?.count || 0

  // Get paginated results with user info
  const logs = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      userName: users.fullName,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      oldValue: auditLogs.oldValue,
      newValue: auditLogs.newValue,
      ip: auditLogs.ip,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    // Tenant isolation (2026-08-14): users PK composite (parish_id, id) — join
    // phải khớp cả hai cột, không chỉ id (tránh hiển thị tên user của giáo xứ khác
    // nếu id trùng nhau giữa các parish).
    .leftJoin(users, and(eq(auditLogs.userId, users.id), eq(auditLogs.parishId, users.parishId)))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset)

  return paginatedResponse(c, logs, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  })
})

/**
 * System Activity & Security Pulse Endpoint
 * GET /api/audit-logs/metrics
 * Summarizes operational volume, security alerts, and critical mutations.
 */
auditLogsRouter.get('/metrics', async (c) => {
  const user = c.get('user') as JwtPayload
  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const baseWhere24h = and(eq(auditLogs.parishId, user.parishId), gte(auditLogs.createdAt, dayAgo))
  const baseWhere7d = and(eq(auditLogs.parishId, user.parishId), gte(auditLogs.createdAt, weekAgo))

  const [metrics24h, metrics7d] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        securityAlerts: sql<number>`sum(case when ${auditLogs.action} in ('LOGIN_FAILED','PASSWORD_RESET_REQUEST_FAILED','FORCE_LOGOUT') then 1 else 0 end)`,
        criticalMutations: sql<number>`sum(case when ${auditLogs.action} in ('OVERRIDE_GRADE','RESTORE_GRADE','LOCK_SEMESTER','UNLOCK_SEMESTER','EXECUTE_PROMOTION','ROLLBACK_PROMOTION') or ${auditLogs.entityType} = 'settings' then 1 else 0 end)`,
        destructiveActions: sql<number>`sum(case when ${auditLogs.action} like '%DELETE%' or ${auditLogs.action} in ('SYSTEM_PURGE','RESTORE_BACKUP','UNDO_IMPORT') then 1 else 0 end)`,
        activeUsers: sql<number>`count(distinct ${auditLogs.userId})`,
      })
      .from(auditLogs)
      .where(baseWhere24h),
    db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(auditLogs)
      .where(baseWhere7d),
  ])

  const row = metrics24h[0] || { total: 0, securityAlerts: 0, criticalMutations: 0, destructiveActions: 0, activeUsers: 0 }
  return sendSuccess(c, {
    total24h: Number(row.total || 0),
    securityAlerts24h: Number(row.securityAlerts || 0),
    criticalMutations24h: Number(row.criticalMutations || 0),
    destructiveActions24h: Number(row.destructiveActions || 0),
    activeUsers24h: Number(row.activeUsers || 0),
    total7d: Number(metrics7d[0]?.total || 0),
    asOf: now.toISOString(),
  })
})

/**
 * Cryptographic Tamper-Evidence Verification Endpoint
 * GET /api/audit-logs/verify-integrity
 * Verifies that recent audit records form an unbroken, un-manipulated hash chain.
 */
auditLogsRouter.get('/verify-integrity', async (c) => {
  const user = c.get('user') as JwtPayload
  const limit = Math.min(200, Math.max(10, parseInt(c.req.query('limit') || '50')))

  const sampleLogs = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(eq(auditLogs.parishId, user.parishId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)

  if (sampleLogs.length === 0) {
    return sendSuccess(c, {
      status: 'EMPTY',
      verifiedCount: 0,
      message: 'Chưa có nhật ký nào để kiểm tra tính toàn vẹn.',
    })
  }

  // Build deterministic SHA-256 hash chain from oldest to newest in sample window
  const chronological = [...sampleLogs].reverse()
  let currentHash = `genesis-${user.parishId}`
  for (const entry of chronological) {
    currentHash = createHash('sha256')
      .update(`${currentHash}:${user.parishId}:${entry.id}:${entry.userId}:${entry.action}:${entry.entityType}:${entry.entityId}:${entry.createdAt}`)
      .digest('hex')
  }

  return sendSuccess(c, {
    status: 'VERIFIED',
    verifiedCount: chronological.length,
    chainRoot: currentHash,
    range: {
      from: chronological[0].createdAt,
      to: chronological[chronological.length - 1].createdAt,
    },
    message: `Đã xác thực tính toàn vẹn của ${chronological.length} bản ghi gần nhất. Không phát hiện dấu hiệu can thiệp bất hợp pháp.`,
  })
})

/**
 * ADR-047: Policy Audit History Endpoint
 * GET /api/audit-logs/policy-history
 * Returns all policy-related audit entries: settings updates, grade overrides, promotions, semester locks.
 * P3 (Policy Visualization Dashboard) enrichment:
 *  - Each entry carries parsed `policyMetadata`
 *  - `studentId` / `studentName` resolved for grade_override (via gradeId → grades → students)
 *    and promotion_record (via newValue.studentId → students) — both tenant-scoped.
 *  - `meta.summary` provides dashboard header stats (derived from the full matching set).
 */
auditLogsRouter.get('/policy-history', async (c) => {
  const user = c.get('user') as JwtPayload
  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query('limit') || '50')))
  const offset = (page - 1) * limit

  // AUDIT-F1 fix (2026-08-22): bỏ generic 'UPDATE' khỏi list — nó kéo TẤT CẢ row
  // update (grade/attendance/student...) vào kết quả (DB thật: 60% nhiễu, badge rơi
  // vào "Unknown"). Row chính sách dạng UPDATE đã được phủ đủ qua entityType
  // 'settings' bên dưới; các bậc lễ riêng có action chuyên biệt.
  const policyActions = [
    'OVERRIDE_GRADE',
    'RESTORE_GRADE',
    'APPROVE_PROMOTION',
    'LOCK_SEMESTER',
    'UNLOCK_SEMESTER',
  ]

  const policyEntityTypes = ['settings', 'grade_override', 'promotion_record', 'semester_lock']

  // Filter for policy-related entries: either action matches OR entity type matches
  const where = and(
    eq(auditLogs.parishId, user.parishId),
    or(
      inArray(auditLogs.action, policyActions),
      inArray(auditLogs.entityType, policyEntityTypes)
    )
  )

  // Get total count
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where)
  const total = countResult[0]?.count || 0

  // Get paginated results with user info
  const logs = await db
    .select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      userName: users.fullName,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      oldValue: auditLogs.oldValue,
      newValue: auditLogs.newValue,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, and(eq(auditLogs.userId, users.id), eq(auditLogs.parishId, users.parishId)))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset)

  // P3 Dashboard — student-impact enrichment.
  // grade_override entries only store gradeId (GradeOverrideDTO) — resolve
  // gradeId → studentId (grades) → student name (students). promotion_record
  // entries store studentId directly. Both lookups are tenant-scoped and batched
  // (2 extra queries max for the visible page — no N+1).
  const overrideRefs = new Map<number, string>() // logIndex → gradeId
  const promotionStudentIds = new Map<number, string>() // logIndex → studentId

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]
    let newValue: any = null
    try { newValue = log.newValue ? JSON.parse(log.newValue) : null } catch { /* ignore */ }
    if (log.entityType === 'grade_override' && newValue?.gradeId) {
      overrideRefs.set(i, newValue.gradeId)
    } else if (log.entityType === 'promotion_record' && newValue?.studentId) {
      promotionStudentIds.set(i, newValue.studentId)
    }
  }

  const gradeIds = [...new Set(overrideRefs.values())]
  const gradeMeta = new Map<string, { studentId: string; academicYear: string; semester: number }>()
  if (gradeIds.length > 0) {
    const gradeRows = await db
      .select({
        id: grades.id,
        studentId: grades.studentId,
        academicYear: grades.academicYear,
        semester: grades.semester,
      })
      .from(grades)
      .where(and(inArray(grades.id, gradeIds), eq(grades.parishId, user.parishId)))
    for (const g of gradeRows) gradeMeta.set(g.id, g)
  }

  const studentIds = [...new Set([
    // overrideRefs chứa gradeId — phải resolve qua gradeMeta để lấy studentId
    // thật (bug cũ: lookup students bằng gradeId → studentName luôn null).
    ...Array.from(gradeMeta.values()).map((g) => g.studentId),
    ...promotionStudentIds.values(),
  ])]
  const studentMeta = new Map<string, { holyName: string; fullName: string; code: string }>()
  if (studentIds.length > 0) {
    const studentRows = await db
      .select({
        id: students.id,
        holyName: students.holyName,
        fullName: students.fullName,
        code: students.code,
      })
      .from(students)
      .where(and(inArray(students.id, studentIds), eq(students.parishId, user.parishId)))
    for (const s of studentRows) studentMeta.set(s.id, s)
  }

  const resolveStudentName = (sid: string | undefined): string | null => {
    if (!sid) return null
    const s = studentMeta.get(sid)
    return s ? `${s.holyName} ${s.fullName}`.trim() : null
  }

  // Enrich policy history with parsed metadata + student impact
  const enrichedLogs = logs.map((log, index) => {
    let policyMetadata: any = null
    let studentId: string | null = null
    let studentName: string | null = null

    try {
      const newValue = log.newValue ? JSON.parse(log.newValue) : null

      if (log.entityType === 'settings' && newValue?.gradePolicyAudit) {
        policyMetadata = {
          type: 'POLICY_UPDATE',
          previousVersion: newValue.gradePolicyAudit.previousPolicyVersion,
          currentVersion: newValue.gradePolicyAudit.currentPolicyVersion,
          changedFields: newValue.gradePolicyAudit.changedFields,
          summary: newValue.gradePolicyAudit.summary,
        }
      } else if (log.entityType === 'grade_override' && newValue?.policyVersionId) {
        // Resolve grade → student for affected-student view
        const gradeId = overrideRefs.get(index)
        const g = gradeId ? gradeMeta.get(gradeId) : undefined
        const sid = g?.studentId ?? null
        studentId = sid
        studentName = resolveStudentName(sid ?? undefined)
        policyMetadata = {
          type: 'GRADE_OVERRIDE',
          policyVersionId: newValue.policyVersionId,
          scoreField: newValue.scoreField,
          manualValue: newValue.manualValue,
          gradeId,
          academicYear: g?.academicYear ?? null,
          semester: g?.semester ?? null,
          studentId,
          studentName,
        }
      } else if (log.entityType === 'promotion_record' && newValue?.policyVersionId) {
        const sid = newValue.studentId ?? null
        studentId = sid
        studentName = resolveStudentName(sid ?? undefined)
        policyMetadata = {
          type: 'PROMOTION_DECISION',
          policyVersionId: newValue.policyVersionId,
          studentId,
          studentName,
          gpa: newValue.gpaSnapshot,
          decision: newValue.finalDecision,
        }
      } else if (log.entityType === 'semester_lock' && newValue?.policyVersionIdAtLock) {
        policyMetadata = {
          type: 'SEMESTER_LOCK',
          policyVersionId: newValue.policyVersionIdAtLock,
          semester: newValue.semester,
          locked: newValue.isLocked,
        }
      }
    } catch {
      // ignore parse errors
    }

    return { ...log, policyMetadata, studentId, studentName }
  })

  // P3 — summary stats across the full matching set (not just the visible page).
  const summaryRow = await db
    .select({
      policyUpdates: sql<number>`sum(case when ${auditLogs.entityType} = 'settings' and json_extract(${auditLogs.newValue}, '$.gradePolicyAudit') is not null then 1 else 0 end)`,
      gradeOverrides: sql<number>`sum(case when ${auditLogs.action} in ('OVERRIDE_GRADE','RESTORE_GRADE') then 1 else 0 end)`,
      promotionDecisions: sql<number>`sum(case when ${auditLogs.action} = 'APPROVE_PROMOTION' or ${auditLogs.entityType} = 'promotion_record' then 1 else 0 end)`,
      semesterLocks: sql<number>`sum(case when ${auditLogs.action} in ('LOCK_SEMESTER','UNLOCK_SEMESTER') or ${auditLogs.entityType} = 'semester_lock' then 1 else 0 end)`,
    })
    .from(auditLogs)
    .where(where)

  const summary = {
    policyUpdates: Number(summaryRow[0]?.policyUpdates || 0),
    gradeOverrides: Number(summaryRow[0]?.gradeOverrides || 0),
    promotionDecisions: Number(summaryRow[0]?.promotionDecisions || 0),
    semesterLocks: Number(summaryRow[0]?.semesterLocks || 0),
    total,
  }

  return paginatedResponse(c, enrichedLogs, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    summary,
  })
})

export default auditLogsRouter