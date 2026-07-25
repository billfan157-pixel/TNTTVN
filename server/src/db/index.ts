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
    role TEXT NOT NULL DEFAULT 'phuta' CHECK(role IN ('admin', 'chunhiem', 'phuta', 'phuhuynh')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'FORCE_PASSWORD_CHANGE', 'LOCKED', 'INACTIVE')),
    token_version INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_login_at TEXT,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    holy_name TEXT NOT NULL,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('Nam', 'Nữ')),
    date_of_birth TEXT NOT NULL,
    baptism_date TEXT,
    first_communion_date TEXT,
    confirmation_date TEXT,
    parent_name TEXT NOT NULL,
    parent_phone TEXT NOT NULL,
    address TEXT NOT NULL,
    branch TEXT NOT NULL CHECK(branch IN ('ChienCon', 'AuNhi', 'ThieuNhi', 'NghiaSi', 'HiepSi')),
    class_id TEXT NOT NULL,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'Đang học' CHECK(status IN ('Đang học', 'Nghỉ học', 'Tạm vắng')),
    notes TEXT,
    deleted_at TEXT,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    academic_year TEXT NOT NULL,
    semester INTEGER NOT NULL,
    score_oral REAL,
    score_15m REAL,
    score_1_period REAL,
    score_midterm REAL,
    score_final REAL,
    score_dao_duc REAL,
    comments TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('SundayMass', 'CatechismClass')),
    status TEXT NOT NULL CHECK(status IN ('Present', 'AbsentExcused', 'AbsentUnexcused')),
    note TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT NOT NULL,
    author TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'important', 'urgent')),
    target_branch TEXT,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    ip TEXT,
    user_agent TEXT,
    parish_id TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES students(id),
    type TEXT NOT NULL CHECK(type IN ('telegram', 'web_push')),
    channel TEXT NOT NULL CHECK(channel IN ('absence', 'report_card', 'reminder')),
    status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'retrying')),
    recipient TEXT NOT NULL,
    message TEXT,
    error TEXT,
    triggered_by_type TEXT NOT NULL CHECK(triggered_by_type IN ('system', 'user')),
    triggered_by_user_id TEXT REFERENCES users(id),
    sent_at TEXT,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scarf_color TEXT NOT NULL,
    age_min INTEGER NOT NULL,
    age_max INTEGER NOT NULL,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS academic_years (
    id TEXT PRIMARY KEY,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_locked INTEGER NOT NULL DEFAULT 0,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    branch_id TEXT NOT NULL REFERENCES branches(id),
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
    room TEXT,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia'
  );

  CREATE TABLE IF NOT EXISTS catechist_assignments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    class_id TEXT NOT NULL REFERENCES classes(id),
    role_in_class TEXT NOT NULL CHECK(role_in_class IN ('chunhiem', 'phuta')),
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia'
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL CHECK(role IN ('admin', 'chunhiem', 'phuta', 'phuhuynh')),
    permission_id TEXT NOT NULL REFERENCES permissions(id),
    parish_id TEXT NOT NULL DEFAULT 'thanh-gia',
    PRIMARY KEY (role, permission_id)
  );
`)

// Auto-migration columns if existing DB schema is old
const migrations = [
  `ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'`,
  `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN last_login_at TEXT`,
  `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE users ADD COLUMN locked_until TEXT`,
  `ALTER TABLE students ADD COLUMN deleted_at TEXT`,
  `ALTER TABLE students ADD COLUMN baptism_date TEXT`,
  `ALTER TABLE students ADD COLUMN first_communion_date TEXT`,
  `ALTER TABLE students ADD COLUMN confirmation_date TEXT`,
  `ALTER TABLE students ADD COLUMN avatar_url TEXT`,
  `ALTER TABLE students ADD COLUMN notes TEXT`,
  `ALTER TABLE grades ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE grades ADD COLUMN score_dao_duc REAL`,
  `ALTER TABLE attendance ADD COLUMN version INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE audit_logs ADD COLUMN ip TEXT`,
  `ALTER TABLE audit_logs ADD COLUMN user_agent TEXT`,
  `ALTER TABLE notices ADD COLUMN target_branch TEXT`,
  `ALTER TABLE notifications ADD COLUMN student_id TEXT`,
  `ALTER TABLE notifications ADD COLUMN channel TEXT`,
  `ALTER TABLE notifications ADD COLUMN error TEXT`,
  `ALTER TABLE notifications ADD COLUMN triggered_by_type TEXT`,
  `ALTER TABLE notifications ADD COLUMN triggered_by_user_id TEXT`,
  `ALTER TABLE notifications ADD COLUMN sent_at TEXT`,
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
