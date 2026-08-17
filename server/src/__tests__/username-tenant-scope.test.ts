import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import authApp from '../routes/auth.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { and, eq, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { createUser } from '../services/userService.js'

const PASSWORD = 'Parish@123456'
const PARISH_A = 'parish-username-a'
const PARISH_B = 'parish-username-b'
const USERNAME_SHARED = 'same_username_both_parishes'
const USERNAME_GIA_TON = 'gia_ton_default_user'

/**
 * ADR-046 (2026-08-16): users.username UNIQUE toàn cục → composite (parish_id, username).
 * Migration 20260816-121 drop `users_username_unique`, tạo `idx_users_username_parish`.
 * Login (POST /api/auth/login) lookup scoped theo parishId (body, optional default 'gia-ton').
 */
describe('ADR-046: users.username unique per parish + login scoped theo parish', () => {
  beforeAll(async () => {
    const hash = await bcrypt.hash(PASSWORD, 4)
    const now = new Date().toISOString()
    await db.insert(users).values([
      { id: 'usr-u-a', username: USERNAME_SHARED, passwordHash: hash, fullName: 'User A', role: 'chunhiem', parishId: PARISH_A, status: 'ACTIVE', tokenVersion: 1, createdAt: now },
      { id: 'usr-u-b', username: USERNAME_SHARED, passwordHash: hash, fullName: 'User B', role: 'chunhiem', parishId: PARISH_B, status: 'ACTIVE', tokenVersion: 1, createdAt: now },
      { id: 'usr-u-gia', username: USERNAME_GIA_TON, passwordHash: hash, fullName: 'Gia Ton User', role: 'chunhiem', parishId: 'gia-ton', status: 'ACTIVE', tokenVersion: 1, createdAt: now },
      { id: 'usr-u-admin', username: 'admin_username_scope', passwordHash: hash, fullName: 'Admin Scope', role: 'admin', parishId: PARISH_B, status: 'ACTIVE', tokenVersion: 1, createdAt: now },
    ]).onConflictDoNothing()
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.username, USERNAME_SHARED))
    await db.delete(users).where(eq(users.username, USERNAME_GIA_TON))
    await db.delete(users).where(eq(users.username, 'cross_parish_user'))
    await db.delete(users).where(eq(users.username, 'admin_username_scope'))
  })

  it('1. Migration 121: composite unique index tồn tại, global unique index đã bị drop', async () => {
    const res = await db.run(sql`SELECT name FROM sqlite_master WHERE type='index'`)
    const names = (res.rows as any[]).map(r => r[0] || r.name)
    expect(names).toContain('idx_users_username_parish')
    expect(names).not.toContain('users_username_unique')
  })

  it('2. DB-level: cùng username ở 2 parish khác nhau insert được; trùng trong cùng parish bị reject', async () => {
    await db.insert(users).values({
      id: 'usr-u-ok', username: USERNAME_SHARED, passwordHash: 'x', fullName: 'OK', role: 'phuta', parishId: 'parish-username-c', status: 'ACTIVE', tokenVersion: 1,
    }).onConflictDoNothing()

    await expect(
      db.insert(users).values({
        id: 'usr-dup-a', username: USERNAME_SHARED, passwordHash: 'x', fullName: 'Dup A', role: 'phuta', parishId: PARISH_A, status: 'ACTIVE', tokenVersion: 1,
      })
    ).rejects.toThrow()

    await db.delete(users).where(and(eq(users.id, 'usr-u-ok'), eq(users.parishId, 'parish-username-c')))
  })

  it('3. Login scoped: cùng username 2 parish — gửi parishId đúng → đúng user; sai parish → 401', async () => {
    const okA = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME_SHARED, password: PASSWORD, parishId: PARISH_A }),
    })
    expect(okA.status).toBe(200)
    const jsonA = (await okA.json()) as any
    expect(jsonA.data.user.parishId).toBe(PARISH_A)
    expect(jsonA.data.user.id).toBe('usr-u-a')

    const okB = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME_SHARED, password: PASSWORD, parishId: PARISH_B }),
    })
    expect(okB.status).toBe(200)
    const jsonB = (await okB.json()) as any
    expect(jsonB.data.user.parishId).toBe(PARISH_B)
    expect(jsonB.data.user.id).toBe('usr-u-b')

    const wrongParish = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME_SHARED, password: PASSWORD, parishId: 'parish-username-c' }),
    })
    expect(wrongParish.status).toBe(401)
  })

  it('4. Login không gửi parishId → mặc định gia-ton (backward-compatible)', async () => {
    const res = await authApp.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME_GIA_TON, password: PASSWORD }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.data.user.parishId).toBe('gia-ton')
  })

  it('5. createUser: cùng username ở parish khác OK; trùng trong cùng parish → null (409)', async () => {
    const created = await createUser(
      { username: 'cross_parish_user', fullName: 'Cross Parish', role: 'chunhiem', holyName: 'Phê-rô' },
      'usr-u-admin', PARISH_B, '127.0.0.1', 'test',
    )
    expect(created).not.toBeNull()
    expect(created!.username).toBe('cross_parish_user')

    const dupSameParish = await createUser(
      { username: 'cross_parish_user', fullName: 'Cross Parish', role: 'chunhiem', holyName: 'Phê-rô' },
      'usr-u-admin', PARISH_B, '127.0.0.1', 'test',
    )
    expect(dupSameParish).toBeNull()

    const otherParish = await createUser(
      { username: 'cross_parish_user', fullName: 'Cross Parish', role: 'chunhiem', holyName: 'Phê-rô' },
      'usr-u-admin', PARISH_A, '127.0.0.1', 'test',
    )
    expect(otherParish).not.toBeNull()
    expect(otherParish!.username).toBe('cross_parish_user')
    await db.delete(users).where(and(eq(users.username, 'cross_parish_user'), eq(users.parishId, PARISH_A)))
  })
})