import { randomInt } from 'node:crypto'
import { db } from '../db/index.js'
import { users, students, auditLogs, catechistAssignments } from '../db/schema.js'
import { eq, and, ne, inArray, isNull } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { generateId } from '../utils/id.js'
import { getSuperAdminId } from '../middleware/auth.js'
import { revokeAllSessions } from './refreshSessionService.js'
import { encryptPassword, decryptPassword } from '../utils/passwordCipher.js'
import { BCRYPT_COST } from '../utils/passwordPolicy.js'
import { normalizePhone } from '../utils/phone.js'
import { buildAutoUsername, isValidVnPhone } from '../utils/username.js'

export async function getUsers(parishId: string, limit: number = 50, page: number = 1) {
  const offset = (page - 1) * limit
  const userList = await db.select().from(users).where(eq(users.parishId, parishId)).limit(limit).offset(offset)
  const assignments = await db.select().from(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))

  const assignmentMap = new Map<string, string[]>()
  for (const a of assignments) {
    if (!assignmentMap.has(a.userId)) assignmentMap.set(a.userId, [])
    assignmentMap.get(a.userId)!.push(a.classId)
  }

  return userList.map((u) => {
    const userClasses = assignmentMap.get(u.id) || []
    // ADR-021 rewrite (2026-08-08): KHÔNG giải mã password trong GET — chỉ báo
    // có bản mã hóa (password tạm) để UI hiển thị nút "xem lại"; plaintext chỉ
    // trả qua POST /:id/reveal-password (admin, có audit REVEAL_PASSWORD).
    const { passwordHash: _passwordHash, passwordEncrypted, ...safeUser } = u
    return {
      ...safeUser,
      hasPasswordCopy: Boolean(passwordEncrypted),
      assignedClasses: userClasses,
    }
  })
}

export async function getCatechists(parishId: string) {
  const userList = await db
    .select({
      id: users.id,
      username: users.username,
      fullName: users.fullName,
      phone: users.phone,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.parishId, parishId), inArray(users.role, ['admin', 'chunhiem', 'phuta'])))
  const assignments = await db.select().from(catechistAssignments).where(eq(catechistAssignments.parishId, parishId))

  const assignmentMap = new Map<string, string[]>()
  for (const a of assignments) {
    if (!assignmentMap.has(a.userId)) assignmentMap.set(a.userId, [])
    assignmentMap.get(a.userId)!.push(a.classId)
  }

  return userList.map((u) => ({
    ...u,
    assignedClasses: assignmentMap.get(u.id) || [],
  }))
}

export async function getUserById(id: string, parishId: string) {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.parishId, parishId)))
    .limit(1)
  if (!u) return null
  // ADR-021 rewrite: KHÔNG trả password_encrypted (raw ciphertext) ra ngoài —
  // giống getUsers, chỉ cờ hasPasswordCopy; plaintext chỉ qua reveal-password.
  const { passwordHash: _passwordHash, passwordEncrypted, ...safeUser } = u
  return { ...safeUser, hasPasswordCopy: Boolean(passwordEncrypted) }
}

export interface CreateUserData {
  username?: string
  holyName?: string
  fullName: string
  phone?: string
  role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh'
  assignedClasses?: string[]
}

/**
 * ADR-027 (2026-08-12): username tự sinh theo `chức vụ_Tên thánh + Họ và tên`
 * (SSOT server — client chỉ preview cùng quy tắc qua src/utils/username.ts).
 * - role ≠ phuhuynh: username = buildAutoUsername(role, holyName, fullName);
 *   admin truyền `username` (override tay khi auto trùng) → dùng override.
 *   Thiếu cả holyName lẫn override → throw HOLY_NAME_REQUIRED (400).
 * - role = phuhuynh: username = override ?? SĐT chuẩn hóa (quy ước ADR-026);
 *   thiếu SĐT hợp lệ + không override → throw PHONE_REQUIRED (400).
 */
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

