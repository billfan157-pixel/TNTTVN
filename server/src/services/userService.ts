import { randomInt } from 'node:crypto'
import { db, runDbTransaction } from '../db/index.js'
import {
  users,
  students,
  auditLogs,
  catechistAssignments,
  passwordResetRequests,
  pushSubscriptions,
  telegramLinkTokens,
  telegramLinks,
  parishPeople,
  classes,
} from '../db/schema.js'
import { eq, and, ne, inArray, isNull } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { generateId } from '../utils/id.js'
import { getSuperAdminId } from '../middleware/auth.js'
import { revokeAllSessionsWith } from './refreshSessionService.js'
import { BCRYPT_COST } from '../utils/passwordPolicy.js'
import { normalizePhone } from '../utils/phone.js'
import { buildAutoUsername, isValidVnPhone } from '../utils/username.js'

export async function getUsers(parishId: string, limit: number = 50, page: number = 1) {
  const offset = (page - 1) * limit
  const userList = await db.select().from(users).where(and(eq(users.parishId, parishId), isNull(users.deletedAt))).limit(limit).offset(offset)
  const assignments = await db.select().from(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))

  const assignmentMap = new Map<string, string[]>()
  for (const a of assignments) {
    if (!assignmentMap.has(a.userId)) assignmentMap.set(a.userId, [])
    assignmentMap.get(a.userId)!.push(a.classId)
  }

  return userList.map((u) => {
    const userClasses = assignmentMap.get(u.id) || []
    const { passwordHash: _passwordHash, passwordEncrypted: _passwordEncrypted, ...safeUser } = u
    return {
      ...safeUser,
      hasPasswordCopy: false,
      assignedClasses: userClasses,
    }
  })
}

export async function getCatechists(parishId: string) {
  const userList = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      holyName: users.holyName,
      role: users.role,
    })
    .from(users)
    .where(and(
      eq(users.parishId, parishId),
      inArray(users.role, ['admin', 'chunhiem', 'phuta']),
      isNull(users.deletedAt),
    ))
  const assignments = await db.select().from(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))
  const parishClasses = await db.select({ id: classes.id, name: classes.name }).from(classes).where(and(eq(classes.parishId, parishId), isNull(classes.deletedAt)))
  const classNames = new Map(parishClasses.map(item => [item.id, item.name]))

  const assignmentMap = new Map<string, string[]>()
  for (const a of assignments) {
    if (!assignmentMap.has(a.userId)) assignmentMap.set(a.userId, [])
    assignmentMap.get(a.userId)!.push(a.classId)
  }

  return userList.map((u) => ({
    ...u,
    assignedClasses: assignmentMap.get(u.id) || [],
    assignedClassNames: (assignmentMap.get(u.id) || []).map(classId => classNames.get(classId) || 'Lớp không còn hoạt động'),
  }))
}

export async function getUserById(id: string, parishId: string) {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt)))
    .limit(1)
  if (!u) return null
  const { passwordHash: _passwordHash, passwordEncrypted: _passwordEncrypted, ...safeUser } = u
  return { ...safeUser, hasPasswordCopy: false }
}

export interface CreateUserData {
  username?: string
  holyName?: string
  fullName: string
  phone?: string
  role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'
  assignedClasses?: string[]
}

function resolveUsername(data: CreateUserData): string {
  const override = data.username?.trim()
  if (data.role === 'phuhuynh') {
    if (override) return override
    const phone = normalizePhone(data.phone || '')
    if (!isValidVnPhone(phone)) throw Object.assign(new Error('Phụ huynh bắt buộc có số điện thoại hợp lệ để làm username đăng nhập'), { code: 'PHONE_REQUIRED' })
    return phone
  }
  if (override) return override
  const auto = buildAutoUsername(data.role, data.holyName || '', data.fullName)
  if (!auto) {
    throw Object.assign(new Error('Bắt buộc nhập Tên Thánh để hệ thống tự tạo username (ví dụ: glv_pherophanbao)'), { code: 'HOLY_NAME_REQUIRED' })
  }
  return auto
}

function isUsernameUniqueConflict(err: unknown): boolean {
  const message = String((err as { message?: unknown })?.message ?? err).toLowerCase()
  return message.includes('unique constraint failed') && message.includes('users') && message.includes('username')
}

/**
 * D3 account-creation boundary: user + catechist assignments + audit commit together.
 * A later invalid assignment must never leave a login-capable orphan account behind.
 */
