import initSqlJs from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import * as schema from './schema.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = join(__dirname, '../../data/parish.db')
const dbDir = dirname(dbPath)

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true })
}

const SQL = await initSqlJs()

let sqlite: InstanceType<typeof SQL.Database>
if (existsSync(dbPath)) {
  const buffer = readFileSync(dbPath)
  sqlite = new SQL.Database(buffer)
} else {
  sqlite = new SQL.Database()
}

sqlite.run('PRAGMA journal_mode = WAL')
sqlite.run('PRAGMA foreign_keys = ON')

const tables = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'phuta', status TEXT NOT NULL DEFAULT 'ACTIVE', token_version INTEGER NOT NULL DEFAULT 1, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT, last_login_at TEXT, must_change_password INTEGER NOT NULL DEFAULT 1, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, holy_name TEXT NOT NULL, full_name TEXT NOT NULL, gender TEXT NOT NULL, date_of_birth TEXT NOT NULL, baptism_date TEXT, first_communion_date TEXT, confirmation_date TEXT, parent_name TEXT NOT NULL DEFAULT '', parent_phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', branch TEXT NOT NULL, class_id TEXT NOT NULL, avatar_url TEXT, status TEXT NOT NULL DEFAULT 'Đang học', notes TEXT, deleted_at TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS grades (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), academic_year TEXT NOT NULL, semester INTEGER NOT NULL, score_oral REAL, score_15m REAL, score_1_period REAL, score_midterm REAL, score_final REAL, comments TEXT, version INTEGER NOT NULL DEFAULT 1, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), date TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, note TEXT, version INTEGER NOT NULL DEFAULT 1, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS notices (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, date TEXT NOT NULL, author TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal', target_branch TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, old_value TEXT, new_value TEXT, ip TEXT, user_agent TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, name TEXT NOT NULL, scarf_color TEXT NOT NULL, age_min INTEGER NOT NULL, age_max INTEGER NOT NULL, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS academic_years (id TEXT PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL, is_locked INTEGER NOT NULL DEFAULT 0, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, room TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT, updated_by TEXT, updated_at TEXT NOT NULL, parish_id TEXT NOT NULL DEFAULT 'thanh-gia')`,
  `CREATE TABLE IF NOT EXISTS catechist_assignments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, role_in_class TEXT NOT NULL, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, student_id TEXT REFERENCES students(id) ON DELETE SET NULL, type TEXT NOT NULL, channel TEXT NOT NULL, status TEXT NOT NULL, recipient TEXT NOT NULL, message TEXT, error TEXT, triggered_by_type TEXT NOT NULL, triggered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, sent_at TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS permissions (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia')`,
  `CREATE TABLE IF NOT EXISTS role_permissions (role TEXT NOT NULL, permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', PRIMARY KEY (role, permission_id))`,
]

for (const sql of tables) {
  sqlite.run(sql)
}

sqlite.run(`CREATE INDEX IF NOT EXISTS idx_students_parish ON students(parish_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_students_status ON students(status)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_grades_academic_year ON grades(academic_year, semester)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_attendance_type_date ON attendance(type, date)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_classes_branch ON classes(branch_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_classes_academic_year ON classes(academic_year_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at)`)

// Migrate existing tables: add missing columns
const migrations = [
  `ALTER TABLE audit_logs ADD COLUMN ip TEXT`,
  `ALTER TABLE audit_logs ADD COLUMN user_agent TEXT`,
  `ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'`,
  `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN locked_until TEXT`,
  `ALTER TABLE users ADD COLUMN last_login_at TEXT`,
  `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE students ADD COLUMN deleted_at TEXT`,
  `ALTER TABLE grades ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE attendance ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
]
for (const sql of migrations) {
  try { sqlite.run(sql) } catch { }
}

const origPrepare = sqlite.prepare.bind(sqlite)
sqlite.prepare = ((sql: string) => {
  const stmt = origPrepare(sql)
  const origRun = stmt.run.bind(stmt)
  stmt.run = (...args: any[]) => {
    const result = origRun(...args)
    writeFileSync(dbPath, Buffer.from(sqlite.export()))
    return result
  }
  const origStep = stmt.step.bind(stmt)
  stmt.step = origStep
  return stmt
}) as any

const origExec = sqlite.exec.bind(sqlite)
sqlite.exec = ((sql: string) => {
  const result = origExec(sql)
  writeFileSync(dbPath, Buffer.from(sqlite.export()))
  return result
}) as any

export function saveDb() {
  writeFileSync(dbPath, Buffer.from(sqlite.export()))
}

export const db = drizzle(sqlite, { schema })
export type Db = typeof db