export async function createUser(
  data: CreateUserData,
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<{ id: string; username: string; tempPassword: string } | null> {
  const username = resolveUsername(data)
  // ADR-016 (users): Pre-check trước khi insert — username UNIQUE (constraint DB).
  // ADR-046 (2026-08-16): unique scope theo parish — cùng username ở parish khác hợp lệ.
  // Trước đây insert mù → UNIQUE constraint failure thành 500 thay vì 409.
  const [existing] = await db.select({ id: users.id }).from(users).where(and(eq(users.username, username), eq(users.parishId, parishId))).limit(1)
  if (existing) return null

  const id = generateId('USR')
  const tempPass = `Parish@${randomInt(100000, 999999)}`
  const passwordHash = await bcrypt.hash(tempPass, BCRYPT_COST)
  const now = new Date().toISOString()

  try {
    await db.insert(users).values({
      id,
      username,
      passwordHash,
      passwordEncrypted: encryptPassword(tempPass),
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
  } catch (err: any) {
    // Race condition: username được tạo giữa lúc pre-check và insert.
    if (err?.code === 'SQLITE_CONSTRAINT' || err?.rawCode === 2067 || String(err?.message || '').includes('UNIQUE constraint failed')) {
      return null
    }
    throw err
  }

  // ADR-026 fix: chỉ chunhiem/phuta mới có catechistAssignments — admin/phuhuynh tạo
  // kèm assignedClasses trước đây sinh row roleInClass='phuta' sai (checkUserClassAccess
  // đọc bảng này cho mọi role → dữ liệu ô nhiễm + rủi ro tương lai).
  if (data.assignedClasses && data.assignedClasses.length > 0 && (data.role === 'chunhiem' || data.role === 'phuta')) {
    const classes = data.assignedClasses
    await db.transaction(async (tx) => {
      for (const classId of classes) {
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
    })
  }

  await db.insert(auditLogs).values({
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
  if (getSuperAdminId() === id) {
    return null
  }

  if (id === adminUserId && status === 'LOCKED') {
    throw new Error('Admin cannot lock their own account')
  }

  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId))).limit(1)
  if (!existing) return null

  // A10 (2026-08-10): LOCKED phải vô hiệu hóa phiên NGAY TỨC THÌ:
  // + tăng tokenVersion (giết mọi access token đang lưu hành — 15 phút trước đây)
  // + revokeAllSessions (giết refresh_tokens — không refresh lại được).
  // Trước fix: chỉ set status → admin bị khóa vẫn dùng token cũ tới hết hạn.
  // INACTIVE KHÔNG đổi hành vi phiên (trạng thái nghiệp vụ — xem A11 DISMISSED).
  if (status === 'LOCKED') {
    const nextVersion = (existing.tokenVersion || 1) + 1
    await db.update(users).set({ status, tokenVersion: nextVersion }).where(and(eq(users.id, id), eq(users.parishId, parishId)))
    await revokeAllSessions(id, parishId)
    await db.insert(auditLogs).values({
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

  await db.update(users).set({ status }).where(and(eq(users.id, id), eq(users.parishId, parishId)))

  await db.insert(auditLogs).values({
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
}

export async function resetUserPassword(id: string, adminUserId: string, parishId: string, ip: string, userAgent: string) {
  if (getSuperAdminId() === id) {
    return null
  }

  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId))).limit(1)
  if (!existing) return null

  const tempPass = `Reset@${randomInt(100000, 999999)}`
  const passwordHash = await bcrypt.hash(tempPass, BCRYPT_COST)
  const nextVersion = (existing.tokenVersion || 1) + 1

  await db.update(users).set({ passwordHash, passwordEncrypted: encryptPassword(tempPass), status: 'FORCE_PASSWORD_CHANGE', failedAttempts: 0, lockedUntil: null, tokenVersion: nextVersion }).where(and(eq(users.id, id), eq(users.parishId, parishId)))

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: adminUserId,
    action: 'RESET_PASSWORD',
    entityType: 'user',
    entityId: id,
    ip,
    userAgent,
    parishId,
  })

  // ADR-016 (users): Client (SettingsPage) hiển thị mật khẩu tạm — trước đây
  // chỉ trả username nên admin không bao giờ biết mật khẩu tạm để giao cho user.
  return { username: existing.username, tempPassword: tempPass }
}

/**
 * A06 (2026-08-10): SSOT xác minh mật khẩu admin cho mọi thao tác quản trị nhạy
 * cảm (reveal / reset-password / admin-change-password). Parish-scoped — token
 * admin của giáo xứ khác không bao giờ khớp bản ghi DB. LOCKED admin bị chặn như
 * login (BUSINESS_RULES 10.1). Hash lỗi (vd seed test) → coi như sai, không ném.
 * Thất bại → audit `<failureAction>` + return false (route map 401 INVALID_ADMIN_PASSWORD).
 * Không chạm failedAttempts/lockout — chỉ áp lockout cho login.
 */
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
  const [admin] = await db.select().from(users).where(and(eq(users.id, adminUserId), eq(users.parishId, parishId))).limit(1)
  if (!admin || (admin.status === 'LOCKED' && admin.id !== getSuperAdminId())) {
    await auditReauthFailure(failureAction, adminUserId, entityId, parishId, ip, userAgent)
    return false
  }
  let passwordValid = false
  try {
    passwordValid = await bcrypt.compare(adminPassword, admin.passwordHash)
  } catch {
    // passwordHash không phải bcrypt hợp lệ (vd test seed) → không bao giờ "đúng"
    passwordValid = false
  }
  if (!passwordValid) {
    await auditReauthFailure(failureAction, adminUserId, entityId, parishId, ip, userAgent)
    return false
  }
  return true
}

/**
 * ADR-021 rewrite (2026-08-08): Reveal có chủ đích + audit — thay thế cho việc
 * GET /api/users decrypt toàn bộ. Chỉ trả password nếu còn bản mã hóa (password
 * tạm do admin đặt, status FORCE_PASSWORD_CHANGE); password do user tự đổi KHÔNG
 * có bản mã hóa nên không thể xem lại (passwordEncrypted = NULL).
 *
 * A05 (2026-08-10): RE-AUTHENTICATION — admin phải nhập lại mật khẩu HIỆN TẠI của
 * chính mình (bcrypt) trước khi giải mã. Kiểm tra admin trước target (không làm
 * lộ sự tồn tại target qua timing). Đúng = audit REVEAL_PASSWORD; sai = audit
 * REVEAL_PASSWORD_FAILED + 401 (rate limit 10/60s/IP ở route). Không chạm
 * failedAttempts/lockout — chính sách BUSINESS_RULES 10.1 chỉ áp lockout cho login.
 */
export type RevealPasswordResult =
  | { status: 'ok'; username: string; password: string }
  | { status: 'invalid_admin_password' }
  | { status: 'not_found' }

export async function revealUserPassword(
  id: string,
  adminUserId: string,
  adminPassword: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<RevealPasswordResult> {
  if (getSuperAdminId() === id) return { status: 'not_found' }

  // A05/A06: dùng chung verifyAdminReauth (SSOT) — admin không tồn tại / LOCKED /
  // sai mật khẩu đều audit REVEAL_PASSWORD_FAILED và trả về cùng 401.
  const reauthOk = await verifyAdminReauth(adminUserId, adminPassword, parishId, ip, userAgent, id, 'REVEAL_PASSWORD_FAILED')
  if (!reauthOk) return { status: 'invalid_admin_password' }

  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId))).limit(1)
  if (!existing) return { status: 'not_found' }
  if (!existing.passwordEncrypted) return { status: 'not_found' }

  const plaintext = decryptPassword(existing.passwordEncrypted)
  if (!plaintext) return { status: 'not_found' }

  await db.insert(auditLogs).values({
    id: generateId('AUD'),
    userId: adminUserId,
    action: 'REVEAL_PASSWORD',
    entityType: 'user',
    entityId: id,
    newValue: JSON.stringify({ username: existing.username }),
    ip,
    userAgent,
    parishId,
  })

  return { status: 'ok', username: existing.username, password: plaintext }
}

