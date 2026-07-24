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
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'phuta', parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, holy_name TEXT NOT NULL, full_name TEXT NOT NULL, gender TEXT NOT NULL, date_of_birth TEXT NOT NULL, baptism_date TEXT, first_communion_date TEXT, confirmation_date TEXT, parent_name TEXT NOT NULL DEFAULT '', parent_phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '', branch TEXT NOT NULL, class_id TEXT NOT NULL, avatar_url TEXT, status TEXT NOT NULL DEFAULT 'Đang học', notes TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS grades (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), academic_year TEXT NOT NULL, semester INTEGER NOT NULL, score_oral REAL, score_15m REAL, score_1_period REAL, score_midterm REAL, score_final REAL, comments TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), date TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, note TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS notices (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, date TEXT NOT NULL, author TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal', target_branch TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, old_value TEXT, new_value TEXT, ip TEXT, user_agent TEXT, parish_id TEXT NOT NULL DEFAULT 'thanh-gia', created_at TEXT NOT NULL)`,
]

for (const sql of tables) {
  sqlite.run(sql)
}

sqlite.run(`CREATE INDEX IF NOT EXISTS idx_students_parish ON students(parish_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`)
sqlite.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`)

// Migrate existing tables: add missing columns
const migrations = [
  `ALTER TABLE audit_logs ADD COLUMN ip TEXT`,
  `ALTER TABLE audit_logs ADD COLUMN user_agent TEXT`,
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
