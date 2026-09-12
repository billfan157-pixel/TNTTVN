/**
 * e2e-seed-users.mjs — Tạo tài khoản E2E cho Playwright (TQ-F2, audit 2026-08-21).
 *
 * Vì sao: seed production chỉ tạo bill (admin). Các spec roles/crud cần user
 * chunhiem/phuta/phuhuynh ĐANG HOẠT ĐỘNG (không FORCE_PASSWORD_CHANGE) để đăng
 * nhập thật qua /api/auth/login. Đường API createUser sinh mật khẩu tạm + flag
 * đổi-mật-khẩu-bắt-buộc → không dùng được cho E2E, nên seed thẳng vào DB với
 * bcrypt hash của E2E_ROLE_PASSWORD. Idempotent (INSERT OR IGNORE).
 *
 * Chạy bởi scripts/e2e-dev.mjs SAU khi backend health sẵn sàng. Chạy tay chỉ
 * được phép khi DB_PATH + E2E_RUN_ID trỏ đúng sandbox OS-temp có owner marker.
 */
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { assertE2EDatabasePath } from './e2e-sandbox.mjs'

export async function seedE2EUsers({
  dbPath = process.env.DB_PATH,
  runId = process.env.E2E_RUN_ID,
} = {}) {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || process.env.E2E_SEED_PASSWORD
  if (!seedPassword) {
    throw new Error('Thiếu SEED_ADMIN_PASSWORD/E2E_SEED_PASSWORD — không thể seed user E2E.')
  }

  const isolatedDbPath = assertE2EDatabasePath(dbPath, runId)
  const c = createClient({ url: `file:${isolatedDbPath}` })
  const rolePassword = process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!'
  const hashRole = bcrypt.hashSync(rolePassword, 10)
  const hashSeed = bcrypt.hashSync(seedPassword, 10)
  const now = new Date().toISOString()

  try {
    // 1a. Admin trưởng seed (bill) — khớp global-setup của vitest + seed.ts production.
    await c.execute(
      `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, parish_id, token_version, status, must_change_password, created_at)
       VALUES ('USR-001', 'bill', ?, 'Super Admin', 'admin', 'gia-ton', 1, 'ACTIVE', 0, ?)`,
      [hashSeed, now],
    )

    // 1b. FIN-E2E (audit 2026-08-21): admin DÀNH RIÊNG cho E2E — không phụ thuộc
    // mật khẩu thật của bill trên DB dev/cục bộ (INSERT OR IGNORE không overwrite
    // hash cũ khiến login-as-bill 401 cục bộ). Dedicated account = decoupled.
    await c.execute(
      `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, parish_id, token_version, status, must_change_password, created_at)
       VALUES ('usr-e2e-admin', 'e2e_admin', ?, 'E2E Admin', 'admin', 'gia-ton', 1, 'ACTIVE', 0, ?)`,
      [hashRole, now],
    )

    // 2. Ba user vai trò cho spec phân quyền — ACTIVE + mustChangePassword=0.
    const roleUsers = [
      ['usr-e2e-chunhiem', 'e2e_chunhiem', 'chunhiem', 'E2E Chunhiem', null],
      ['usr-e2e-phuta', 'e2e_phuta', 'phuta', 'E2E Phuta', null],
      ['usr-e2e-pho-nganh', 'e2e_pho_nganh', 'chunhiem', 'E2E Pho Nganh', null],
      ['usr-e2e-phuhuynh', '0900000000', 'phuhuynh', 'E2E Phuhuynh A', '0900000000'],
      ['usr-e2e-phuhuynh-b', '0900000001', 'phuhuynh', 'E2E Phuhuynh B', '0900000001'],
    ]
    for (const [id, username, role, fullName, phone] of roleUsers) {
      await c.execute(
        `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, phone, role, parish_id, token_version, status, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'gia-ton', 1, 'ACTIVE', 0, ?)`,
        [id, username, hashRole, fullName, phone, role, now],
      )
    }

    // 2b. Gate B Operations: organizational authority fixtures are explicit;
    // account roles and class assignments do not stand in for these terms.
    await c.execute(
      `INSERT OR IGNORE INTO parish_organization_units
       (parish_id, id, parent_id, name, unit_type, description, sort_order, is_active, created_by, updated_by, created_at, updated_at)
       VALUES ('gia-ton', 'unit-e2e-board', NULL, 'Ban Điều hành E2E', 'BOARD', 'E2E authority root', 0, 1, 'usr-e2e-admin', 'usr-e2e-admin', ?, ?)`,
      [now, now],
    )
    await c.execute(
      `INSERT OR IGNORE INTO parish_organization_units
       (parish_id, id, parent_id, name, unit_type, description, sort_order, is_active, created_by, updated_by, created_at, updated_at)
       VALUES ('gia-ton', 'unit-e2e-branch', 'unit-e2e-board', 'Ngành E2E', 'BRANCH', 'E2E branch scope', 1, 1, 'usr-e2e-admin', 'usr-e2e-admin', ?, ?)`,
      [now, now],
    )
    const operationsPeople = [
      ['person-e2e-parish-leader', 'usr-e2e-phuta', 'E2E Trưởng Xứ đoàn'],
      ['person-e2e-branch-leader', 'usr-e2e-chunhiem', 'E2E Trưởng ngành'],
      ['person-e2e-branch-deputy', 'usr-e2e-pho-nganh', 'E2E Phó ngành'],
    ]
    for (const [id, linkedUserId, fullName] of operationsPeople) {
      await c.execute(
        `INSERT OR IGNORE INTO parish_people
         (parish_id, id, linked_user_id, full_name, service_status, visibility, created_by, updated_by, created_at, updated_at)
         VALUES ('gia-ton', ?, ?, ?, 'ACTIVE', 'STAFF', 'usr-e2e-admin', 'usr-e2e-admin', ?, ?)`,
        [id, linkedUserId, fullName, now, now],
      )
    }
    await c.execute(
      `INSERT OR IGNORE INTO parish_service_terms
       (parish_id, id, person_id, unit_id, position_title, position_code, start_date, end_date, created_by, updated_by, created_at, updated_at)
       VALUES ('gia-ton', 'term-e2e-parish-leader', 'person-e2e-parish-leader', 'unit-e2e-board', 'Trưởng Xứ đoàn', 'PARISH_LEADER', '2020-01-01', '2099-12-31', 'usr-e2e-admin', 'usr-e2e-admin', ?, ?)`,
      [now, now],
    )
    await c.execute(
      `INSERT OR IGNORE INTO parish_service_terms
       (parish_id, id, person_id, unit_id, position_title, position_code, start_date, end_date, created_by, updated_by, created_at, updated_at)
       VALUES ('gia-ton', 'term-e2e-branch-leader', 'person-e2e-branch-leader', 'unit-e2e-branch', 'Trưởng ngành', 'BRANCH_LEADER', '2020-01-01', '2099-12-31', 'usr-e2e-admin', 'usr-e2e-admin', ?, ?)`,
      [now, now],
    )
    // ADR-112 O3/O8: deputy fixture for deputy-create and deputy-lead-ban flows.
    await c.execute(
      `INSERT OR IGNORE INTO parish_service_terms
       (parish_id, id, person_id, unit_id, position_title, position_code, start_date, end_date, created_by, updated_by, created_at, updated_at)
       VALUES ('gia-ton', 'term-e2e-branch-deputy', 'person-e2e-branch-deputy', 'unit-e2e-branch', 'Phó ngành', 'BRANCH_DEPUTY', '2020-01-01', '2099-12-31', 'usr-e2e-admin', 'usr-e2e-admin', ?, ?)`,
      [now, now],
    )

    // 3. Fixture nghiệp vụ tối thiểu, deterministic: một thiếu nhi thuộc lớp
    // Thiếu Nhi 1 và hai phân công giúp các role staff đọc đúng phạm vi lớp.
    // Đây chỉ là dữ liệu của DB sandbox; production schema/policy không đổi.
    await c.execute(
      `INSERT OR IGNORE INTO students
       (id, code, holy_name, full_name, gender, date_of_birth, parent_name, parent_phone,
        address, branch, class_id, status, parish_id, created_at, updated_at, updated_by)
       VALUES ('student-e2e-001', 'E2E-001', 'Maria', 'Thiếu Nhi E2E', 'Nữ',
        '2015-01-01', 'Phụ Huynh E2E', '0900000000', 'Giáo Xứ Gia Tôn',
        'ThieuNhi', 'CLS-TN-1', 'Đang học', 'gia-ton', ?, ?, 'e2e-seed')`,
      [now, now],
    )

    await c.execute(
      `INSERT OR IGNORE INTO students
       (id, code, holy_name, full_name, gender, date_of_birth, parent_name, parent_phone,
        address, branch, class_id, status, parish_id, created_at, updated_at, updated_by)
       VALUES ('student-e2e-002', 'E2E-002', 'Giuse', 'Thiếu Nhi E2E Khác', 'Nam',
        '2016-02-02', 'Phụ Huynh E2E B', '0900000001', 'Giáo Xứ Gia Tôn',
        'AuNhi', 'CLS-AN-1', 'Đang học', 'gia-ton', ?, ?, 'e2e-seed')`,
      [now, now],
    )

    const assignments = [
      ['assignment-e2e-chunhiem', 'usr-e2e-chunhiem', 'chunhiem'],
      ['assignment-e2e-phuta', 'usr-e2e-phuta', 'phuta'],
    ]
    for (const [id, userId, roleInClass] of assignments) {
      await c.execute(
        `INSERT OR IGNORE INTO catechist_assignments
         (id, user_id, class_id, role_in_class, parish_id, created_at, updated_at, updated_by)
         VALUES (?, ?, 'CLS-TN-1', ?, 'gia-ton', ?, ?, 'e2e-seed')`,
        [id, userId, roleInClass, now, now],
      )
    }

    console.log('[e2e-seed-users] OK — role users + Operations authority fixtures + 2 parent-scoped students + 2 class assignments sẵn sàng.')
  } finally {
    c.close()
  }
}

// Chạy trực tiếp CLI: node scripts/e2e-seed-users.mjs
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/e2e-seed-users.mjs')
if (isMain) {
  try {
    await seedE2EUsers()
  } catch (err) {
    console.error('[e2e-seed-users] Seed thất bại:', err?.message || err)
    process.exitCode = 1
  }
}
