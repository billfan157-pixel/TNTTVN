import { describe, it, expect, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { generateTokens } from '../middleware/auth.js'
import auditLogsApp from '../routes/auditLogs.js'
import { db } from '../db/index.js'
import { users, auditLogs } from '../db/schema.js'

const parishId = 'parish-audit-enhanced'
const adminToken = generateTokens({ userId: 'usr-enh-admin', username: 'enh_admin', role: 'admin', parishId }).accessToken
const cnToken = generateTokens({ userId: 'usr-enh-cn', username: 'enh_cn', role: 'chunhiem', parishId }).accessToken

async function jsonReq(app: any, path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`
  const res = await app.request(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  let body: any = null
  try { body = (await res.json()) as any } catch {}
  return { status: res.status, body }
}

describe('Audit Logs Enhanced API (Search, Metrics, Integrity, Severity)', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('Test@123456', 10)
    await db.insert(users).values([
      { id: 'usr-enh-admin', username: 'enh_admin', fullName: 'Admin Enhanced', passwordHash, role: 'admin', parishId },
      { id: 'usr-enh-cn', username: 'enh_cn', fullName: 'Chủ Nhiệm Enhanced', passwordHash, role: 'chunhiem', parishId },
    ]).onConflictDoNothing()

    const now = new Date().toISOString()
    await db.insert(auditLogs).values([
      {
        id: 'aud-enh-01',
        userId: 'usr-enh-admin',
        action: 'CREATE_USER',
        entityType: 'user',
        entityId: 'usr-created-01',
        oldValue: null,
        newValue: JSON.stringify({ username: 'newbie' }),
        ip: '192.168.1.100',
        parishId,
        createdAt: now,
      },
      {
        id: 'aud-enh-02',
        userId: 'usr-enh-admin',
        action: 'DELETE',
        entityType: 'student',
        entityId: 'st-deleted-99',
        oldValue: JSON.stringify({ fullName: 'Old Student' }),
        newValue: null,
        ip: '192.168.1.101',
        parishId,
        createdAt: now,
      },
      {
        id: 'aud-enh-03',
        userId: 'usr-enh-cn',
        action: 'LOGIN_FAILED',
        entityType: 'auth',
        entityId: 'usr-enh-cn',
        oldValue: null,
        newValue: JSON.stringify({ reason: 'wrong password' }),
        ip: '10.0.0.5',
        parishId,
        createdAt: now,
      },
    ]).onConflictDoNothing()
  })

  it('rejects non-admin access to audit logs', async () => {
    const res = await jsonReq(auditLogsApp, '/', { token: cnToken })
    expect(res.status).toBe(403)
  })

  it('filters audit logs using multi-field search parameter', async () => {
    // Search by IP
    const resIp = await jsonReq(auditLogsApp, '/?search=192.168.1.100', { token: adminToken })
    expect(resIp.status).toBe(200)
    expect(resIp.body.data.length).toBeGreaterThanOrEqual(1)
    expect(resIp.body.data[0].ip).toBe('192.168.1.100')

    // Search by Action / Keyword
    const resAction = await jsonReq(auditLogsApp, '/?search=LOGIN_FAILED', { token: adminToken })
    expect(resAction.status).toBe(200)
    expect(resAction.body.data.some((l: any) => l.action === 'LOGIN_FAILED')).toBe(true)

    // Search by User Name
    const resUser = await jsonReq(auditLogsApp, '/?search=Chủ Nhiệm Enhanced', { token: adminToken })
    expect(resUser.status).toBe(200)
    expect(resUser.body.data.length).toBeGreaterThanOrEqual(1)
  })

  it('filters audit logs by severity levels', async () => {
    // Critical (DELETE, PURGE, etc.)
    const resCritical = await jsonReq(auditLogsApp, '/?severity=critical', { token: adminToken })
    expect(resCritical.status).toBe(200)
    expect(resCritical.body.data.every((l: any) => l.action.includes('DELETE') || l.action === 'SYSTEM_PURGE')).toBe(true)

    // Warning (LOGIN_FAILED, etc.)
    const resWarning = await jsonReq(auditLogsApp, '/?severity=warning', { token: adminToken })
    expect(resWarning.status).toBe(200)
    expect(resWarning.body.data.every((l: any) => l.action === 'LOGIN_FAILED' || l.action.includes('PASSWORD_RESET'))).toBe(true)
  })

  it('returns activity metrics from GET /api/audit-logs/metrics', async () => {
    const res = await jsonReq(auditLogsApp, '/metrics', { token: adminToken })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.total24h).toBeGreaterThanOrEqual(3)
    expect(res.body.data.destructiveActions24h).toBeGreaterThanOrEqual(1)
    expect(res.body.data.securityAlerts24h).toBeGreaterThanOrEqual(1)
  })

  it('verifies cryptographic hash chain from GET /api/audit-logs/verify-integrity', async () => {
    const res = await jsonReq(auditLogsApp, '/verify-integrity?limit=50', { token: adminToken })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe('VERIFIED')
    expect(res.body.data.verifiedCount).toBeGreaterThanOrEqual(3)
    expect(res.body.data.chainRoot).toMatch(/^[a-f0-9]{64}$/)
  })
})