export async function createUser(
  data: CreateUserData,
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<{ id: string; username: string; tempPassword: string } | null> {
  const username = resolveUsername(data)
  const [existing] = await db.select({ id: users.id }).from(users).where(and(eq(users.username, username), eq(users.parishId, parishId))).limit(1)
  if (existing) return null

  const id = generateId('USR')
  const tempPass = `Parish@${randomInt(100000, 999999)}`
  const passwordHash = await bcrypt.hash(tempPass, BCRYPT_COST)
  const now = new Date().toISOString()

  try {
    await runDbTransaction(async (tx) => {
      await tx.insert(users).values({
        id,
        username,
        passwordHash,
        passwordEncrypted: null,
        fullName: data.fullName,
        holyName: data.holyName?.trim() || null,
        phone: data.phone || null,
        role: data.role,
        status: 'FORCE_PASSWORD_CHANGE',
        tokenVersion: 1,
        failedAttempts: 0,
        mustChangePassword: 1,
        parishId,
        createdAt: now,
      })

      if (data.assignedClasses && data.assignedClasses.length > 0 && (data.role === 'chunhiem' || data.role === 'phuta')) {
        for (const classId of data.assignedClasses) {
          await tx.insert(catechistAssignments).values({
            id: generateId('ASG'),
            userId: id,
            classId,
            roleInClass: data.role === 'chunhiem' ? 'chunhiem' : 'phuta',
            parishId,
            createdAt: now,
            updatedAt: now,
            updatedBy: adminUserId,
          })
        }
      }

      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: adminUserId,
        action: 'CREATE_USER',
        entityType: 'user',
        entityId: id,
        newValue: JSON.stringify({ username, role: data.role, holyName: data.holyName?.trim() || null }),
        ip,
        userAgent,
        parishId,
      })
    })
  } catch (err) {
    // Preserve the existing 409-compatible race behavior only for the username key.
    // Other constraints (for example an invalid class assignment) must propagate so
    // callers see the failure while the transaction rolls the new user back.
    if (isUsernameUniqueConflict(err)) return null
    throw err
  }

  return { id, username, tempPassword: tempPass }
}

export async function updateUserStatus(
  id: string,
  status: 'ACTIVE' | 'LOCKED' | 'INACTIVE',
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
) {
  if (getSuperAdminId() === id) return null
  if (id === adminUserId && status !== 'ACTIVE') throw new Error('Admin cannot deactivate their own account')

  return runDbTransaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt))).limit(1)
    if (!existing) return null

    if (status === 'LOCKED' || status === 'INACTIVE') {
      const nextVersion = (existing.tokenVersion || 1) + 1
      await tx.update(users).set({ status, tokenVersion: nextVersion }).where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt)))
      await revokeAllSessionsWith(tx, id, parishId)
      await tx.insert(auditLogs).values({
        id: generateId('AUD'),
        userId: adminUserId,
        action: 'UPDATE_USER_STATUS',
        entityType: 'user',
        entityId: id,
        oldValue: JSON.stringify({ status: existing.status, tokenVersion: existing.tokenVersion }),
        newValue: JSON.stringify({ status, tokenVersion: nextVersion }),
        ip,
        userAgent,
        parishId,
      })
      return true
    }

    await tx.update(users).set({ status }).where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt)))
    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: adminUserId,
      action: 'UPDATE_USER_STATUS',
      entityType: 'user',
      entityId: id,
      oldValue: JSON.stringify({ status: existing.status }),
      newValue: JSON.stringify({ status }),
      ip,
      userAgent,
      parishId,
    })
    return true
  })
}

export async function resetUserPassword(id: string, adminUserId: string, parishId: string, ip: string, userAgent: string) {
  if (getSuperAdminId() === id) return null

  const tempPass = `Reset@${randomInt(100000, 999999)}`
  const passwordHash = await bcrypt.hash(tempPass, BCRYPT_COST)

  return runDbTransaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt))).limit(1)
    if (!existing) return null

    const nextVersion = (existing.tokenVersion || 1) + 1
    await tx.update(users).set({
      passwordHash,
      passwordEncrypted: null,
      status: 'FORCE_PASSWORD_CHANGE',
      mustChangePassword: 1,
      failedAttempts: 0,
      lockedUntil: null,
      tokenVersion: nextVersion,
    }).where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt)))

    await revokeAllSessionsWith(tx, id, parishId)
    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: adminUserId,
      action: 'RESET_PASSWORD',
      entityType: 'user',
      entityId: id,
      ip,
      userAgent,
      parishId,
    })

    return { username: existing.username, tempPassword: tempPass }
  })
}

