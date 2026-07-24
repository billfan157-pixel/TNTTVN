import { drizzle } from 'drizzle-orm/sql-js'
import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import * as schema from './schema.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SQL = await initSqlJs()

const dbDir = join(__dirname, '../../data')
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true })
}
const dbPath = join(dbDir, 'parish.db')

let fileBuffer: Buffer | undefined
if (existsSync(dbPath)) {
  fileBuffer = readFileSync(dbPath)
}

const sqlite = new SQL.Database(fileBuffer)

// Create tables if missing
sqlite.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'chunhiem', 'phuta', 'phuhuynh')),
    parish_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'LOCKED')),
    token_version INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    holy_name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    parent_name TEXT NOT NULL,
    parent_phone TEXT NOT NULL,
    address TEXT NOT NULL,
    branch TEXT NOT NULL,
    class_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Đang học',
    deleted_at TEXT,
    parish_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    semester INTEGER NOT NULL,
    score_oral REAL,
    score_15m REAL,
    score_1period REAL,
    score_midterm REAL,
    score_final REAL,
    comments TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    parish_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('SundayMass', 'CatechismClass')),
    status TEXT NOT NULL CHECK(status IN ('Present', 'AbsentExcused', 'AbsentUnexcused')),
    note TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    parish_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT NOT NULL,
    author TEXT NOT NULL,
    priority TEXT NOT NULL CHECK(priority IN ('normal', 'important', 'urgent')),
    target_branch TEXT NOT NULL,
    parish_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    ip TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    parish_id TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('telegram', 'web_push')),
    channel TEXT NOT NULL CHECK(channel IN ('absence', 'report_card', 'reminder')),
    status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'retrying')),
    recipient TEXT NOT NULL,
    message TEXT,
    error TEXT,
    triggered_by_type TEXT NOT NULL CHECK(triggered_by_type IN ('system', 'user')),
    triggered_by_user_id TEXT,
    sent_at TEXT,
    parish_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

// Auto-migration columns if existing DB schema is old
const migrations = [
  `ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'`,
  `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN last_login_at TEXT`,
  `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE students ADD COLUMN deleted_at TEXT`,
  `ALTER TABLE grades ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE attendance ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
]
for (const sql of migrations) {
  try { sqlite.run(sql) } catch { }
}

const safeSave = () => {
  try {
    const parent = dirname(dbPath)
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
    writeFileSync(dbPath, Buffer.from(sqlite.export()))
  } catch {
    // Ignore concurrency locks in tests
  }
}

const origPrepare = sqlite.prepare.bind(sqlite)
sqlite.prepare = ((sql: string) => {
  const stmt = origPrepare(sql)
  const origRun = stmt.run.bind(stmt)
  stmt.run = (...args: any[]) => {
    const result = origRun(...args)
    safeSave()
    return result
  }
  const origStep = stmt.step.bind(stmt)
  stmt.step = origStep
  return stmt
}) as any

const origExec = sqlite.exec.bind(sqlite)
sqlite.exec = ((sql: string) => {
  const result = origExec(sql)
  safeSave()
  return result
}) as any

export function saveDb() {
  safeSave()
}

export const db = drizzle(sqlite, { schema })
export { sqlite }
