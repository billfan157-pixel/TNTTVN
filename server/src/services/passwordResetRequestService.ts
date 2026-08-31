import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, runDbTransaction } from '../db/index.js'
import { auditLogs, passwordResetRequests, users } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { BCRYPT_COST } from '../utils/passwordPolicy.js'
import { normalizePhone, phoneMatchVariants } from '../utils/phone.js'
import { revokeAllSessionsWith } from './refreshSessionService.js'

export class PasswordResetRequestError extends Error {
  readonly code: string
  readonly status: 404 | 409

  constructor(code: string, message: string, status: 404 | 409) {
    super(message)
    this.code = code
    this.status = status
  }
}

export interface PasswordResetRequestDTO {
  id: string
  userId: string
  fullName: string
  username: string
  phone: string | null
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
  requestCount: number
  lastRequestedAt: string
}

/**
 * Tạo hoặc mở lại đúng một phiếu cho tài khoản phụ huynh. Caller luôn trả cùng
 * một thông báo dù SĐT có tồn tại hay không để không tạo account-enumeration API.
 */
export async function submitParentPasswordResetRequest(
  rawPhone: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<void> {
  const normalizedPhone = normalizePhone(rawPhone)
  const variants = phoneMatchVariants(normalizedPhone)
  if (!/^0\d{9}$/.test(normalizedPhone) || variants.length === 0) return

  const parents = await db
    .select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.parishId, parishId),
      eq(users.role, 'phuhuynh'),
      inArray(users.phone, variants),
    ))
    .limit(2)

  // SĐT trùng nhiều account là identity ambiguity: fail closed, không tự chọn
  // account đầu tiên rồi gửi Admin reset nhầm người.
  if (parents.length !== 1) return
  const parent = parents[0]

  const now = new Date().toISOString()
  await runDbTransaction(async (tx) => {
    await tx.insert(passwordResetRequests).values({
      id: generateId('PWR'),
      parishId,
      userId: parent.id,
      status: 'PENDING',
      requestCount: 1,
      lastRequestedAt: now,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [passwordResetRequests.parishId, passwordResetRequests.userId],
      set: {
        status: 'PENDING',
        requestCount: sql`${passwordResetRequests.requestCount} + 1`,
        lastRequestedAt: now,
        resolvedAt: null,
        resolvedBy: null,
        updatedAt: now,
      },
    })

    const [request] = await tx
      .select({ id: passwordResetRequests.id, requestCount: passwordResetRequests.requestCount })
      .from(passwordResetRequests)
      .where(and(
        eq(passwordResetRequests.parishId, parishId),
        eq(passwordResetRequests.userId, parent.id),
      ))
      .limit(1)

    if (request) {
      // audit_logs.user_id hiện là NOT NULL. Ở event public này, userId là subject
      // (không khẳng định người nhập SĐT đã xác thực); newValue ghi rõ actor.
      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: parent.id,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'password_reset_request',
        entityId: request.id,
        newValue: JSON.stringify({ actor: 'unauthenticated_request', requestCount: request.requestCount }),
        ip,
        userAgent,
        parishId,
      })
    }
  })
}

export async function listPendingPasswordResetRequests(parishId: string): Promise<PasswordResetRequestDTO[]> {
  const rows = await db
    .select({
      id: passwordResetRequests.id,
      userId: passwordResetRequests.userId,
      fullName: users.fullName,
      username: users.username,
      phone: users.phone,
      status: passwordResetRequests.status,
      requestCount: passwordResetRequests.requestCount,
      lastRequestedAt: passwordResetRequests.lastRequestedAt,
    })
    .from(passwordResetRequests)
    .innerJoin(users, and(
      eq(users.parishId, passwordResetRequests.parishId),
      eq(users.id, passwordResetRequests.userId),
    ))
    .where(and(
      eq(passwordResetRequests.parishId, parishId),
      eq(passwordResetRequests.status, 'PENDING'),
      eq(users.role, 'phuhuynh'),
    ))
    .orderBy(desc(passwordResetRequests.lastRequestedAt))

  return rows as PasswordResetRequestDTO[]
}

