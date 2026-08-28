import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import bcrypt from 'bcryptjs'
import systemApp from '../routes/system.js'
import { generateTokens } from '../middleware/auth.js'
import { db, client } from '../db/index.js'
import { users, branches, auditLogs, systemSettings } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { PURGE_TABLES, PURGE_VERSION_KEY, DEFAULT_PURGE_VERSION } from '../services/purgeService.js'

describe('Purge v2.3 — Xóa Toàn Bộ Dữ Liệu Giáo Xứ', () => {
  const parishId = 'parish-purge-test'
  const adminId = 'usr-purge-admin'
  const nonAdminId = 'usr-purge-phuta'
  const ADMIN_PASSWORD = 'purge-pass-123'
  const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 10)

  const seedIds = {
    academicYear: 'AY-PURGE-001',
    branch: 'BR-PURGE-001',
    class: 'CLS-PURGE-001',
    student: 'ST-PURGE-001',
    grade: 'GR-PURGE-001',
    assessment: 'ASM-PURGE-001',
  }

  beforeAll(async () => {
    const now = new Date().toISOString()

    await db.insert(users).values([
      { id: adminId, username: 'purge_admin', fullName: 'Purge Admin', passwordHash: adminHash, role: 'admin', parishId, tokenVersion: 1, status: 'ACTIVE', createdAt: now },
      { id: nonAdminId, username: 'purge_phuta', fullName: 'Purge Phu Ta', passwordHash: adminHash, role: 'phuta', parishId, tokenVersion: 1, status: 'ACTIVE', createdAt: now },
    ]).onConflictDoNothing()

    await db.insert(branches).values({
      id: seedIds.branch,
      name: 'Thiếu Nhi Test',
      scarfColor: '#000000',
      ageMin: 9,
      ageMax: 15,
      parishId,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing()

    // Dữ liệu nghiệp vụ sẽ bị purge
    await client.execute(`INSERT OR IGNORE INTO academic_years (id, start_date, end_date, is_locked, status, current_semester, parish_id, created_at, updated_at) VALUES (?, '2026-01-01', '2026-12-31', 0, 'OPEN', 1, ?, ?, ?)`, [seedIds.academicYear, parishId, now, now])
    await client.execute(`INSERT OR IGNORE INTO classes (id, code, name, branch_id, academic_year_id, parish_id, created_at, updated_at) VALUES (?, 'TN1', 'Thiếu Nhi 1', ?, ?, ?, ?, ?)`, [seedIds.class, seedIds.branch, seedIds.academicYear, parishId, now, now])
    await client.execute(`INSERT OR IGNORE INTO students (id, code, holy_name, full_name, gender, date_of_birth, parent_name, parent_phone, address, branch, class_id, status, parish_id, created_at, updated_at) VALUES (?, 'TN-0001', 'Gioan', 'Nguyễn Văn A', 'Nam', '2012-01-01', 'Bố A', '0900000000', 'Địa chỉ', 'ThieuNhi', ?, 'Đang học', ?, ?, ?)`, [seedIds.student, seedIds.class, parishId, now, now])
    await client.execute(`INSERT OR IGNORE INTO grades (id, student_id, academic_year, semester, score_final, version, parish_id, created_at, updated_at) VALUES (?, ?, '2026-2027', 1, 8.5, 1, ?, ?, ?)`, [seedIds.grade, seedIds.student, parishId, now, now])
    await client.execute(`INSERT OR IGNORE INTO attendance (id, student_id, date, type, status, version, parish_id, created_at, updated_at) VALUES ('AT-PURGE-001', ?, '2026-01-01', 'CatechismClass', 'Present', 1, ?, ?, ?)`, [seedIds.student, parishId, now, now])
    await client.execute(`INSERT OR IGNORE INTO notices (id, title, content, date, author, priority, parish_id, created_at, updated_at) VALUES ('NC-PURGE-001', 'Test', 'Nội dung', '2026-01-01', 'Admin', 'normal', ?, ?, ?)`, [parishId, now, now])
    await client.execute(`INSERT OR IGNORE INTO semester_locks (id, parish_id, academic_year, semester, is_locked, created_at, updated_at) VALUES ('SML-PURGE-001', ?, '2026-2027', 1, 1, ?, ?)`, [parishId, now, now])
    // docs/AUDIT P4: outbox_messages mang parish_id (migration 097) — thuộc tenant test.
    await client.execute(`INSERT OR IGNORE INTO outbox_messages (id, aggregate_id, event_type, payload, status, sequence_number, parish_id, created_at) VALUES ('OUT-PURGE-001', 'x', 'GradeSaved', '{}', 'pending', 1, ?, ?)`, [parishId, now])
    await client.execute(`INSERT OR IGNORE INTO mapping_memory (id, parish_id, scope, alias, entity_id, is_active, created_by, created_at) VALUES ('MM-PURGE-001', ?, 'class', 'TN1 cũ', ?, 1, ?, ?)`, [parishId, seedIds.class, adminId, now])
    await client.execute(`INSERT OR IGNORE INTO service_assignments (id, student_id, service_type, parish_id, created_at, created_by) VALUES ('SA-PURGE-001', ?, 'le_phuc_vu', ?, ?, ?)`, [seedIds.student, parishId, now, adminId])
    await client.execute(`INSERT OR IGNORE INTO assessments (id, name, type, weight, semester, academic_year_id, parish_id, created_at, updated_at) VALUES (?, 'Kiểm tra miệng', 'ORAL', 1.0, 1, ?, ?, ?, ?)`, [seedIds.assessment, seedIds.academicYear, parishId, now, now])
    await client.execute(`INSERT OR IGNORE INTO attendance_sessions (id, class_id, date, type, status, parish_id, created_at, updated_at) VALUES ('ATT-PURGE-001', ?, '2026-01-01', 'CatechismClass', 'OPEN', ?, ?, ?)`, [seedIds.class, parishId, now, now])
    await client.execute(`INSERT OR IGNORE INTO promotion_records (id, student_id, parish_id, academic_year, target_class_id, auto_decision, final_decision, gpa_snapshot, attendance_snapshot, rules_version, approved_by, approved_at, version, is_latest, created_at, updated_at) VALUES ('PRM-PURGE-001', ?, ?, '2025-2026', ?, 'PROMOTED', 'PROMOTED', 8.0, 95, 'v1.0', ?, ?, 1, 1, ?, ?)`, [seedIds.student, parishId, seedIds.class, adminId, now, now, now])
    await client.execute(`INSERT OR IGNORE INTO catechist_assignments (id, user_id, class_id, role_in_class, parish_id, created_at, updated_at) VALUES ('ASG-PURGE-001', ?, ?, 'chunhiem', ?, ?, ?)`, [adminId, seedIds.class, parishId, now, now])
    await client.execute(`INSERT OR IGNORE INTO notifications (id, student_id, type, channel, status, recipient, triggered_by_type, parish_id, created_at) VALUES ('NOT-PURGE-001', ?, 'telegram', 'absence', 'sent', '123', 'system', ?, ?)`, [seedIds.student, parishId, now])
    await client.execute(`INSERT OR IGNORE INTO grade_overrides (id, grade_id, parish_id, score_field, manual_value, overridden_by, overridden_at, version, created_at, updated_at) VALUES ('GROV-PURGE-001', ?, ?, 'scoreFinal', 9.0, ?, ?, 1, ?, ?)`, [seedIds.grade, parishId, adminId, now, now, now])
    await client.execute(`INSERT OR IGNORE INTO import_batches (id, user_id, file_name, total_rows, imported, skipped, error_count, status, parish_id, created_at) VALUES ('IMP-PURGE-001', ?, 'test.xlsx', 1, 1, 0, 0, 'completed', ?, ?)`, [adminId, parishId, now])
    await client.execute(`INSERT OR IGNORE INTO import_batch_students (id, batch_id, student_id, action, row_index, parish_id, created_at) VALUES ('IBS-PURGE-001', 'IMP-PURGE-001', ?, 'created', 0, ?, ?)`, [seedIds.student, parishId, now])
    await client.execute(`INSERT OR IGNORE INTO grade_import_hashes (id, hash, class_id, semester, academic_year, total_rows, user_id, parish_id, created_at) VALUES ('GIH-PURGE-001', 'hash-1', ?, 1, '2026-2027', 5, ?, ?, ?)`, [seedIds.class, adminId, parishId, now])
    await client.execute(`INSERT OR IGNORE INTO academic_year_snapshots (id, parish_id, academic_year_id, student_id, year_gpa, classification, generated_by, generated_at, created_at, updated_at) VALUES ('SNA-PURGE-001', ?, ?, ?, 8.5, 'Gioi', ?, ?, ?, ?)`, [parishId, seedIds.academicYear, seedIds.student, adminId, now, now, now])
  })

  afterAll(async () => {
    // Dọn dữ liệu test (chỉ các bảng KHÔNG bị purge)
    await db.delete(users).where(eq(users.parishId, parishId))
    await db.delete(branches).where(eq(branches.parishId, parishId))
    await db.delete(auditLogs).where(and(eq(auditLogs.parishId, parishId), eq(auditLogs.entityType, 'system')))
    await db.delete(systemSettings).where(eq(systemSettings.parishId, parishId))
  })

  const adminToken = () => generateTokens({ userId: adminId, username: 'purge_admin', role: 'admin', parishId, tokenVersion: 1 }).accessToken
  const phutaToken = () => generateTokens({ userId: nonAdminId, username: 'purge_phuta', role: 'phuta', parishId, tokenVersion: 1 }).accessToken

  it('403 — người không phải admin không được purge', async () => {
    const res = await systemApp.request('/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${phutaToken()}` },
      body: JSON.stringify({ password: ADMIN_PASSWORD, confirmKey: 'XÓA TẤT CẢ' }),
    })
    expect(res.status).toBe(403)
  })

  it('401 — sai mật khẩu, không xóa gì', async () => {
    const res = await systemApp.request('/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ password: 'sai-mat-khau', confirmKey: 'XÓA TẤT CẢ' }),
    })
    expect(res.status).toBe(401)
    const json = (await res.json()) as any
    expect(json.error.code).toBe('INVALID_PASSWORD')

    const student = await client.execute(`SELECT count(*) AS n FROM students WHERE parish_id = ?`, [parishId])
    expect(Number(((student.rows?.[0] as any)?.n) ?? 0)).toBe(1)
  })

  it('400 — sai chuỗi xác nhận', async () => {
    const res = await systemApp.request('/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ password: ADMIN_PASSWORD, confirmKey: 'XOA TAT CA' }),
    })
    expect(res.status).toBe(400)
    const json = (await res.json()) as any
    expect(json.error.code).toBe('INVALID_CONFIRM_KEY')
  })

  it('200 — purge thành công: 24 bảng về 0, bảng hệ thống giữ nguyên, purge_version tăng', async () => {
    const res = await systemApp.request('/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}` },
      body: JSON.stringify({ password: ADMIN_PASSWORD, confirmKey: 'XÓA TẤT CẢ' }),
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as any
    expect(json.data.success).toBe(true)
    expect(json.data.countsBefore.students).toBe(1)
    expect(json.data.countsBefore.grades).toBe(1)
    expect(json.data.purgeVersion).toBeGreaterThanOrEqual(DEFAULT_PURGE_VERSION + 1)

    // 24 bảng purge về 0 — mọi bảng đều scoped theo parish_id (P4: không còn
    // special-case grade_overrides/outbox_messages)
    for (const table of PURGE_TABLES) {
      const r = await client.execute(`SELECT count(*) AS n FROM ${table} WHERE parish_id = ?`, [parishId])
      const count = Number((r.rows?.[0] as any)?.n ?? 0)
      expect(count, `bảng ${table} phải về 0`).toBe(0)
    }

    // Bảng giữ nguyên: users, branches
    const usr = await client.execute(`SELECT count(*) AS n FROM users WHERE parish_id = ?`, [parishId])
    expect(Number(((usr.rows?.[0] as any)?.n) ?? 0)).toBe(2)
    const br = await client.execute(`SELECT count(*) AS n FROM branches WHERE parish_id = ?`, [parishId])
    expect(Number(((br.rows?.[0] as any)?.n) ?? 0)).toBe(1)

    // purge_version được ghi
    const ver = await client.execute(`SELECT value FROM system_settings WHERE key = ? AND parish_id = ?`, [PURGE_VERSION_KEY, parishId])
    expect(Number(((ver.rows?.[0] as any)?.value) ?? 0)).toBeGreaterThanOrEqual(DEFAULT_PURGE_VERSION + 1)

    // audit log entry
    const [log] = await db.select().from(auditLogs)
      .where(and(eq(auditLogs.parishId, parishId), eq(auditLogs.action, 'SYSTEM_PURGE')))
      .limit(1)
    expect(log).toBeDefined()
    expect(log!.entityType).toBe('system')
    expect(JSON.parse(log!.oldValue!).students).toBe(1)
  })

  it('sau purge — FK còn nguyên vẹn, có thể tạo dữ liệu mới bình thường', async () => {
    const now = new Date().toISOString()
    await client.execute(`INSERT OR IGNORE INTO academic_years (id, start_date, end_date, is_locked, status, current_semester, parish_id, created_at, updated_at) VALUES ('AY-PURGE-002', '2027-01-01', '2027-12-31', 0, 'OPEN', 1, ?, ?, ?)`, [parishId, now, now])
    await client.execute(`INSERT OR IGNORE INTO classes (id, code, name, branch_id, academic_year_id, parish_id, created_at, updated_at) VALUES ('CLS-PURGE-002', 'TN2', 'Thiếu Nhi 2', ?, 'AY-PURGE-002', ?, ?, ?)`, [seedIds.branch, parishId, now, now])
    const row = await client.execute(`SELECT count(*) AS n FROM classes WHERE parish_id = ? AND id = 'CLS-PURGE-002'`, [parishId])
    expect(Number(((row.rows?.[0] as any)?.n) ?? 0)).toBe(1)

    await client.execute(`DELETE FROM classes WHERE id = 'CLS-PURGE-002'`)
    await client.execute(`DELETE FROM academic_years WHERE id = 'AY-PURGE-002'`)
  })
})
