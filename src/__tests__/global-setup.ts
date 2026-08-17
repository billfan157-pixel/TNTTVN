import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Server tests must never touch the committed server/data/parish.db — that file is
// corruptible when multiple processes open the same WAL database concurrently
// (SQLITE_CORRUPT, "2nd reference to page" — as seen in CI). Each vitest run gets
// its own throwaway SQLite database. globalSetup runs in the MAIN process so
// workers inherit DB_PATH via process env BEFORE any test module (db/index.ts has
// top-level await and reads DB_PATH at import time — setting it in setupFiles is
// too late for the first test file's static imports).
export default async function setup() {
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'parish-test-')), 'parish.db')

  // db/index.ts reads DB_PATH at import time, so it MUST be imported dynamically
  // AFTER the env var is set — a static import is hoisted above this assignment
  // and would open the real server/data/parish.db instead.
  const { client } = await import('../../server/src/db/index.js')

  // Baseline seed the server test suite relies on (previously inherited from the
  // committed server/data/parish.db). Idempotent — runs once per process.
  const now = new Date().toISOString()
  await client.execute(
    "INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, parish_id, token_version, status, created_at) VALUES ('USR-001', 'bill', 'hash', 'Super Admin', 'admin', 'gia-ton', 1, 'ACTIVE', ?)",
    [now],
  )

  const fixedBranches = [
    ['ChienCon', 'Chiên Con', 'Xanh Dương', 6, 8],
    ['AuNhi', 'Ấu Nhi', 'Xanh Lá', 8, 10],
    ['ThieuNhi', 'Thiếu Nhi', 'Đỏ', 10, 13],
    ['NghiaSi', 'Nghĩa Sĩ', 'Vàng', 13, 15],
    ['HiepSi', 'Hiệp Sĩ', 'Tím', 15, 18],
  ]
  for (const [id, name, scarfColor, ageMin, ageMax] of fixedBranches) {
    await client.execute(
      'INSERT OR IGNORE INTO branches (id, name, scarf_color, age_min, age_max, parish_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, scarfColor, ageMin, ageMax, 'gia-ton', now, now],
    )
  }

  const academicYearSeeds = [
    ['2025-2026', '2025-09-01', '2026-06-30'],
    ['2026-2027', '2026-08-01', '2027-06-30'],
  ]
  for (const [id, startDate, endDate] of academicYearSeeds) {
    await client.execute(
      'INSERT OR IGNORE INTO academic_years (id, start_date, end_date, parish_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, startDate, endDate, 'gia-ton', now, now],
    )
  }

  const [cls] = (await client.execute("SELECT id FROM classes WHERE id = 'AU1'")).rows
  if (!cls) {
    await client.execute(
      "INSERT OR IGNORE INTO classes (id, code, name, branch_id, academic_year_id, parish_id, created_at, updated_at) VALUES ('AU1', 'AU-01', 'Ấu Nhi 1', 'AuNhi', '2025-2026', 'gia-ton', ?, ?)",
      [now, now],
    )
  }
}
