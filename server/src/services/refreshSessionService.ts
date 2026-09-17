import { createHash, randomUUID } from 'crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, runDbTransaction, type DbExecutor } from '../db/index.js'
import { refreshTokens, users } from '../db/schema.js'
import { generateTokens, verifyRefreshToken, isSuperAdmin } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { getEnforcedDeploymentParishId } from '../utils/deploymentParish.js'

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
export async function issueTokensWithSessionIn(executor: DbExecutor, user: AuthUserLike, tokenVersion: number) {
  const tokens = generateTokens({
    userId: user.id,
    username: user.username,
    role: user.role,
    parishId: user.parishId,
    tokenVersion,
  })
  await executor.insert(refreshTokens).values({
    id: `rts-${randomUUID()}`,
    userId: user.id,
    parishId: user.parishId,
    tokenHash: hashRefreshToken(tokens.refreshToken),
    expiresAt: refreshExpiry(),
  })
  return tokens
}

export async function issueTokensWithSession(user: AuthUserLike, tokenVersion: number) {
  return issueTokensWithSessionIn(db, user, tokenVersion)
}

export type RefreshRotationResult =
  | { status: 'ok'; accessToken: string; refreshToken: string; userId: string; parishId: string }
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
  if (user.status === 'LOCKED' && !isSuperAdmin(user.id, user.parishId, user.role)) {
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
      await tx
        .update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
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
    // The earlier reads can predate a lock/reset/replay transaction. Never
    // issue a successor from a snapshot whose authority has since changed.
    const [live] = await tx.select().from(users).where(and(
      eq(users.id, user.id), eq(users.parishId, user.parishId),
    )).limit(1)
    if (!live || live.deletedAt || live.tokenVersion !== user.tokenVersion || live.role !== user.role ||
      live.status === 'INACTIVE' || (live.status === 'LOCKED' && !isSuperAdmin(live.id, live.parishId, live.role))) {
      return { status: 'rejected', code: 'SESSION_INVALID', message: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' }
    }
    const res = await tx.update(refreshTokens)
      .set({ revokedAt: now, replacedBy: newId })
      .where(and(eq(refreshTokens.id, session.id), eq(refreshTokens.parishId, user.parishId), isNull(refreshTokens.revokedAt)))
      .run()

    if (res.rowsAffected !== 1) {
      // A concurrent claimant used the same bearer credential. The server cannot
      // distinguish a benign second tab from a stolen-token replay, so contain
      // both cases identically. The version CAS prevents racing losers from
      // incrementing repeatedly; revocation commits with the winning increment.
      await tx.update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(and(
          eq(users.id, user.id),
          eq(users.parishId, user.parishId),
          eq(users.tokenVersion, user.tokenVersion),
        ))
      await revokeAllSessionsWith(tx, user.id, user.parishId)
      return { status: 'rejected', code: 'SESSION_REUSE_DETECTED', message: 'Phát hiện refresh token bị tái sử dụng — đã thu hồi toàn bộ phiên đăng nhập' }
    }

    await tx.insert(refreshTokens).values({
      id: newId,
      userId: user.id,
      parishId: user.parishId,
      tokenHash: hashRefreshToken(tokens.refreshToken),
      expiresAt: refreshExpiry(),
    })
    return {
      status: 'ok',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      userId: live.id,
      parishId: live.parishId,
    }
  })
}

export async function revokePresentedSessionByTokenHash(tokenHash: string): Promise<boolean> {
  const deploymentParishId = getEnforcedDeploymentParishId()
  return runDbTransaction(async tx => {
    const [session] = await tx.select().from(refreshTokens).where(and(
      eq(refreshTokens.tokenHash, tokenHash),
      deploymentParishId ? eq(refreshTokens.parishId, deploymentParishId) : undefined,
    )).limit(1)
    if (!session) return false
    // A refresh may have committed just before logout. Follow only this
    // session's replacement chain, never unrelated device sessions.
    let current: typeof session | undefined = session
    const visited = new Set<string>()
    const now = new Date().toISOString()
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      await tx.update(refreshTokens).set({ revokedAt: now }).where(and(
        eq(refreshTokens.id, current.id), eq(refreshTokens.parishId, session.parishId),
        eq(refreshTokens.userId, session.userId),
      ))
      if (!current.replacedBy) break
      const [next] = await tx.select().from(refreshTokens).where(and(
        eq(refreshTokens.id, current.replacedBy), eq(refreshTokens.parishId, session.parishId),
        eq(refreshTokens.userId, session.userId),
      )).limit(1)
      current = next
    }
    return true
  })
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