async function auditReauthFailure(failureAction: string, adminUserId: string, entityId: string, parishId: string, ip: string, userAgent: string) {
  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: adminUserId,
    action: failureAction,
    entityType: 'user',
    entityId,
    newValue: JSON.stringify({ reason: 'invalid_admin_password' }),
    ip,
    userAgent,
    parishId,
  })
}

export async function verifyAdminReauth(
  adminUserId: string,
  adminPassword: string,
  parishId: string,
  ip: string,
  userAgent: string,
  entityId: string,
  failureAction: string,
): Promise<boolean> {
  const [admin] = await db.select().from(users).where(and(eq(users.id, adminUserId), eq(users.parishId, parishId), isNull(users.deletedAt))).limit(1)
  if (!admin || admin.status === 'INACTIVE' || (admin.status === 'LOCKED' && admin.id !== getSuperAdminId())) {
    await auditReauthFailure(failureAction, adminUserId, entityId, parishId, ip, userAgent)
    return false
  }
  let passwordValid = false
  try {
    passwordValid = await bcrypt.compare(adminPassword, admin.passwordHash)
  } catch {
    passwordValid = false
  }
  if (!passwordValid) {
    await auditReauthFailure(failureAction, adminUserId, entityId, parishId, ip, userAgent)
    return false
  }
  return true
}

export type UpdateUserPhoneResult =
  | { status: 'updated'; username: string; phone: string; usernameChanged: boolean }
  | { status: 'unchanged'; username: string; phone: string }
  | { status: 'username_conflict'; username: string }
  | null

export async function updateUserPhone(
  id: string,
  phone: string,
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<UpdateUserPhoneResult> {
  if (getSuperAdminId() === id) return null

  const normalized = normalizePhone(phone)
  if (!/^0\d{9}$/.test(normalized)) {
    throw Object.assign(new Error('Số điện thoại không hợp lệ'), { code: 'INVALID_PHONE' })
  }

  return runDbTransaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt))).limit(1)
    if (!existing) return null

    const usernameFromPhone = existing.role === 'phuhuynh' && /^0\d{9}$/.test(existing.username || '')
    const newUsername = usernameFromPhone ? normalized : existing.username
    const usernameChanged = newUsername !== existing.username
    const phoneChanged = normalized !== (existing.phone || '')

    if (!phoneChanged && !usernameChanged) {
      return { status: 'unchanged' as const, username: existing.username, phone: existing.phone || '' }
    }

    if (usernameChanged) {
      const [conflict] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.username, newUsername), eq(users.parishId, parishId), ne(users.id, id)))
        .limit(1)
      if (conflict) return { status: 'username_conflict' as const, username: newUsername }
    }

    await tx
      .update(users)
      .set({ phone: normalized, ...(usernameChanged ? { username: newUsername } : {}) })
      .where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt)))

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: adminUserId,
      action: 'UPDATE_USER_PHONE',
      entityType: 'user',
      entityId: id,
      oldValue: JSON.stringify({ phoneChanged, usernameChanged }),
      newValue: JSON.stringify({ phoneChanged, usernameChanged }),
      ip,
      userAgent,
      parishId,
    })

    return { status: 'updated' as const, username: newUsername, phone: normalized, usernameChanged }
  })
}

export async function updateUserAssignments(
  id: string,
  assignedClasses: string[],
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
) {
  return runDbTransaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt))).limit(1)
    if (!existing) return null

    // ADR-026 invariant (hardening 2026-08-22): chỉ GLV (chunhiem/phuta) được có
    // catechistAssignments. Trước đây chỉ vá ở createUser — update path vẫn cho
    // gán lớp vào tài khoản admin/phuhuynh (row roleInClass sai, checkUserClassAccess
    // đọc bảng này cho mọi role). Gửi danh sách RỖNG vẫn cho phép (dọn row bẩn lịch sử).
    if ((existing.role === 'admin' || existing.role === 'phuhuynh') && assignedClasses.length > 0) {
      throw Object.assign(new Error('Chỉ tài khoản GLV (chủ nhiệm/phụ tá) mới được phân công lớp'), { code: 'ASSIGNMENTS_NOT_ALLOWED' })
    }

    const prevAssignments = await tx.select().from(catechistAssignments).where(and(eq(catechistAssignments.userId, id), eq(catechistAssignments.parishId, parishId)))
    const prevMap = new Map(prevAssignments.map((a) => [a.classId, a]))

    await tx.delete(catechistAssignments).where(and(eq(catechistAssignments.userId, id), eq(catechistAssignments.parishId, parishId)))
    const now = new Date().toISOString()
    for (const classId of assignedClasses) {
      const prev = prevMap.get(classId)
      await tx.insert(catechistAssignments).values({
        id: generateId('ASG'),
        userId: id,
        classId,
        roleInClass: prev?.roleInClass || (existing.role === 'chunhiem' ? 'chunhiem' : 'phuta'),
        parishId,
        createdAt: now,
        updatedAt: now,
        updatedBy: adminUserId,
      })
    }

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: adminUserId,
      action: 'UPDATE_USER_ASSIGNMENTS',
      entityType: 'user',
      entityId: id,
      newValue: JSON.stringify({ assignedClasses }),
      ip,
      userAgent,
      parishId,
    })

    return true
  })
}

