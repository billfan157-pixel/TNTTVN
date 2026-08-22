/**
 * e2e-seed-users.mjs — Tạo tài khoản E2E cho Playwright (TQ-F2, audit 2026-08-21).
 *
 * Vì sao: seed production chỉ tạo bill (admin). Các spec roles/crud cần user
 * chunhiem/phuta/phuhuynh ĐANG HOẠT ĐỘNG (không FORCE_PASSWORD_CHANGE) để đăng
 * nhập thật qua /api/auth/login. Đường API createUser sinh mật khẩu tạm + flag
 * đổi-mật-khẩu-bắt-buộc → không dùng được cho E2E, nên seed thẳng vào DB với
 * bcrypt hash của E2E_ROLE_PASSWORD. Idempotent (INSERT OR IGNORE).
 *
 * Chạy bởi scripts/e2e-dev.mjs SAU khi backend health sẵn sàng; hoặc chạy tay:
 *   node scripts/e2e-seed-users.mjs
 */
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'

const dbPath = process.env.DB_PATH // khớp contract của server (getDbConfig)
const url = process.env.DB_URL || (dbPath ? `file:${dbPath}` : 'file:server/data/parish.db')
const c = createClient({ url })

export async function seedE2EUsers() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || process.env.E2E_SEED_PASSWORD
  if (!seedPassword) {
    console.error('[e2e-seed-users] Thiếu SEED_ADMIN_PASSWORD/E2E_SEED_PASSWORD — bỏ qua seed user E2E.')
    return
  }

  const rolePassword = process.env.E2E_ROLE_PASSWORD || 'E2e-Role-Password-1!'
  const hashRole = bcrypt.hashSync(rolePassword, 10)
  const hashSeed = bcrypt.hashSync(seedPassword, 10)
  const now = new Date().toISOString()

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
    ['usr-e2e-chunhiem', 'e2e_chunhiem', 'chunhiem', 'E2E Chunhiem'],
    ['usr-e2e-phuta', 'e2e_phuta', 'phuta', 'E2E Phuta'],
    ['usr-e2e-phuhuynh', 'e2e_phuhuynh', 'phuhuynh', 'E2E Phuhuynh'],
  ]
  for (const [id, username, role, fullName] of roleUsers) {
    await c.execute(
      `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, parish_id, token_version, status, must_change_password, created_at)
       VALUES (?, ?, ?, ?, ?, 'gia-ton', 1, 'ACTIVE', 0, ?)`,
      [id, username, hashRole, fullName, role, now],
    )
  }

  console.log('[e2e-seed-users] OK — bill + e2e_admin + 3 user vai trò E2E sẵn sàng.')
}

// Chạy trực tiếp CLI: node scripts/e2e-seed-users.mjs
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/e2e-seed-users.mjs')
if (isMain) {
  await seedE2EUsers()
  process.exit(0)
}
