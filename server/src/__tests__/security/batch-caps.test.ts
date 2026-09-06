import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import importRouter from '../../routes/import.js'
import gradesRouter from '../../routes/grades.js'
import attendanceRouter from '../../routes/attendance.js'
import { users } from '../../db/schema.js'
import { db } from '../../db/index.js'
import { generateTokens } from '../../middleware/auth.js'

// SEC-BATCH-CAP-1 (2026-08-24): các mảng batch phải có cap tường minh (.max())
// thay vì chỉ bị chặn gián tiếp bởi bodyLimit 10MB — chống DoS bộ nhớ/CPU.
const app = new Hono()
app.route('/api/students', importRouter)
app.route('/api/grades', gradesRouter)
app.route('/api/attendance', attendanceRouter)

const adminId = 'tmp-cap-admin'
const parishId = 'tmp-cap-parish'

beforeAll(async () => {
  await db.insert(users).values({
    id: adminId,
    username: 'tmp_cap_admin',
    fullName: 'TMP CAP',
    passwordHash: 'x',
    role: 'admin',
    parishId,
    status: 'ACTIVE',
    tokenVersion: 1,
  }).onConflictDoNothing()
})

function adminToken() {
  return generateTokens({ userId: adminId, username: 'tmp_cap_admin', role: 'admin', parishId, tokenVersion: 1 }).accessToken
}

function makeImportRow(i: number) {
  return {
    rowIndex: i,
    holyName: `Tê${i}`,
    fullName: `Học Sinh ${i}`,
    gender: 'Nam',
    dateOfBirth: '2015-01-01',
    parentName: `PH ${i}`,
    parentPhone: '0900000000',
    address: 'Địa chỉ',
    branch: 'Rước Lễ',
    className: 'RL-1',
  }
}

function makeGradePayload(n: number) {
  return {
    grades: Array.from({ length: n }, (_, i) => ({
      studentId: `ST-CAP-${i}`,
      academicYear: '2026-2027',
      semester: 1,
      scoreOral: 7,
    })),
  }
}

describe('SEC-BATCH-CAP-1: batch array caps', () => {
  it('POST /students/validate với >2000 rows → 400', async () => {
    const res = await app.request('/api/students/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ academicYearId: 'cap-test-year', rows: Array.from({ length: 2001 }, (_, i) => makeImportRow(i)) }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /students/import với >2000 rows → 400', async () => {
    const res = await app.request('/api/students/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        academicYearId: 'cap-test-year',
        rows: Array.from({ length: 2001 }, (_, i) => makeImportRow(i)),
        classMappings: {},
        duplicateActions: {},
      }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /grades/batch với >2000 grades → 400', async () => {
    const res = await app.request('/api/grades/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(makeGradePayload(2001)),
    })
    expect(res.status).toBe(400)
  })

  it('POST /attendance/batch với >500 records → 400', async () => {
    const res = await app.request('/api/attendance/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: '2026-08-24',
        type: 'CatechismClass',
        records: Array.from({ length: 501 }, (_, i) => ({
          studentId: `ST-ATT-${i}`,
          status: 'Present',
        })),
      }),
    })
    expect(res.status).toBe(400)
  })
})
