import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { ErrorCode } from '../utils/response.js'
import backupRouter from '../routes/backup.js'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import { generateTokens } from '../middleware/auth.js'

describe('Production Hardening Integration & Unit Tests', () => {
  it('1. ErrorCode enum exports all standardized error constants', () => {
    expect(ErrorCode.GRADE_LOCKED).toBe('GRADE_LOCKED')
    expect(ErrorCode.SEMESTER_LOCKED).toBe('SEMESTER_LOCKED')
    expect(ErrorCode.STATE_TRANSITION_INVALID).toBe('STATE_TRANSITION_INVALID')
    expect(ErrorCode.BACKUP_CHECKSUM_INVALID).toBe('BACKUP_CHECKSUM_INVALID')
  })

  it('2. GET /api/backup/export generates valid SHA256 checksum', async () => {
    // A07: export yêu cầu re-authentication — admin cần bcrypt hash hợp lệ
    const ADMIN_PASSWORD = 'HardeningAdmin@123'
    const adminId = generateId('USR')
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4)
    await db.insert(users).values({
      id: adminId,
      username: `admin_hard_${Date.now()}`,
      passwordHash,
      fullName: 'Admin Hardening Test',
      role: 'admin',
      parishId: 'gia-ton',
      status: 'ACTIVE',
      tokenVersion: 1,
    }).onConflictDoNothing()

    const { accessToken } = generateTokens({
      userId: adminId,
      username: 'admin_hard',
      role: 'admin',
      parishId: 'gia-ton',
      tokenVersion: 1,
    })

    // A-NEW-28 (2026-08-11): export POST body (trước GET ?adminPassword trong URL)
    const res = await backupRouter.request('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.checksum).toBeDefined()
    expect(json.checksum.length).toBe(64) // SHA256 hex length
  })

  it('3. POST /api/backup/restore verifies SHA256 checksum', async () => {
    // A07 + A19: restore yêu cầu re-authentication; checksum BẮT BUỘC (format
    // SHA256 hex64) + parish phải khớp — sai checksum (đúng format) vẫn phải 400
    // chứ không phải 401/400 schema.
    const ADMIN_PASSWORD = 'HardeningAdmin@456'
    const adminId = generateId('USR')
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 4)
    await db.insert(users).values({
      id: adminId,
      username: `admin_hard2_${Date.now()}`,
      passwordHash,
      fullName: 'Admin Hardening Test 2',
      role: 'admin',
      parishId: 'gia-ton',
      status: 'ACTIVE',
      tokenVersion: 1,
    }).onConflictDoNothing()

    const { accessToken } = generateTokens({
      userId: adminId,
      username: 'admin_hard2',
      role: 'admin',
      parishId: 'gia-ton',
      tokenVersion: 1,
    })

    // Corrupted payload with invalid checksum (đúng format SHA256 hex64 → đi tới
    // bước verify checksum, không bị chặn bởi schema validator)
    const corruptedPayload = {
      version: '2.0-production',
      adminPassword: ADMIN_PASSWORD,
      parish: 'gia-ton',
      exportedAt: new Date().toISOString(),
      checksum: 'a'.repeat(64),
      data: {
        students: [{ id: 'ST-FAKE', code: 'ST-FAKE-01', fullName: 'Fake Student', gender: 'Nam', dateOfBirth: '2015-01-01', branch: 'AuNhi', classId: 'cls-test', status: 'Đang học', parishId: 'gia-ton' }],
        grades: [],
        attendance: [],
        classes: [],
        semesterLocks: [],
        gradeOverrides: [],
        promotionSnapshots: [],
        examSessions: [],
        examResults: [],
      }
    }

    const res = await backupRouter.request('/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(corruptedPayload)
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.error).toContain('Checksum')
  })
})
