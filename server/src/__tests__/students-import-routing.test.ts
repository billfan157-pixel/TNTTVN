import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import studentsRouter from '../routes/students.js'
import importRouter from '../routes/import.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { generateTokens } from '../middleware/auth.js'

// ADR-016 (routing audit): importRouter phải mount TRƯỚC studentsRouter vì cùng prefix
// /api/students và Hono ưu tiên route đăng ký trước ở cùng độ sâu — nếu mount ngược,
// GET /history + GET /mappings (static 1 segment) bị GET /:id nuốt → luôn 404 NOT_FOUND.
const app = new Hono()
app.route('/api/students', importRouter)
app.route('/api/students', studentsRouter)

const adminId = 'tmp-shadow-admin'
const parishId = 'tmp-shadow-parish'

beforeAll(async () => {
  await db.insert(users).values({
    id: adminId,
    username: 'tmp_shadow_admin',
    fullName: 'TMP',
    passwordHash: 'x',
    role: 'admin',
    parishId,
    status: 'ACTIVE',
    tokenVersion: 1,
  }).onConflictDoNothing()
})

function adminToken() {
  return generateTokens({ userId: adminId, username: 'tmp_shadow_admin', role: 'admin', parishId, tokenVersion: 1 }).accessToken
}

describe('P0-1 regression: import routes không bị /:id shadow', () => {
  it('GET /api/students/history phải trả list import history (200), không phải 404 từ /:id', async () => {
    const res = await app.request('/api/students/history?limit=5', {
      headers: { Authorization: `Bearer ${adminToken()}` },
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.data)).toBe(true)
  })

  it('GET /api/students/mappings phải trả mapping list (200), không phải 404 từ /:id', async () => {
    const res = await app.request('/api/students/mappings?scope=class', {
      headers: { Authorization: `Bearer ${adminToken()}` },
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.data)).toBe(true)
  })

  it('GET /api/students/batch/:batchId trả chi tiết batch (200), không bị /:id nuốt', async () => {
    const res = await app.request('/api/students/batch/NONEXIST', {
      headers: { Authorization: `Bearer ${adminToken()}` },
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(Array.isArray(json.data.rows)).toBe(true)
  })

  it('DELETE /api/students/mappings/:id trả kết quả mapping memory, không bị DELETE /:id nuốt', async () => {
    const res = await app.request('/api/students/mappings/NONEXIST', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken()}` },
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.data.success).toBe(true)
  })

  it('GET /api/students/:id (student thật) vẫn chạy đúng sau khi đảo thứ tự mount', async () => {
    const res = await app.request('/api/students/ST-NOT-EXIST-123', {
      headers: { Authorization: `Bearer ${adminToken()}` },
    })
    expect(res.status).toBe(404)
    const json = (await res.json()) as any
    expect(json.error.code).toBe('NOT_FOUND')
  })
})