export async function forceLogoutUser(id: string, adminUserId: string, parishId: string, ip: string, userAgent: string) {
  if (getSuperAdminId() === id) return null

  return runDbTransaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt))).limit(1)
    if (!existing) return null

    const nextVersion = (existing.tokenVersion || 1) + 1
    await tx.update(users).set({ tokenVersion: nextVersion }).where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt)))
    await revokeAllSessionsWith(tx, id, parishId)
    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: adminUserId,
      action: 'FORCE_LOGOUT',
      entityType: 'user',
      entityId: id,
      newValue: JSON.stringify({ tokenVersion: nextVersion }),
      ip,
      userAgent,
      parishId,
    })

    return true
  })
}

export type DeleteUserAccountResult = {
  id: string
  deleted: true
  alreadyDeleted: boolean
}

/**
 * Xóa logic tài khoản nhưng giữ hàng users làm neo lịch sử cho các bảng nghiệp vụ.
 * Phiên đăng nhập, phân công và kênh gửi chủ động bị thu hồi trong cùng transaction;
 * hồ sơ nhân sự Xứ đoàn chỉ bị gỡ liên kết, không bị xóa theo tài khoản.
 */
export async function deleteUserAccount(
  id: string,
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<DeleteUserAccountResult | null> {
  if (id === adminUserId || id === getSuperAdminId()) {
    throw Object.assign(new Error('Không thể tự xóa tài khoản hoặc xóa Admin trưởng'), { code: 'PROTECTED_ACCOUNT' })
  }

  return runDbTransaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.parishId, parishId)))
      .limit(1)
    if (!existing) return null
    if (existing.deletedAt) return { id, deleted: true as const, alreadyDeleted: true }

    const now = new Date().toISOString()
    const nextVersion = (existing.tokenVersion || 1) + 1

    await tx
      .update(users)
      .set({
        status: 'INACTIVE',
        deletedAt: now,
        tokenVersion: nextVersion,
        failedAttempts: 0,
        lockedUntil: null,
        passwordEncrypted: null,
      })
      .where(and(eq(users.id, id), eq(users.parishId, parishId), isNull(users.deletedAt)))

    await revokeAllSessionsWith(tx, id, parishId)
    await tx.delete(catechistAssignments).where(and(eq(catechistAssignments.userId, id), eq(catechistAssignments.parishId, parishId)))
    await tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, id), eq(pushSubscriptions.parishId, parishId)))
    await tx.delete(telegramLinkTokens).where(and(eq(telegramLinkTokens.userId, id), eq(telegramLinkTokens.parishId, parishId)))
    await tx.update(telegramLinks).set({ status: 'REVOKED', revokedAt: now, updatedAt: now }).where(and(eq(telegramLinks.userId, id), eq(telegramLinks.parishId, parishId)))
    await tx.delete(passwordResetRequests).where(and(eq(passwordResetRequests.userId, id), eq(passwordResetRequests.parishId, parishId)))
    await tx.update(parishPeople).set({ linkedUserId: null, updatedBy: adminUserId, updatedAt: now }).where(and(eq(parishPeople.linkedUserId, id), eq(parishPeople.parishId, parishId)))

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId: adminUserId,
      action: 'DELETE_USER_ACCOUNT',
      entityType: 'user',
      entityId: id,
      oldValue: JSON.stringify({ role: existing.role, status: existing.status }),
      newValue: JSON.stringify({ status: 'INACTIVE', deleted: true, tokenVersion: nextVersion }),
      ip,
      userAgent,
      parishId,
      createdAt: now,
    })

    return { id, deleted: true as const, alreadyDeleted: false }
  })
}

const PARENT_PHONE_RE = /^0\d{9}$/

export interface ParentProvisionCandidate {
  phone: string
  parentName: string
  childrenCount: number
}

