import { describe, it, expect, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { seed } from '../seed.js'

// A-NEW-38 (2026-08-11): seed() KHÔNG được ghi đè passwordHash của user đã tồn tại.
// Trước fix: seed dùng onConflictDoUpdate → chạy lại seed trên DB đã có user sẽ reset
// mật khẩu admin về SEED_ADMIN_PASSWORD (lỗi "sai mật khẩu" dù pass cũ đúng).
// Sau fix: onConflictDoNothing → chỉ tạo khi chưa tồn tại, không đụng mật khẩu đã đặt.
describe('Seed không ghi đè mật khẩu đã tồn tại (A-NEW-38)', () => {
  const ORIGINAL_HASH = 'hash' // global-setup seed user USR-001 với password_hash='hash'

  beforeAll(async () => {
    // Đảm bảo user USR-001 tồn tại với hash gốc (global-setup đã tạo)
    const [existing] = await db.select().from(users).where(and(eq(users.id, 'USR-001'), eq(users.parishId, 'gia-ton'))).limit(1)
    if (!existing) {
      await db.insert(users).values({
        id: 'USR-001',
        username: 'bill',
        passwordHash: ORIGINAL_HASH,
        fullName: 'Super Admin',
        role: 'admin',
        parishId: 'gia-ton',
        status: 'ACTIVE',
        tokenVersion: 1,
        failedAttempts: 0,
        mustChangePassword: 0,
      }).onConflictDoNothing()
    }
  })

  it('chạy lại seed với SEED_ADMIN_PASSWORD khác KHÔNG ghi đè passwordHash', async () => {
    // Set SEED_ADMIN_PASSWORD khác — nếu seed ghi đè, hash sẽ đổi
    process.env.SEED_ADMIN_PASSWORD = 'Different@Seed#2026'

    await seed()

    const [row] = await db.select().from(users).where(and(eq(users.id, 'USR-001'), eq(users.parishId, 'gia-ton'))).limit(1)
    expect(row).toBeDefined()
    // Hash phải GIỮ NGUYÊN (không bị reset về SEED_ADMIN_PASSWORD)
    expect(row!.passwordHash).toBe(ORIGINAL_HASH)
    // Đảm bảo hash gốc KHÔNG khớp với SEED_ADMIN_PASSWORD mới (chứng minh không ghi đè)
    expect(await bcrypt.compare('Different@Seed#2026', row!.passwordHash)).toBe(false)
  })

  it('seedIfEmpty bỏ qua khi DB đã có user (không chạy seed)', async () => {
    // seedIfEmpty đã được test gián tiếp qua global-setup; đảm bảo không throw
    const { seedIfEmpty } = await import('../seed.js')
    await expect(seedIfEmpty()).resolves.toBeUndefined()
  })
})