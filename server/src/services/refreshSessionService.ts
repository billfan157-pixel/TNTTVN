import { createHash, randomUUID } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db, runDbTransaction, type DbExecutor } from '../db/index.js'
import { refreshTokens, users } from '../db/schema.js'
import { generateTokens, verifyRefreshToken, getSuperAdminId } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function refreshExpiry(): string {
  return new Date(Date.now() + REFRESH_TTL_MS).toISOString()
}

export interface AuthUserLike {
  id: string
  username: string
  role: JwtPayload['role']
  parishId: string
}

/**
 * Phát hành cặp token + ghi refresh session (bắt buộc sau login/change-password).
 * KHÔNG lưu refresh token plaintext — chỉ lưu sha256 hash.
 */
export async function issueTokensWithSession(user: AuthUserLike, tokenVersion: number) {
  const tokens = generateTokens({
    userId: user.id,
    username: user.username,
    role: user.role,
    parishId: user.parishId,
    tokenVersion,
  })
  await db.insert(refreshTokens).values({
    id: `rts-${randomUUID()}`,
    userId: user.id,
    parishId: user.parishId,
    tokenHash: hashRefreshToken(tokens.refreshToken),
    expiresAt: refreshExpiry(),
  })
  return tokens
}

export type RefreshRotationResult =
  | { status: 'ok'; accessToken: string; refreshToken: string }
  | { status: 'rejected'; code: string; message: string }

/**
 * Xác thực + ROTATE refresh token (SSOT, JWT refresh rotation):
 * - Token hợp lệ & session còn hiệu lực → thu hồi token cũ (revokedAt + replacedBy),
 *   phát hành cặp mới (old token không dùng lại được).
 * - Token đã bị thu hồi (reuse) → phát hiện đánh cắp: thu hồi TẤT CẢ phiên user
 *   + tăng tokenVersion (giết cả access token) → buộc đăng nhập lại.
 * - tokenVersion lệch (change-password/force-logout) → SESSION_INVALID.
 */
export async function rotateRefreshSession(refreshToken: string): Promise<RefreshRotationResult> {
  const payload = verifyRefreshToken(refreshToken)
  if (!payload) {
    return { status: 'rejected', code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token không hợp lệ' }
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, payload.userId), eq(users.parishId, payload.parishId)))
    .limit(1)
  if (!user || user.deletedAt || user.status === 'INACTIVE') {
    return { status: 'rejected', code: 'USER_INACTIVE', message: 'Tài khoản không còn hoạt động' }
  }
  if (user.status === 'LOCKED' && user.id !== getSuperAdminId()) {
    return { status: 'rejected', code: 'USER_LOCKED', message: 'Tài khoản đã bị khóa' }
  }
  if (payload.tokenVersion !== undefined && user.tokenVersion !== payload.tokenVersion) {
    return { status: 'rejected', code: 'SESSION_INVALID', message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' }
  }

  const hash = hashRefreshToken(refreshToken)
  const [session] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, hash), eq(refreshTokens.parishId, payload.parishId)))
    .limit(1)
  if (!session) {
    return { status: 'rejected', code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token không hợp lệ' }
  }
  if (session.revokedAt) {
    // Reuse detection is a security state transition: tokenVersion bump and session
    // revocation must commit together. Otherwise a transient failure can leave one
    // half of the containment action applied and the other half missing.
    await runDbTransaction(async (tx) => {
      const nextVersion = (user.tokenVersion || 1) + 1
      await tx
        .update(users)
        .set({ tokenVersion: nextVersion })
        .where(and(eq(users.id, user.id), eq(users.parishId, user.parishId)))
      await revokeAllSessionsWith(tx, user.id, user.parishId)
    })
    return { status: 'rejected', code: 'SESSION_REUSE_DETECTED', message: 'Phát hiện refresh token bị tái sử dụng — đã thu hồi toàn bộ phiên đăng nhập' }
  }
  if (session.expiresAt <= new Date().toISOString()) {
    return { status: 'rejected', code: 'REFRESH_EXPIRED', message: 'Phiên đăng nhập đã hết hạn' }
  }

  const tokens = generateTokens({
    userId: user.id,
    username: user.username,
    role: user.role as JwtPayload['role'],
    parishId: user.parishId,
    tokenVersion: user.tokenVersion || 1,
  })
  const newId = `rts-${randomUUID()}`
  const now = new Date().toISOString()

  // A-NEW-13 (2026-08-11): rotation ATOMIC qua runDbTransaction (BEGIN IMMEDIATE +
  // retry SQLITE_BUSY — libsql local mở connection mới mỗi transaction nên busy_timeout
  // phải set lại trong tx). Conditional UPDATE `revoked_at IS NULL` là atomic claim:
  // đúng 1 request đồng thời claim được token; request thua → rowsAffected=0.
  return await runDbTransaction(async (tx) => {
    const res = await tx.update(refreshTokens)
      .set({ revokedAt: now, replacedBy: newId })
      .where(and(eq(refreshTokens.id, session.id), isNull(refreshTokens.revokedAt)))
      .run()

    if (res.rowsAffected !== 1) {
      // RACE (2 tab/hai thiết bị refresh cùng lúc, window vài ms) — request thua claim.
      // KHÔNG revoke-all/bump ở đây: session mới của request thắng còn hợp lệ.
      return { status: 'rejected', code: 'SESSION_REUSE_DETECTED', message: 'Phát hiện refresh token bị tái sử dụng — vui lòng đăng nhập lại' }
    }

    await tx.insert(refreshTokens).values({
      id: newId,
      userId: user.id,
      parishId: user.parishId,
      tokenHash: hashRefreshToken(tokens.refreshToken),
      expiresAt: refreshExpiry(),
    })
    return { status: 'ok', accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
  })
}

export async function revokeSessionByTokenHash(tokenHash: string, parishId: string): Promise<void> {
  await db.update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.parishId, parishId)))
}

/**
 * Transaction-aware revocation primitive. Application services that also mutate
 * user state pass their current transaction so the whole auth transition is ACID.
 */
export async function revokeAllSessionsWith(
  executor: DbExecutor,
  userId: string,
  parishId: string,
): Promise<void> {
  await executor.update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.parishId, parishId)))
}

export async function revokeAllSessions(userId: string, parishId: string): Promise<void> {
  await revokeAllSessionsWith(db, userId, parishId)
}