export interface ParentProvisionItem {
  phone: string
  fullName: string
  status: 'created' | 'skipped' | 'error'
  reason?: string
  username?: string
  tempPassword?: string
}

export interface ParentProvisionResult {
  total: number
  successCount: number
  skippedCount: number
  errorCount: number
  results: ParentProvisionItem[]
}

async function collectParentPhoneCandidates(parishId: string): Promise<{ candidates: ParentProvisionCandidate[]; validPhoneCount: number; existingCount: number }> {
  const rows = await db
    .select({ parentPhone: students.parentPhone, parentName: students.parentName })
    .from(students)
    .where(and(eq(students.parishId, parishId), isNull(students.deletedAt)))
    .orderBy(students.parentName)

  const byPhone = new Map<string, ParentProvisionCandidate>()
  for (const row of rows) {
    const phone = normalizePhone(row.parentPhone || '')
    if (!PARENT_PHONE_RE.test(phone)) continue
    const existing = byPhone.get(phone)
    if (existing) {
      existing.childrenCount += 1
      continue
    }
    byPhone.set(phone, { phone, parentName: row.parentName?.trim() || 'Phụ huynh', childrenCount: 1 })
  }
  if (byPhone.size === 0) return { candidates: [], validPhoneCount: 0, existingCount: 0 }

  const existingPhones = new Set<string>()
  const parishUsers = await db.select({ phone: users.phone }).from(users).where(eq(users.parishId, parishId))
  for (const u of parishUsers) {
    if (!u.phone) continue
    const p = normalizePhone(u.phone)
    if (PARENT_PHONE_RE.test(p)) existingPhones.add(p)
  }

  const existingUsernames = new Set<string>()
  const allUsernames = await db.select({ username: users.username }).from(users).where(eq(users.parishId, parishId))
  for (const u of allUsernames) existingUsernames.add(u.username)

  const candidates = [...byPhone.values()].filter((c) => !existingPhones.has(c.phone) && !existingUsernames.has(c.phone))
  return { candidates, validPhoneCount: byPhone.size, existingCount: byPhone.size - candidates.length }
}

export async function getParentProvisionPreview(parishId: string): Promise<{ total: number; candidates: ParentProvisionCandidate[]; validPhoneCount: number; existingCount: number }> {
  const { candidates, validPhoneCount, existingCount } = await collectParentPhoneCandidates(parishId)
  return { total: candidates.length, candidates, validPhoneCount, existingCount }
}

export async function provisionParentAccounts(
  parishId: string,
  adminUserId: string,
  ip: string,
  userAgent: string,
): Promise<ParentProvisionResult> {
  const { candidates } = await collectParentPhoneCandidates(parishId)
  const results: ParentProvisionItem[] = []
  const createdIds: string[] = []

  for (const candidate of candidates) {
    const tempPass = `Parish@${randomInt(100000, 999999)}`
    const passwordHash = await bcrypt.hash(tempPass, BCRYPT_COST)
    const id = generateId('USR')
    try {
      await db.insert(users).values({
        id,
        username: candidate.phone,
        passwordHash,
        passwordEncrypted: null,
        fullName: candidate.parentName,
        phone: candidate.phone,
        role: 'phuhuynh',
        status: 'FORCE_PASSWORD_CHANGE',
        tokenVersion: 1,
        failedAttempts: 0,
        mustChangePassword: 1,
        parishId,
        createdAt: new Date().toISOString(),
      })
      createdIds.push(id)
      results.push({ phone: candidate.phone, fullName: candidate.parentName, status: 'created', username: candidate.phone, tempPassword: tempPass })
    } catch (err: any) {
      if (err?.code === 'SQLITE_CONSTRAINT' || err?.rawCode === 2067 || String(err?.message || '').includes('UNIQUE constraint failed')) {
        results.push({ phone: candidate.phone, fullName: candidate.parentName, status: 'skipped', reason: 'username_exists' })
      } else {
        results.push({ phone: candidate.phone, fullName: candidate.parentName, status: 'error', reason: 'db_error' })
      }
    }
  }

  const successCount = results.filter((r) => r.status === 'created').length
  const skippedCount = results.filter((r) => r.status === 'skipped').length
  const errorCount = results.filter((r) => r.status === 'error').length

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: adminUserId,
    action: 'PARENT_ACCOUNTS_PROVISIONED',
    entityType: 'user',
    entityId: 'bulk-parent-provision',
    newValue: JSON.stringify({ total: results.length, successCount, skippedCount, errorCount, createdIds }),
    ip,
    userAgent,
    parishId,
  })

  return { total: results.length, successCount, skippedCount, errorCount, results }
}