export type UpdateUserPhoneResult =
  | { status: 'updated'; username: string; phone: string; usernameChanged: boolean }
  | { status: 'unchanged'; username: string; phone: string }
  | { status: 'username_conflict'; username: string }
  | null

/**
 * ADR-039 (2026-08-15): admin đổi SĐT tài khoản — endpoint DUY NHẤT sửa SĐT.
 * Lý do: users.phone là identity của phụ huynh (khớp students.parentPhone —
 * ADR-026), nên phụ huynh KHÔNG được tự đổi (chống mất con / thấy con người
 * khác); admin đổi kèm re-auth (A05/A06). Với phuhuynh có username = SĐT cũ
 * (quy ước ADR-026/027), username đồng bộ theo SĐT mới; trùng username →
 * username_conflict (route map 409). Audit không ghi SĐT thô (A16 — tránh PII).
 */
export async function updateUserPhone(
  id: string,
  phone: string,
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
): Promise<UpdateUserPhoneResult> {
  if (getSuperAdminId() === id) {
    return null
  }

  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId))).limit(1)
  if (!existing) return null

  const normalized = normalizePhone(phone)
  if (!/^0\d{9}$/.test(normalized)) {
    throw Object.assign(new Error('Số điện thoại không hợp lệ'), { code: 'INVALID_PHONE' })
  }

  const usernameFromPhone = existing.role === 'phuhuynh' && /^0\d{9}$/.test(existing.username || '')
  const newUsername = usernameFromPhone ? normalized : existing.username
  const usernameChanged = newUsername !== existing.username
  const phoneChanged = normalized !== (existing.phone || '')

  if (!phoneChanged && !usernameChanged) {
    return { status: 'unchanged', username: existing.username, phone: existing.phone || '' }
  }

  if (usernameChanged) {
    // ADR-046 (2026-08-16): unique scope theo parish — cùng username ở parish khác không conflict.
    const [conflict] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, newUsername), eq(users.parishId, parishId), ne(users.id, id)))
      .limit(1)
    if (conflict) return { status: 'username_conflict', username: newUsername }
  }

  await db
    .update(users)
    .set({ phone: normalized, ...(usernameChanged ? { username: newUsername } : {}) })
    .where(and(eq(users.id, id), eq(users.parishId, parishId)))

  await db.insert(auditLogs).values({
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

  return { status: 'updated', username: newUsername, phone: normalized, usernameChanged }
}

export async function updateUserAssignments(
  id: string,
  assignedClasses: string[],
  adminUserId: string,
  parishId: string,
  ip: string,
  userAgent: string,
) {
  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId))).limit(1)
  if (!existing) return null

  const prevAssignments = await db.select().from(catechistAssignments).where(and(eq(catechistAssignments.userId, id), eq(catechistAssignments.parishId, parishId)))
  const prevMap = new Map(prevAssignments.map((a) => [a.classId, a]))

  await db.transaction(async (tx) => {
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
  })

  await db.insert(auditLogs).values({
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
}

export async function forceLogoutUser(id: string, adminUserId: string, parishId: string, ip: string, userAgent: string) {
  if (getSuperAdminId() === id) {
    return null
  }

  const [existing] = await db.select().from(users).where(and(eq(users.id, id), eq(users.parishId, parishId))).limit(1)
  if (!existing) return null

  const nextVersion = (existing.tokenVersion || 1) + 1
  await db.update(users).set({ tokenVersion: nextVersion }).where(and(eq(users.id, id), eq(users.parishId, parishId)))

  await db.insert(auditLogs).values({
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
}

// ─── ADR-026 (2026-08-12): cấp tài khoản phụ huynh hàng loạt từ students.parentPhone ───
// - Nguồn: học sinh cùng giáo xứ, chưa soft-delete, parentPhone hợp lệ (VN 10 số sau chuẩn hóa).
// - 1 tài khoản / 1 SĐT (anh chị em cùng SĐT → 1 account, childrenCount = số con).
// - SKIP (có reason): SĐT rỗng/placeholder/không hợp lệ; SĐT đã gắn tài khoản (cùng giáo xứ,
//   khớp chuẩn hóa — kể cả GLV trùng SĐT); username (SĐT) đã tồn tại (UNIQUE toàn cục).
// - Tài khoản tạo: role phuhuynh, username = SĐT chuẩn hóa, fullName = parentName,
//   temp password Parish@\d{6} (policy §10.1), FORCE_PASSWORD_CHANGE + mustChangePassword=1
//   (§10.2), password_encrypted theo ADR-021 (NULL nếu thiếu PASSWORD_CIPHER_KEY).
// - ADR-008: partial-success itemized; ADR-015: chạy lại idempotent (skip tài khoản đã có).
// - A16: audit GỘP counts + createdIds, KHÔNG chứa SĐT/PII.
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

  // SĐT đã gắn tài khoản hiện có trong giáo xứ (khớp chuẩn hóa — SSOT parentService).
  const existingPhones = new Set<string>()
  const parishUsers = await db.select({ phone: users.phone }).from(users).where(eq(users.parishId, parishId))
  for (const u of parishUsers) {
    if (!u.phone) continue
    const p = normalizePhone(u.phone)
    if (PARENT_PHONE_RE.test(p)) existingPhones.add(p)
  }

  // username UNIQUE theo parish (schema users, ADR-046) — chỉ cần tránh va chạm trong parish.
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
        passwordEncrypted: encryptPassword(tempPass),
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
      // Race: username được tạo giữa lúc collect và insert (giống createUser).
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

  // A16: audit gộp counts + createdIds — KHÔNG ghi SĐT/plaintext temp password.
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
