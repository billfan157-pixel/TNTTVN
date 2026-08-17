import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import usersApp from '../routes/users.js'
import { generateTokens } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { users, auditLogs } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

// Test cipher key — bật mã hóa pass tạm (password_encrypted) cho reveal-password tests
process.env.PASSWORD_CIPHER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const TEST_USERNAME = `dup_route_${Date.now()}`

// A05 (2026-08-10): admin dành riêng để test re-authentication. Không dùng USR-001
// (đó là superadmin — getSuperAdminId() mặc định) và không seed bcrypt 'hash' giả
// như global-setup — mật khẩu này phải khớp bcrypt.compare thật.
const REVEAL_ADMIN_ID = 'USR-REVEAL-ADMIN'
const REVEAL_ADMIN_PASSWORD = 'AdminXacNhan@123'

function adminHeaders() {
  const { accessToken } = generateTokens({
    userId: 'USR-001',
    username: 'admin',
    role: 'admin',
    parishId: 'gia-ton',
    tokenVersion: 1,
  })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

function revealAdminHeaders() {
  const { accessToken } = generateTokens({
    userId: REVEAL_ADMIN_ID,
    username: 'reveal-admin',
    role: 'admin',
    parishId: 'gia-ton',
    tokenVersion: 1,
  })
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
}

describe('Server Users Route Handler Tests', () => {
  beforeAll(async () => {
    await db.insert(users).values({
      id: REVEAL_ADMIN_ID,
      username: 'reveal-admin',
      fullName: 'Reveal Test Admin',
      passwordHash: bcrypt.hashSync(REVEAL_ADMIN_PASSWORD, 10),
      role: 'admin',
      status: 'ACTIVE',
      parishId: 'gia-ton',
      tokenVersion: 1,
      createdAt: new Date().toISOString(),
    })
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.username, TEST_USERNAME))
    await db.delete(users).where(eq(users.id, REVEAL_ADMIN_ID))
    await db.delete(auditLogs).where(eq(auditLogs.userId, REVEAL_ADMIN_ID))
  })

  it('blocks unauthenticated GET / request with 401', async () => {
    const res = await usersApp.request('/')
    expect(res.status).toBe(401)
  })

  it('blocks unauthenticated POST / request with 401', async () => {
    const res = await usersApp.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', fullName: 'Test User', role: 'chunhiem' }),
    })
    expect(res.status).toBe(401)
  })

  it('creates a user and returns the temp password', async () => {
    const res = await usersApp.request('/', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ username: TEST_USERNAME, fullName: 'Test Route', role: 'phuta' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as any
    expect(body.data.username).toBe(TEST_USERNAME)
    expect(body.data.tempPassword).toMatch(/^Parish@\d{6}$/)
  })

  it('returns 409 when username already exists (not 500)', async () => {
    const res = await usersApp.request('/', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ username: TEST_USERNAME, fullName: 'Test Route Dup', role: 'phuta' }),
    })
    expect(res.status).toBe(409)
    const body = (await res.json()) as any
    expect(body.error.code).toBe('USERNAME_EXISTS')
    expect(body.error.message).toMatch(/đã tồn tại/)
  })

  it('does NOT expose decrypted password in the user list (ADR-021 rewrite)', async () => {
    const res = await usersApp.request('/', { headers: adminHeaders() })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    const created = (body.data || []).find((u: any) => u.username === TEST_USERNAME)
    expect(created).toBeDefined()
    // Plaintext không bao giờ nằm trong GET — chỉ cờ hasPasswordCopy cho UI.
    expect(created.password).toBeUndefined()
    expect(created.passwordHash).toBeUndefined()
    expect(created.passwordEncrypted).toBeUndefined()
    expect(created.hasPasswordCopy).toBe(true)
  })

  it('reveal-password returns 404 for a non-existent user (với pass admin hợp lệ)', async () => {
    const reveal = await usersApp.request('/USR-nonexistent/reveal-password', {
      method: 'POST',
      headers: revealAdminHeaders(),
      body: JSON.stringify({ adminPassword: REVEAL_ADMIN_PASSWORD }),
    })
    expect(reveal.status).toBe(404)
  })

  it('reveal-password returns the temp password for an admin-created user', async () => {
    const list = await usersApp.request('/', { headers: adminHeaders() })
    const body = (await list.json()) as any
    const created = (body.data || []).find((u: any) => u.username === TEST_USERNAME)
    expect(created).toBeDefined()

    const reveal = await usersApp.request(`/${created.id}/reveal-password`, {
      method: 'POST',
      headers: revealAdminHeaders(),
      body: JSON.stringify({ adminPassword: REVEAL_ADMIN_PASSWORD }),
    })
    expect(reveal.status).toBe(200)
    const revealBody = (await reveal.json()) as any
    expect(revealBody.data.username).toBe(TEST_USERNAME)
    expect(revealBody.data.password).toMatch(/^Parish@\d{6}$/)
  })

  it('A05: reveal-password với mật khẩu admin SAI → 401 INVALID_ADMIN_PASSWORD + audit REVEAL_PASSWORD_FAILED', async () => {
    const list = await usersApp.request('/', { headers: adminHeaders() })
    const body = (await list.json()) as any
    const created = (body.data || []).find((u: any) => u.username === TEST_USERNAME)
    expect(created).toBeDefined()

    const reveal = await usersApp.request(`/${created.id}/reveal-password`, {
      method: 'POST',
      headers: revealAdminHeaders(),
      body: JSON.stringify({ adminPassword: 'SaiMatKhau@123' }),
    })
    expect(reveal.status).toBe(401)
    const err = (await reveal.json()) as any
    expect(err.error.code).toBe('INVALID_ADMIN_PASSWORD')

    const [auditRow] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, REVEAL_ADMIN_ID), eq(auditLogs.action, 'REVEAL_PASSWORD_FAILED'), eq(auditLogs.entityId, created.id)))
      .limit(1)
    expect(auditRow).toBeDefined()
    expect(auditRow!.parishId).toBe('gia-ton')
  })

  it('A05: reveal-password thiếu adminPassword → 400', async () => {
    const list = await usersApp.request('/', { headers: adminHeaders() })
    const body = (await list.json()) as any
    const created = (body.data || []).find((u: any) => u.username === TEST_USERNAME)
    expect(created).toBeDefined()

    const reveal = await usersApp.request(`/${created.id}/reveal-password`, {
      method: 'POST',
      headers: revealAdminHeaders(),
      body: JSON.stringify({}),
    })
    expect(reveal.status).toBe(400)
  })

  it('A05: reveal-password với adminPassword rỗng → 400', async () => {
    const list = await usersApp.request('/', { headers: adminHeaders() })
    const body = (await list.json()) as any
    const created = (body.data || []).find((u: any) => u.username === TEST_USERNAME)
    expect(created).toBeDefined()

    const reveal = await usersApp.request(`/${created.id}/reveal-password`, {
      method: 'POST',
      headers: revealAdminHeaders(),
      body: JSON.stringify({ adminPassword: '' }),
    })
    expect(reveal.status).toBe(400)
  })

  it('A05: reveal-password nhắm vào superadmin (USR-001) → 403 FORBIDDEN', async () => {
    const reveal = await usersApp.request('/USR-001/reveal-password', {
      method: 'POST',
      headers: revealAdminHeaders(),
      body: JSON.stringify({ adminPassword: REVEAL_ADMIN_PASSWORD }),
    })
    expect(reveal.status).toBe(403)
    const err = (await reveal.json()) as any
    expect(err.error.code).toBe('FORBIDDEN')
  })

  it('A05+A10: reveal-password với admin LOCKED → 401 NGAY ở middleware (không đổi status)', async () => {
    await db
      .update(users)
      .set({ status: 'LOCKED' })
      .where(eq(users.id, REVEAL_ADMIN_ID))

    try {
      const list = await usersApp.request('/', { headers: adminHeaders() })
      const body = (await list.json()) as any
      const created = (body.data || []).find((u: any) => u.username === TEST_USERNAME)
      expect(created).toBeDefined()

      const reveal = await usersApp.request(`/${created.id}/reveal-password`, {
        method: 'POST',
        headers: revealAdminHeaders(),
        body: JSON.stringify({ adminPassword: REVEAL_ADMIN_PASSWORD }),
      })
expect(reveal.status).toBe(401) // A10: middleware chặn LOCKED từ đầu (không tới verifyAdminReauth)
    } finally {
      await db
        .update(users)
        .set({ status: 'ACTIVE' })
        .where(eq(users.id, REVEAL_ADMIN_ID))
    }
  })

  // ─── A06 (2026-08-10): reset-password — re-authentication ───

  it('A06: reset-password trả pass tạm mới với adminPassword hợp lệ + audit RESET_PASSWORD', async () => {
    const list = await usersApp.request('/', { headers: adminHeaders() })
    const body = (await list.json()) as any
    const created = (body.data || []).find((u: any) => u.username === TEST_USERNAME)
    expect(created).toBeDefined()

    const reset = await usersApp.request(`/${created.id}/reset-password`, {
      method: 'POST',
      headers: revealAdminHeaders(),
      body: JSON.stringify({ adminPassword: REVEAL_ADMIN_PASSWORD }),
    })
    expect(reset.status).toBe(200)
    const resetBody = (await reset.json()) as any
    expect(resetBody.data.username).toBe(TEST_USERNAME)
    expect(resetBody.data.tempPassword).toMatch(/^Reset@\d{6}$/)

    const [auditRow] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, REVEAL_ADMIN_ID), eq(auditLogs.action, 'RESET_PASSWORD'), eq(auditLogs.entityId, created.id)))
      .limit(1)
    expect(auditRow).toBeDefined()
    expect(auditRow!.parishId).toBe('gia-ton')
  })

  it('A06: reset-password với adminPassword SAI → 401 INVALID_ADMIN_PASSWORD + audit RESET_PASSWORD_FAILED', async () => {
    const list = await usersApp.request('/', { headers: adminHeaders() })
    const body = (await list.json()) as any
    const created = (body.data || []).find((u: any) => u.username === TEST_USERNAME)
    expect(created).toBeDefined()

    const reset = await usersApp.request(`/${created.id}/reset-password`, {
      method: 'POST',
      headers: revealAdminHeaders(),
      body: JSON.stringify({ adminPassword: 'SaiMatKhau@123' }),
    })
    expect(reset.status).toBe(401)
    const err = (await reset.json()) as any
    expect(err.error.code).toBe('INVALID_ADMIN_PASSWORD')

    const [auditRow] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, REVEAL_ADMIN_ID), eq(auditLogs.action, 'RESET_PASSWORD_FAILED'), eq(auditLogs.entityId, created.id)))
      .limit(1)
    expect(auditRow).toBeDefined()
  })

  it('A06: reset-password thiếu adminPassword → 400', async () => {
    const list = await usersApp.request('/', { headers: adminHeaders() })
    const body = (await list.json()) as any
    const created = (body.data || []).find((u: any) => u.username === TEST_USERNAME)
    expect(created).toBeDefined()

    const reset = await usersApp.request(`/${created.id}/reset-password`, {
      method: 'POST',
      headers: revealAdminHeaders(),
      body: JSON.stringify({}),
    })
    expect(reset.status).toBe(400)
  })

  it('A06: reset-password nhắm vào superadmin (USR-001) → 403 FORBIDDEN', async () => {
    const reset = await usersApp.request('/USR-001/reset-password', {
      method: 'POST',
      headers: revealAdminHeaders(),
      body: JSON.stringify({ adminPassword: REVEAL_ADMIN_PASSWORD }),
    })
    expect(reset.status).toBe(403)
    const err = (await reset.json()) as any
    expect(err.error.code).toBe('FORBIDDEN')
  })
})