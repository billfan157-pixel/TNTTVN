import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'
import auth from '../routes/auth.js'
import { db } from '../db/index.js'
import { users, refreshTokens, auditLogs } from '../db/schema.js'
import { issueTokensWithSession, rotateRefreshSession } from '../services/refreshSessionService.js'
import { updateUserStatus } from '../services/userService.js'

const parishId = `auth02-${Date.now()}`
const account = { id: `${parishId}-user`, username: 'synthetic-auth02', role: 'phuta' as const, parishId }
const password = 'Synthetic@123'
const actorId = `${parishId}-admin`
const headers = { 'Content-Type': 'application/json' }
const cookie = (token: string) => ({ Cookie: `parish_refresh=${encodeURIComponent(token)}` })
const me = (token: string) => auth.request('/me', { headers: { Authorization: `Bearer ${token}` } })
const refresh = (token: string) => auth.request('/refresh', { method: 'POST', headers: cookie(token) })

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 4)
  await db.insert(users).values([
    { ...account, fullName: 'Synthetic Audit User', passwordHash },
    { id: actorId, username: 'synthetic-admin', parishId, role: 'admin', fullName: 'Synthetic Admin', passwordHash },
  ])
})
beforeEach(async () => {
  await db.delete(refreshTokens).where(eq(refreshTokens.parishId, parishId))
  await db.update(users).set({ status: 'ACTIVE', tokenVersion: 1, failedAttempts: 0 }).where(eq(users.id, account.id))
})
afterEach(() => vi.restoreAllMocks())
afterAll(async () => {
  await db.delete(refreshTokens).where(eq(refreshTokens.parishId, parishId))
  await db.delete(auditLogs).where(eq(auditLogs.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
})

describe('AUTH-P1-001 replay containment at the transaction boundary', () => {
  it.each(['attacker', 'legitimate client'])('%s wins a rotation race: successor loses all authority after detection', async winnerName => {
    const first = await issueTokensWithSession(account, 1)
    const otherDevice = await issueTokensWithSession(account, 1)
    let entered!: () => void
    let release!: () => void
    const atTransaction = new Promise<void>(resolve => { entered = resolve })
    const resume = new Promise<void>(resolve => { release = resolve })
    const original = db.transaction.bind(db)
    // The loser has read the same unrevoked session but has not claimed it yet.
    vi.spyOn(db, 'transaction').mockImplementationOnce(async (callback, config) => {
      entered()
      await resume
      return original(callback, config)
    })
    const loser = rotateRefreshSession(first.refreshToken)
    await atTransaction
    let winner: Awaited<ReturnType<typeof rotateRefreshSession>>
    try {
      winner = await rotateRefreshSession(first.refreshToken)
    } finally {
      release()
    }
    expect(winner.status, winnerName).toBe('ok')
    expect(await loser).toMatchObject({ status: 'rejected', code: 'SESSION_REUSE_DETECTED' })
    if (winner.status !== 'ok') throw new Error('Expected a winning rotation')
    expect((await me(winner.accessToken)).status).toBe(401)
    expect((await refresh(winner.refreshToken)).status).toBe(401)
    expect((await me(otherDevice.accessToken)).status).toBe(401)
    expect((await refresh(otherDevice.refreshToken)).status).toBe(401)
    const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    expect(sessions.every(session => session.revokedAt !== null)).toBe(true)
  })
})

describe('AUTH-P1-002 security lock is irreversible for pre-lock sessions', () => {
  it('an already-validated refresh cannot commit after lock and unlock', async () => {
    const first = await issueTokensWithSession(account, 1)
    let entered!: () => void
    let release!: () => void
    const atTransaction = new Promise<void>(resolve => { entered = resolve })
    const resume = new Promise<void>(resolve => { release = resolve })
    const original = db.transaction.bind(db)
    vi.spyOn(db, 'transaction').mockImplementationOnce(async (callback, config) => {
      entered()
      await resume
      return original(callback, config)
    })
    const pending = rotateRefreshSession(first.refreshToken)
    await atTransaction
    try {
      await updateUserStatus(account.id, 'LOCKED', actorId, parishId, 'lab', 'auth02-test')
      await updateUserStatus(account.id, 'ACTIVE', actorId, parishId, 'lab', 'auth02-test')
    } finally { release() }
    expect(await pending).toMatchObject({ status: 'rejected', code: 'SESSION_INVALID' })
    const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    expect(sessions).toHaveLength(1)
    expect(sessions[0].revokedAt).not.toBeNull()
  })

  it.each(['automatic', 'manual'])('%s lock then unlock requires new credentials', async mode => {
    const first = await issueTokensWithSession(account, 1)
    if (mode === 'automatic') {
      for (let n = 0; n < 5; n++) {
        expect((await auth.request('/login', {
          method: 'POST', headers, body: JSON.stringify({ username: account.username, password: 'Wrong@123', parishId }),
        })).status).toBe(401)
      }
    } else {
      await updateUserStatus(account.id, 'LOCKED', actorId, parishId, 'lab', 'auth02-test')
    }
    const [locked] = await db.select().from(users).where(eq(users.id, account.id))
    expect(locked).toMatchObject({ status: 'LOCKED', tokenVersion: 2 })
    if (mode === 'automatic') expect(locked.failedAttempts).toBe(5)
    const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    expect(sessions.every(session => session.revokedAt !== null)).toBe(true)
    await updateUserStatus(account.id, 'ACTIVE', actorId, parishId, 'lab', 'auth02-test')
    expect((await me(first.accessToken)).status).toBe(401)
    expect((await refresh(first.refreshToken)).status).toBe(401)
    const fresh = await auth.request('/login', {
      method: 'POST', headers, body: JSON.stringify({ username: account.username, password, parishId }),
    })
    expect(fresh.status).toBe(200)
    const body = await fresh.json() as { data: { accessToken: string } }
    expect((await me(body.data.accessToken)).status).toBe(200)
  }, 20000)
})

describe('AUTH-P2-001 cookie-backed logout', () => {
  it.each(['valid', 'expired', 'missing', 'invalid'])('revokes intended session with %s access authority', async access => {
    const first = await issueTokensWithSession(account, 1)
    const second = await issueTokensWithSession(account, 1)
    const accessToken = access === 'valid' ? first.accessToken : access === 'expired'
      ? jwt.sign({ userId: account.id, parishId, role: account.role, tokenVersion: 1 }, process.env.JWT_SECRET!, { expiresIn: -1 })
      : 'invalid'
    const response = await auth.request('/logout', { method: 'POST', headers: {
      ...cookie(first.refreshToken),
      ...(access === 'missing' ? {} : { Authorization: `Bearer ${accessToken}` }),
    } })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(await response.json()).toMatchObject({ data: { serverConfirmed: true, sessionRevoked: true } })
    // Per-device logout does not revoke another device's access or refresh.
    expect((await me(second.accessToken)).status).toBe(200)
    expect((await refresh(second.refreshToken)).status).toBe(200)
    expect((await refresh(first.refreshToken)).status).toBe(401)
  })

  it('CSRF denial leaves the session usable', async () => {
    const first = await issueTokensWithSession(account, 1)
    const response = await auth.request('/logout', { method: 'POST', headers: {
      ...cookie(first.refreshToken), Origin: 'https://attacker.invalid',
    } })
    expect(response.status).toBe(403)
    expect((await refresh(first.refreshToken)).status).toBe(200)
  })

  it('logout with a just-rotated predecessor revokes its successor, not other devices', async () => {
    const first = await issueTokensWithSession(account, 1)
    const other = await issueTokensWithSession(account, 1)
    const successor = await rotateRefreshSession(first.refreshToken)
    expect(successor.status).toBe('ok')
    const response = await auth.request('/logout', { method: 'POST', headers: cookie(first.refreshToken) })
    expect(response.status).toBe(200)
    const sessions = await db.select().from(refreshTokens).where(eq(refreshTokens.parishId, parishId))
    expect(sessions.filter(s => !s.revokedAt)).toHaveLength(1)
    expect((await refresh(other.refreshToken)).status).toBe(200)
    if (successor.status === 'ok') expect((await refresh(successor.refreshToken)).status).toBe(401)
  })
})