export async function resolvePasswordResetRequest(
  requestId: string,
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<{ username: string; tempPassword: string; fullName: string }> {
  const tempPassword = `Reset@${randomInt(100000, 999999)}`
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST)
  const now = new Date().toISOString()

  return runDbTransaction(async (tx) => {
    const [request] = await tx
      .select({
        id: passwordResetRequests.id,
        userId: passwordResetRequests.userId,
        status: passwordResetRequests.status,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
        tokenVersion: users.tokenVersion,
      })
      .from(passwordResetRequests)
      .innerJoin(users, and(
        eq(users.parishId, passwordResetRequests.parishId),
        eq(users.id, passwordResetRequests.userId),
      ))
      .where(and(
        eq(passwordResetRequests.id, requestId),
        eq(passwordResetRequests.parishId, parishId),
      ))
      .limit(1)

    if (!request) {
      throw new PasswordResetRequestError('REQUEST_NOT_FOUND', 'Yêu cầu không tồn tại', 404)
    }
    if (request.role !== 'phuhuynh') {
      throw new PasswordResetRequestError('INVALID_REQUEST_TARGET', 'Yêu cầu không thuộc tài khoản phụ huynh', 409)
    }
    if (request.status !== 'PENDING') {
      throw new PasswordResetRequestError('REQUEST_ALREADY_HANDLED', 'Yêu cầu đã được xử lý', 409)
    }

    // Atomic claim trước khi đổi credential: nếu hai Admin xử lý đồng thời, chỉ
    // một transaction đổi được PENDING -> RESOLVED; transaction còn lại fail.
    const claim = await tx.update(passwordResetRequests).set({
      status: 'RESOLVED',
      resolvedAt: now,
      resolvedBy: adminUserId,
      updatedAt: now,
    }).where(and(
      eq(passwordResetRequests.id, requestId),
      eq(passwordResetRequests.parishId, parishId),
      eq(passwordResetRequests.status, 'PENDING'),
    )).run()
    if (Number(claim.rowsAffected ?? 0) !== 1) {
      throw new PasswordResetRequestError('REQUEST_ALREADY_HANDLED', 'Yêu cầu đã được xử lý', 409)
    }

    const nextVersion = (request.tokenVersion || 1) + 1
    await tx.update(users).set({
      passwordHash,
      passwordEncrypted: null,
      status: 'FORCE_PASSWORD_CHANGE',
      mustChangePassword: 1,
      failedAttempts: 0,
      lockedUntil: null,
      tokenVersion: nextVersion,
    }).where(and(eq(users.id, request.userId), eq(users.parishId, parishId)))

    await revokeAllSessionsWith(tx, request.userId, parishId)

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: adminUserId,
      action: 'RESET_PASSWORD',
      entityType: 'user',
      entityId: request.userId,
      newValue: JSON.stringify({ source: 'parent_request', requestId }),
      ip,
      userAgent,
      parishId,
    })

    return { username: request.username, tempPassword, fullName: request.fullName }
  })
}

export async function dismissPasswordResetRequest(
  requestId: string,
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<void> {
  const now = new Date().toISOString()
  await runDbTransaction(async (tx) => {
    const [request] = await tx
      .select({ id: passwordResetRequests.id, userId: passwordResetRequests.userId, status: passwordResetRequests.status })
      .from(passwordResetRequests)
      .where(and(eq(passwordResetRequests.id, requestId), eq(passwordResetRequests.parishId, parishId)))
      .limit(1)

    if (!request) throw new PasswordResetRequestError('REQUEST_NOT_FOUND', 'Yêu cầu không tồn tại', 404)
    if (request.status !== 'PENDING') {
      throw new PasswordResetRequestError('REQUEST_ALREADY_HANDLED', 'Yêu cầu đã được xử lý', 409)
    }

    const claim = await tx.update(passwordResetRequests).set({
      status: 'DISMISSED',
      resolvedAt: now,
      resolvedBy: adminUserId,
      updatedAt: now,
    }).where(and(
      eq(passwordResetRequests.id, requestId),
      eq(passwordResetRequests.parishId, parishId),
      eq(passwordResetRequests.status, 'PENDING'),
    )).run()
    if (Number(claim.rowsAffected ?? 0) !== 1) {
      throw new PasswordResetRequestError('REQUEST_ALREADY_HANDLED', 'Yêu cầu đã được xử lý', 409)
    }

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: adminUserId,
      action: 'PASSWORD_RESET_REQUEST_DISMISSED',
      entityType: 'password_reset_request',
      entityId: requestId,
      newValue: JSON.stringify({ targetUserId: request.userId }),
      ip,
      userAgent,
      parishId,
    })
  })
}
