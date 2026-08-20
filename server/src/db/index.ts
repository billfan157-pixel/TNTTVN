import { createClient, LibsqlError } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { getDbConfig } from './dbConfig.js'
import * as schema from './schema.js'

export const dbConfig = getDbConfig()
const { isRemote, url, authToken, dbPath } = dbConfig

if (!isRemote && dbPath) {
  const dbDir = dirname(dbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }
}

const client = createClient(
  isRemote
    ? { url, authToken }
    : { url },
)

// `foreign_keys=ON` hợp lệ cả local và remote (Turso) — chạy luôn.
await client.execute('PRAGMA foreign_keys=ON')

// Các PRAGMA sau CHỈ áp dụng cho SQLite file local. Remote (Turso) quản lý
// WAL/transaction/persistence ở tầng managed → bỏ qua để tránh lỗi.
if (!isRemote) {
  await client.execute('PRAGMA journal_mode=WAL')
  await client.execute('PRAGMA busy_timeout=5000')
  await client.execute('PRAGMA synchronous=NORMAL')
}

await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_encrypted TEXT,
    full_name TEXT NOT NULL,
    holy_name TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'phuta' CHECK(role IN ('admin', 'chunhiem', 'phuta', 'phuhuynh')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'FORCE_PASSWORD_CHANGE', 'LOCKED', 'INACTIVE')),
    token_version INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_login_at TEXT,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scarf_color TEXT NOT NULL,
    age_min INTEGER NOT NULL,
    age_max INTEGER NOT NULL,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS academic_years (
    id TEXT PRIMARY KEY,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_locked INTEGER NOT NULL DEFAULT 0,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton'
  );

  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
    room TEXT,
    idempotency_key TEXT,
    deleted_at TEXT,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT,
    UNIQUE(code, academic_year_id)
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
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
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'Đang học' CHECK(status IN ('Đang học', 'Nghỉ học', 'Tạm vắng')),
    notes TEXT,
    deleted_at TEXT,
    idempotency_key TEXT,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    academic_year TEXT NOT NULL,
    semester INTEGER NOT NULL,
    score_oral REAL,
    score_15m REAL,
    score_1_period REAL,
    score_midterm REAL,
    score_final REAL,
    score_dao_duc REAL,
    comments TEXT,
    score_oral_source TEXT,
    score_oral_updated_at TEXT,
    score_15m_source TEXT,
    score_15m_updated_at TEXT,
    score_1_period_source TEXT,
    score_1_period_updated_at TEXT,
    score_midterm_source TEXT,
    score_midterm_updated_at TEXT,
    score_final_source TEXT,
    score_final_updated_at TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('SundayMass', 'CatechismClass')),
    status TEXT NOT NULL CHECK(status IN ('Present', 'AbsentExcused', 'AbsentUnexcused')),
    note TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT,
    UNIQUE(parish_id, student_id, date, type)
  );

  CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT NOT NULL,
    author TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'important', 'urgent')),
    target_branch TEXT,
    idempotency_key TEXT,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
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
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_by TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    PRIMARY KEY (key, parish_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK(type IN ('telegram', 'web_push')),
    channel TEXT NOT NULL CHECK(channel IN ('absence', 'report_card', 'reminder')),
    status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'retrying')),
    recipient TEXT NOT NULL,
    message TEXT,
    error TEXT,
    triggered_by_type TEXT NOT NULL CHECK(triggered_by_type IN ('system', 'user')),
    triggered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    sent_at TEXT,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS catechist_assignments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
    role_in_class TEXT NOT NULL CHECK(role_in_class IN ('chunhiem', 'phuta')),
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT,
    UNIQUE(user_id, class_id)
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL CHECK(role IN ('admin', 'chunhiem', 'phuta', 'phuhuynh')),
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    PRIMARY KEY (role, permission_id)
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    replaced_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    file_name TEXT,
    content_hash TEXT,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    classes_created TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'partial', 'failed', 'undone', 'partial_undone')),
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS import_batch_students (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK(action IN ('created', 'updated', 'skipped', 'error')),
    row_index INTEGER NOT NULL,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS grade_import_hashes (
    id TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    class_id TEXT NOT NULL,
    semester INTEGER NOT NULL,
    academic_year TEXT NOT NULL,
    total_rows INTEGER NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_import_hashes_unique ON grade_import_hashes(hash, class_id, semester, academic_year, parish_id);

  -- A-NEW-23 (2026-08-11): rate limit state chia sẻ giữa các app instance —
  -- DB SQLite file dùng chung (cùng volume) thay vì Map per-process. UPSERT
  -- atomic; window mặc định 60s; cleanup xóa row hết hạn ở middleware/security.ts.
  CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS service_assignments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL DEFAULT 'le_phuc_vu' CHECK(service_type IN ('le_phuc_vu')),
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    UNIQUE(student_id, service_type)
  );

  CREATE TABLE IF NOT EXISTS mapping_memory (
    id TEXT PRIMARY KEY,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    scope TEXT NOT NULL CHECK(scope IN ('class', 'student')),
    alias TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_name TEXT,
    academic_year_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parish_id, scope, alias, academic_year_id)
  );

  CREATE TABLE IF NOT EXISTS semester_locks (
    id TEXT PRIMARY KEY,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    academic_year TEXT NOT NULL,
    semester INTEGER NOT NULL,
    is_locked INTEGER NOT NULL DEFAULT 0,
    locked_by TEXT,
    locked_at TEXT,
    unlock_reason TEXT,
    unlocked_by TEXT,
    unlocked_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parish_id, academic_year, semester)
  );

  CREATE TABLE IF NOT EXISTS promotion_records (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    academic_year TEXT NOT NULL,
    target_class_id TEXT NOT NULL,
    next_class_id TEXT,
    auto_decision TEXT NOT NULL CHECK(auto_decision IN ('PROMOTED', 'RETAINED', 'GRADUATED', 'CONDITIONALLY_PROMOTED', 'TRANSFERRED')),
    final_decision TEXT NOT NULL CHECK(final_decision IN ('PROMOTED', 'RETAINED', 'GRADUATED', 'CONDITIONALLY_PROMOTED', 'TRANSFERRED')),
    is_overridden INTEGER NOT NULL DEFAULT 0,
    override_reason TEXT,
    gpa_snapshot REAL NOT NULL,
    attendance_snapshot REAL NOT NULL,
    conduct_snapshot TEXT,
    rules_version TEXT NOT NULL DEFAULT 'v1.0',
    approved_by TEXT NOT NULL REFERENCES users(id),
    approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUPERSEDED')),
    version INTEGER NOT NULL DEFAULT 1,
    is_latest INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parish_id, student_id, academic_year, version)
  );

  
  CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT NOT NULL,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    student_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    parent_id TEXT,
    parent_name TEXT NOT NULL,
    parent_phone TEXT NOT NULL,
    date TEXT NOT NULL,
    session_types TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    reviewed_by TEXT,
    reviewer_name TEXT,
    review_note TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(parish_id, id),
    FOREIGN KEY(parish_id, student_id) REFERENCES students(parish_id, id) ON DELETE CASCADE,
    FOREIGN KEY(parish_id, class_id) REFERENCES classes(parish_id, id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS attendance_sessions (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('SundayMass', 'CatechismClass')),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED', 'LOCKED')),
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parish_id, class_id, date, type)
  );

  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('ORAL', '15MIN', '1PERIOD', 'MIDTERM', 'FINAL', 'ETHICS')),
    weight REAL NOT NULL DEFAULT 1.0,
    semester INTEGER NOT NULL,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  `)

const INDICES = [
  'CREATE INDEX IF NOT EXISTS idx_users_parish_id ON users(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_students_parish_id ON students(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_students_idempotency ON students(idempotency_key)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_students_code_parish ON students(parish_id, code)',
  'CREATE INDEX IF NOT EXISTS idx_grades_parish_id ON grades(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_grades_student_id ON grades(student_id)',
  'CREATE INDEX IF NOT EXISTS idx_grades_sync ON grades(parish_id, updated_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_grades_lookup ON grades(parish_id, student_id, academic_year, semester)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_parish_id ON attendance(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_sync ON attendance(parish_id, updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_lookup ON attendance(parish_id, student_id, date)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique ON attendance(parish_id, student_id, date, type)',
  'CREATE INDEX IF NOT EXISTS idx_notices_parish_id ON notices(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_notices_date ON notices(parish_id, date)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_parish_id ON audit_logs(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(parish_id, entity_type, entity_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_branches_parish_id ON branches(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_classes_parish_id ON classes(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_catechist_assignments_parish_id ON catechist_assignments(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_catechist_assignments_user_id ON catechist_assignments(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_parish_id ON notifications(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_lookup ON notifications(parish_id, status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_permissions_parish_id ON permissions(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_parish_id ON push_subscriptions(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_parish_id ON refresh_tokens(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_import_batches_parish_id ON import_batches(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_import_batches_user_id ON import_batches(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_import_batch_students_batch_id ON import_batch_students(batch_id)',
  'CREATE INDEX IF NOT EXISTS idx_import_batch_students_parish_id ON import_batch_students(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_academic_years_parish_id ON academic_years(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_system_settings_parish_id ON system_settings(parish_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_sessions_unique ON attendance_sessions(parish_id, class_id, date, type)',
  'CREATE INDEX IF NOT EXISTS idx_assessments_lookup ON assessments(parish_id, academic_year_id, semester)',
  'CREATE INDEX IF NOT EXISTS idx_promotion_records_target_class ON promotion_records(target_class_id)',
  'CREATE INDEX IF NOT EXISTS idx_promotion_records_approved_by ON promotion_records(approved_by)',
  // P2 audit: indexes declared in Drizzle schema.ts nhưng thiếu trong DDL — tự tạo ở boot mới + migration 074 cho DB đã deploy.
  'CREATE INDEX IF NOT EXISTS idx_classes_idempotency ON classes(idempotency_key)',
  'CREATE INDEX IF NOT EXISTS idx_mapping_memory_entity_id ON mapping_memory(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_grade_overrides_lookup ON grade_overrides(grade_id, score_field)',
  'CREATE INDEX IF NOT EXISTS idx_outbox_messages_status ON outbox_messages(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_semester_locks_lookup ON semester_locks(parish_id, academic_year, semester)',
  'CREATE INDEX IF NOT EXISTS idx_promotion_records_lookup ON promotion_records(parish_id, student_id, academic_year)',
  // C1 (2026-08-14): defensive recreate — idx_exam_sessions_idempotency UNIQUE (ADR-023).
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_sessions_idempotency ON exam_sessions(idempotency_key)',
  `CREATE TRIGGER IF NOT EXISTS check_grade_scores_insert BEFORE INSERT ON grades BEGIN SELECT CASE WHEN NEW.score_oral IS NOT NULL AND (NEW.score_oral < 0 OR NEW.score_oral > 10) THEN RAISE(ABORT, 'score_oral out of range 0-10') WHEN NEW.score_15m IS NOT NULL AND (NEW.score_15m < 0 OR NEW.score_15m > 10) THEN RAISE(ABORT, 'score_15m out of range 0-10') WHEN NEW.score_1_period IS NOT NULL AND (NEW.score_1_period < 0 OR NEW.score_1_period > 10) THEN RAISE(ABORT, 'score_1_period out of range 0-10') WHEN NEW.score_midterm IS NOT NULL AND (NEW.score_midterm < 0 OR NEW.score_midterm > 10) THEN RAISE(ABORT, 'score_midterm out of range 0-10') WHEN NEW.score_final IS NOT NULL AND (NEW.score_final < 0 OR NEW.score_final > 10) THEN RAISE(ABORT, 'score_final out of range 0-10') WHEN NEW.score_dao_duc IS NOT NULL AND (NEW.score_dao_duc < 0 OR NEW.score_dao_duc > 10) THEN RAISE(ABORT, 'score_dao_duc out of range 0-10') END; END`,
  `CREATE TRIGGER IF NOT EXISTS check_grade_scores_update BEFORE UPDATE ON grades BEGIN SELECT CASE WHEN NEW.score_oral IS NOT NULL AND (NEW.score_oral < 0 OR NEW.score_oral > 10) THEN RAISE(ABORT, 'score_oral out of range 0-10') WHEN NEW.score_15m IS NOT NULL AND (NEW.score_15m < 0 OR NEW.score_15m > 10) THEN RAISE(ABORT, 'score_15m out of range 0-10') WHEN NEW.score_1_period IS NOT NULL AND (NEW.score_1_period < 0 OR NEW.score_1_period > 10) THEN RAISE(ABORT, 'score_1_period out of range 0-10') WHEN NEW.score_midterm IS NOT NULL AND (NEW.score_midterm < 0 OR NEW.score_midterm > 10) THEN RAISE(ABORT, 'score_midterm out of range 0-10') WHEN NEW.score_final IS NOT NULL AND (NEW.score_final < 0 OR NEW.score_final > 10) THEN RAISE(ABORT, 'score_final out of range 0-10') WHEN NEW.score_dao_duc IS NOT NULL AND (NEW.score_dao_duc < 0 OR NEW.score_dao_duc > 10) THEN RAISE(ABORT, 'score_dao_duc out of range 0-10') END; END`,
  `CREATE TRIGGER IF NOT EXISTS check_outbox_messages_status_insert BEFORE INSERT ON outbox_messages BEGIN SELECT CASE WHEN NEW.status NOT IN ('pending', 'dispatched', 'failed') THEN RAISE(ABORT, 'outbox_messages status invalid') END; END`,
  `CREATE TRIGGER IF NOT EXISTS check_outbox_messages_status_update BEFORE UPDATE ON outbox_messages BEGIN SELECT CASE WHEN NEW.status NOT IN ('pending', 'dispatched', 'failed') THEN RAISE(ABORT, 'outbox_messages status invalid') END; END`,
  `CREATE TRIGGER IF NOT EXISTS check_grade_overrides_field_insert BEFORE INSERT ON grade_overrides BEGIN SELECT CASE WHEN NEW.score_field NOT IN ('scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc') THEN RAISE(ABORT, 'grade_overrides score_field invalid') END; END`,
  `CREATE TRIGGER IF NOT EXISTS check_grade_overrides_field_update BEFORE UPDATE ON grade_overrides BEGIN SELECT CASE WHEN NEW.score_field NOT IN ('scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc') THEN RAISE(ABORT, 'grade_overrides score_field invalid') END; END`,
]

const MIGRATIONS = [
  { version: '20240728-001', sql: `ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'` },
  { version: '20240728-002', sql: `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1` },
  { version: '20240728-003', sql: `ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0` },
  { version: '20240728-004', sql: `ALTER TABLE users ADD COLUMN last_login_at TEXT` },
  { version: '20240728-005', sql: `ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1` },
  { version: '20240728-006', sql: `ALTER TABLE users ADD COLUMN locked_until TEXT` },
  { version: '20240728-007', sql: `ALTER TABLE users ADD COLUMN phone TEXT` },
  { version: '20240728-008', sql: `ALTER TABLE students ADD COLUMN deleted_at TEXT` },
  { version: '20240728-009', sql: `ALTER TABLE students ADD COLUMN baptism_date TEXT` },
  { version: '20240728-010', sql: `ALTER TABLE students ADD COLUMN first_communion_date TEXT` },
  { version: '20240728-011', sql: `ALTER TABLE students ADD COLUMN confirmation_date TEXT` },
  { version: '20240728-012', sql: `ALTER TABLE students ADD COLUMN avatar_url TEXT` },
  { version: '20240728-013', sql: `ALTER TABLE students ADD COLUMN notes TEXT` },
  { version: '20240728-014', sql: `ALTER TABLE grades ADD COLUMN version INTEGER NOT NULL DEFAULT 1` },
  { version: '20240728-015', sql: `ALTER TABLE grades ADD COLUMN score_dao_duc REAL` },
  { version: '20240728-016', sql: `ALTER TABLE attendance ADD COLUMN version INTEGER NOT NULL DEFAULT 1` },
  { version: '20240728-017', sql: `ALTER TABLE audit_logs ADD COLUMN ip TEXT` },
  { version: '20240728-018', sql: `ALTER TABLE audit_logs ADD COLUMN user_agent TEXT` },
  { version: '20240728-019', sql: `ALTER TABLE audit_logs ADD COLUMN created_at TEXT` },
  // ADR-016 (migration audit): migration 020 bị XÓA — SQL `UPDATE audit_logs SET created_at =
  // timestamp` tham chiếu cột `timestamp` chưa từng tồn tại (audit_logs chỉ có created_at sau 019),
  // nên fail "no such column" MỖI lần boot và version không bao giờ được ghi vào schema_migrations.
  // 021 (backfill CURRENT_TIMESTAMP) đã làm đúng việc này.
  { version: '20240728-021', sql: `UPDATE audit_logs SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL` },
  { version: '20240728-022', sql: `ALTER TABLE notices ADD COLUMN target_branch TEXT` },
  { version: '20240728-023', sql: `ALTER TABLE notifications ADD COLUMN student_id TEXT` },
  { version: '20240728-024', sql: `ALTER TABLE notifications ADD COLUMN channel TEXT` },
  { version: '20240728-025', sql: `ALTER TABLE notifications ADD COLUMN error TEXT` },
  { version: '20240728-026', sql: `ALTER TABLE notifications ADD COLUMN triggered_by_type TEXT` },
  { version: '20240728-027', sql: `ALTER TABLE notifications ADD COLUMN triggered_by_user_id TEXT` },
  { version: '20240728-028', sql: `ALTER TABLE notifications ADD COLUMN sent_at TEXT` },
  { version: '20240728-029', sql: `ALTER TABLE classes ADD COLUMN deleted_at TEXT` },
  { version: '20240728-031', sql: `ALTER TABLE import_batches ADD COLUMN content_hash TEXT` },
  { version: '20240728-032', sql: `ALTER TABLE import_batch_students ADD COLUMN parish_id TEXT NOT NULL DEFAULT 'gia-ton'` },
  { version: '20240728-033', sql: `ALTER TABLE import_batch_students ADD COLUMN created_at TEXT` },
  { version: '20240728-034', sql: `ALTER TABLE users ADD COLUMN parish_id TEXT NOT NULL DEFAULT 'gia-ton'` },
  { version: '20240728-035', sql: `ALTER TABLE classes ADD COLUMN idempotency_key TEXT` },
  { version: '20240728-037', sql: `CREATE TABLE IF NOT EXISTS grade_overrides (id TEXT PRIMARY KEY, grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE CASCADE, score_field TEXT NOT NULL, manual_value REAL NOT NULL, reason_code TEXT NOT NULL DEFAULT 'TeacherAdjustment', reason_note TEXT, overridden_by TEXT NOT NULL, overridden_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { version: '20240728-038', sql: `CREATE TABLE IF NOT EXISTS outbox_messages (id TEXT PRIMARY KEY, aggregate_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', sequence_number INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { version: '20240729-039', sql: `DROP INDEX IF EXISTS idx_grades_lookup` },
  { version: '20240729-040', sql: `CREATE UNIQUE INDEX idx_grades_lookup ON grades(parish_id, student_id, academic_year, semester)` },
  { version: '20240729-041', sql: `CREATE INDEX IF NOT EXISTS idx_grades_sync ON grades(parish_id, updated_at)` },
  { version: '20240729-042', sql: `CREATE INDEX IF NOT EXISTS idx_attendance_sync ON attendance(parish_id, updated_at)` },
  { version: '20240730-043', sql: `ALTER TABLE promotion_records ADD COLUMN is_latest INTEGER NOT NULL DEFAULT 1` },
  { version: '20240730-044', sql: `CREATE TABLE IF NOT EXISTS attendance_sessions (id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, date TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('SundayMass', 'CatechismClass')), status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED', 'LOCKED')), parish_id TEXT NOT NULL DEFAULT 'gia-ton', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(parish_id, class_id, date, type))` },
  { version: '20240730-045', sql: `CREATE TABLE IF NOT EXISTS assessments (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('ORAL', '15MIN', '1PERIOD', 'MIDTERM', 'FINAL', 'ETHICS')), weight REAL NOT NULL DEFAULT 1.0, semester INTEGER NOT NULL, academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, parish_id TEXT NOT NULL DEFAULT 'gia-ton', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { version: '20240730-047', sql: `CREATE TRIGGER IF NOT EXISTS check_grade_scores_insert BEFORE INSERT ON grades BEGIN SELECT CASE WHEN NEW.score_oral IS NOT NULL AND (NEW.score_oral < 0 OR NEW.score_oral > 10) THEN RAISE(ABORT, 'score_oral out of range 0-10') WHEN NEW.score_15m IS NOT NULL AND (NEW.score_15m < 0 OR NEW.score_15m > 10) THEN RAISE(ABORT, 'score_15m out of range 0-10') WHEN NEW.score_1_period IS NOT NULL AND (NEW.score_1_period < 0 OR NEW.score_1_period > 10) THEN RAISE(ABORT, 'score_1_period out of range 0-10') WHEN NEW.score_midterm IS NOT NULL AND (NEW.score_midterm < 0 OR NEW.score_midterm > 10) THEN RAISE(ABORT, 'score_midterm out of range 0-10') WHEN NEW.score_final IS NOT NULL AND (NEW.score_final < 0 OR NEW.score_final > 10) THEN RAISE(ABORT, 'score_final out of range 0-10') WHEN NEW.score_dao_duc IS NOT NULL AND (NEW.score_dao_duc < 0 OR NEW.score_dao_duc > 10) THEN RAISE(ABORT, 'score_dao_duc out of range 0-10') END; END` },
  { version: '20240730-048', sql: `CREATE TRIGGER IF NOT EXISTS check_grade_scores_update BEFORE UPDATE ON grades BEGIN SELECT CASE WHEN NEW.score_oral IS NOT NULL AND (NEW.score_oral < 0 OR NEW.score_oral > 10) THEN RAISE(ABORT, 'score_oral out of range 0-10') WHEN NEW.score_15m IS NOT NULL AND (NEW.score_15m < 0 OR NEW.score_15m > 10) THEN RAISE(ABORT, 'score_15m out of range 0-10') WHEN NEW.score_1_period IS NOT NULL AND (NEW.score_1_period < 0 OR NEW.score_1_period > 10) THEN RAISE(ABORT, 'score_1_period out of range 0-10') WHEN NEW.score_midterm IS NOT NULL AND (NEW.score_midterm < 0 OR NEW.score_midterm > 10) THEN RAISE(ABORT, 'score_midterm out of range 0-10') WHEN NEW.score_final IS NOT NULL AND (NEW.score_final < 0 OR NEW.score_final > 10) THEN RAISE(ABORT, 'score_final out of range 0-10') WHEN NEW.score_dao_duc IS NOT NULL AND (NEW.score_dao_duc < 0 OR NEW.score_dao_duc > 10) THEN RAISE(ABORT, 'score_dao_duc out of range 0-10') END; END` },
  { version: '20240730-049', sql: `CREATE INDEX IF NOT EXISTS idx_promotion_records_target_class ON promotion_records(target_class_id)` },
  { version: '20240730-050', sql: `CREATE INDEX IF NOT EXISTS idx_promotion_records_approved_by ON promotion_records(approved_by)` },
  { version: '20240730-051', sql: `CREATE TRIGGER IF NOT EXISTS check_outbox_messages_status_insert BEFORE INSERT ON outbox_messages BEGIN SELECT CASE WHEN NEW.status NOT IN ('pending', 'dispatched', 'failed') THEN RAISE(ABORT, 'outbox_messages status invalid') END; END` },
  { version: '20240730-052', sql: `CREATE TRIGGER IF NOT EXISTS check_grade_overrides_field_insert BEFORE INSERT ON grade_overrides BEGIN SELECT CASE WHEN NEW.score_field NOT IN ('scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc') THEN RAISE(ABORT, 'grade_overrides score_field invalid') END; END` },
  { version: '20240802-053', sql: `ALTER TABLE grades ADD COLUMN score_oral_source TEXT` },
  { version: '20240802-054', sql: `ALTER TABLE grades ADD COLUMN score_oral_updated_at TEXT` },
  { version: '20240802-055', sql: `ALTER TABLE grades ADD COLUMN score_15m_source TEXT` },
  { version: '20240802-056', sql: `ALTER TABLE grades ADD COLUMN score_15m_updated_at TEXT` },
  { version: '20240802-057', sql: `ALTER TABLE grades ADD COLUMN score_1_period_source TEXT` },
  { version: '20240802-058', sql: `ALTER TABLE grades ADD COLUMN score_1_period_updated_at TEXT` },
  { version: '20240802-059', sql: `ALTER TABLE grades ADD COLUMN score_midterm_source TEXT` },
  { version: '20240802-060', sql: `ALTER TABLE grades ADD COLUMN score_midterm_updated_at TEXT` },
  { version: '20240802-061', sql: `ALTER TABLE grades ADD COLUMN score_final_source TEXT` },
  { version: '20240802-062', sql: `ALTER TABLE grades ADD COLUMN score_final_updated_at TEXT` },
  // ADR-016: Unique attendance index must include parish_id for multi-tenancy isolation.
  // Existing DBs with the old inline UNIQUE(student_id, date, type) constraint keep that
  // constraint (SQLite cannot drop it without table rebuild); the new composite index
  // enforces the correct multi-tenant key without a destructive rebuild.
  { version: '20260803-063', sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique ON attendance(parish_id, student_id, date, type)` },
  // ADR-016 (offline-sync audit #3): idempotency key cho student CREATE — client gửi
  // temp id làm key; retry sau timeout trả về student đã tạo thay vì tạo trùng.
  { version: '20260803-064', sql: `ALTER TABLE students ADD COLUMN idempotency_key TEXT` },
  // ADR-018 (import/export audit #4): score_dao_duc source/updated_at metadata —
  // client set scoreDaoDuc_source/updated_at khi import nhưng server không có cột
  // → Drizzle bỏ qua im lặng, mất audit trail cho điểm Đạo Đức.
  { version: '20260804-065', sql: `ALTER TABLE grades ADD COLUMN score_dao_duc_source TEXT` },
  { version: '20260804-066', sql: `ALTER TABLE grades ADD COLUMN score_dao_duc_updated_at TEXT` },
  // Academic Year Lifecycle (state machine + snapshots):
  { version: '20260805-067', sql: `ALTER TABLE academic_years ADD COLUMN status TEXT NOT NULL DEFAULT 'OPEN'` },
  { version: '20260805-068', sql: `ALTER TABLE academic_years ADD COLUMN current_semester INTEGER NOT NULL DEFAULT 1` },
  { version: '20260805-069', sql: `CREATE TABLE IF NOT EXISTS academic_year_snapshots (id TEXT PRIMARY KEY, parish_id TEXT NOT NULL DEFAULT 'gia-ton', academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, semester1_gpa REAL, semester2_gpa REAL, year_gpa REAL, classification TEXT, attendance_rate REAL, promotion_status TEXT CHECK(promotion_status IN ('PROMOTED', 'RETAINED', 'GRADUATED', 'CONDITIONALLY_PROMOTED', 'TRANSFERRED')), generated_by TEXT NOT NULL, generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(parish_id, student_id, academic_year_id))` },
  { version: '20260805-070', sql: `CREATE INDEX IF NOT EXISTS idx_academic_year_snapshots_student ON academic_year_snapshots(parish_id, student_id, academic_year_id)` },
  { version: '20260805-071', sql: `CREATE INDEX IF NOT EXISTS idx_academic_year_snapshots_year ON academic_year_snapshots(parish_id, academic_year_id)` },
  // P1 cleanup: student_scores và class_name_mappings là bảng chết (không service nào đọc/ghi,
  // import mappings thực tế dùng mapping_memory). Fresh DB: không còn CREATE ở base block nên
  // DROP là no-op. DB đã deploy: dọn bảng + dữ liệu tồn đọng (đã rút khỏi purge list).
  { version: '20260806-072', sql: `DROP TABLE IF EXISTS student_scores` },
  { version: '20260806-073', sql: `DROP TABLE IF EXISTS class_name_mappings` },
  // P2 audit: index khai báo trong Drizzle schema.ts nhưng thiếu ở DB đã deploy (migration
  // 036 gốc là ALTER TABLE import_batch_students ADD COLUMN created_at — trùng lặp với 033,
  // không phải tạo index nên DB cũ chưa từng có các index này). Boot loop tạo tự động
  // cho fresh DB; migration này bảo đảm DB deploy sẵn cũng có index (IF NOT EXISTS = no-op).
  { version: '20260807-074', sql: `CREATE INDEX IF NOT EXISTS idx_classes_idempotency ON classes(idempotency_key)` },
  { version: '20260807-075', sql: `CREATE INDEX IF NOT EXISTS idx_mapping_memory_entity_id ON mapping_memory(entity_id)` },
  { version: '20260807-076', sql: `CREATE INDEX IF NOT EXISTS idx_grade_overrides_lookup ON grade_overrides(grade_id, score_field)` },
  { version: '20260807-077', sql: `CREATE INDEX IF NOT EXISTS idx_outbox_messages_status ON outbox_messages(status, created_at)` },
  { version: '20260807-078', sql: `CREATE INDEX IF NOT EXISTS idx_semester_locks_lookup ON semester_locks(parish_id, academic_year, semester)` },
  { version: '20260807-079', sql: `CREATE INDEX IF NOT EXISTS idx_promotion_records_lookup ON promotion_records(parish_id, student_id, academic_year)` },
  // JWT refresh rotation: bảng phiên refresh token (sha256 hash) cho rotation + reuse detection.
  { version: '20260807-080', sql: `CREATE TABLE IF NOT EXISTS refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, parish_id TEXT NOT NULL DEFAULT 'gia-ton', token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, revoked_at TEXT, replaced_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  // Bản mã hóa (AES-256-GCM) của mật khẩu hiện tại — admin xem lại được trong cột
  // "Mật Khẩu" (trang Quản Lý Tài Khoản) mà DB không chứa plaintext. KHÔNG mã hóa
  // nếu thiếu env PASSWORD_CIPHER_KEY (khóa hiển thị tắt, cột hiển thị "—"). Xem ADR-021.
  { version: '20260807-081', sql: `ALTER TABLE users ADD COLUMN password_encrypted TEXT` },
  // Push có chủ đích: web push thông báo chỉ gửi tới subscriptions của các
  // userId trong danh sách này (JSON array) — dùng khi thông báo nhắm vào một
  // nhóm người dùng (ví dụ: phụ huynh theo chi đoàn). Lưu ở DB để queue
  // recover sau restart KHÔNG broadcast nhầm thành gửi toàn giáo xứ. Xem ADR-022.
  { version: '20260808-082', sql: `ALTER TABLE notifications ADD COLUMN target_user_ids TEXT` },
  // Smart Exam Grading (Phase 1, exam grading plan (đã triển khai — xem ADR-023/024) §3): phiên chấm + kết quả.
  // Server chỉ lưu dữ liệu + validate — mọi điểm vẫn qua gradeService.upsertGrade.
  { version: '20260808-083', sql: `CREATE TABLE IF NOT EXISTS exam_sessions (id TEXT PRIMARY KEY, parish_id TEXT NOT NULL DEFAULT 'gia-ton', class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, subject TEXT NOT NULL, score_type TEXT NOT NULL CHECK(score_type IN ('oral', '15m', '1period', 'midterm', 'final')), max_score INTEGER NOT NULL DEFAULT 10, semester INTEGER NOT NULL, academic_year TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'completed')), created_by TEXT NOT NULL, completed_by TEXT, completed_at TEXT, exam_type TEXT NOT NULL DEFAULT 'written', question_count INTEGER, answer_key TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { version: '20260808-084', sql: `CREATE TABLE IF NOT EXISTS exam_results (id TEXT PRIMARY KEY, exam_session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, score REAL NOT NULL, source TEXT NOT NULL DEFAULT 'qr_scan', answers TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(exam_session_id, student_id))` },
  { version: '20260808-085', sql: `CREATE INDEX IF NOT EXISTS idx_exam_sessions_class ON exam_sessions(parish_id, class_id, score_type)` },
  { version: '20260808-086', sql: `CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_sessions(parish_id, status, created_at)` },
  // exam_results cần parish_id cho scope multi-tenant + purge (v1.0 thiếu → sửa ở 087;
  // DB mới: 084 tạo bảng trước rồi 087 thêm cột — kết quả giống nhau).
  { version: '20260808-087', sql: `ALTER TABLE exam_results ADD COLUMN parish_id TEXT NOT NULL DEFAULT 'gia-ton'` },
  { version: '20260808-088', sql: `CREATE INDEX IF NOT EXISTS idx_exam_results_lookup ON exam_results(parish_id, exam_session_id)` },
  { version: '20260808-089', sql: `ALTER TABLE exam_sessions ADD COLUMN exam_type TEXT NOT NULL DEFAULT 'written'` },
  { version: '20260808-090', sql: `ALTER TABLE exam_sessions ADD COLUMN question_count INTEGER` },
  { version: '20260808-091', sql: `ALTER TABLE exam_sessions ADD COLUMN answer_key TEXT` },
  { version: '20260808-092', sql: `ALTER TABLE exam_results ADD COLUMN answers TEXT` },
  // Phase 3 (offline exam sync, ADR-023): idempotencyKey chống duplicate session
  // khi retry CREATE offline (pattern ADR-016 student/class) — syncProcessor gửi
  // kèm temp id, server trả session đã tạo thay vì tạo trùng.
  { version: '20260808-093', sql: `ALTER TABLE exam_sessions ADD COLUMN idempotency_key TEXT` },
  { version: '20260808-094', sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_sessions_idempotency ON exam_sessions(idempotency_key)` },
  // ADR-021 rewrite (2026-08-08): dọn legacy ciphertext của "current password" từ model cũ.
  // v1 lưu bản mã hóa pass HIỆN TẠI ở mọi write path (kể cả user tự đổi pass) — mới đây
  // chỉ lưu cho password tạm admin-đặt (status FORCE_PASSWORD_CHANGE). User đã ở trạng thái
  // khác (đã đổi pass chủ động) → xóa bản mã hóa để KHÔNG còn password-recovery secret.
  { version: '20260808-095', sql: `UPDATE users SET password_encrypted = NULL WHERE status != 'FORCE_PASSWORD_CHANGE'` },
  // audit (P4): grade_overrides + outbox_messages v1.0
  // thiếu parish_id → thêm cột (mặc định 'gia-ton' cho dữ liệu cũ) + index scope
  // multi-tenant. DB mới tạo theo schema.ts (drizzle) — migration này chỉ chạy
  // trên DB deploy sẵn (bảng schema_migrations đã có version cũ hơn).
  { version: '20260808-096', sql: `ALTER TABLE grade_overrides ADD COLUMN parish_id TEXT NOT NULL DEFAULT 'gia-ton'` },
  { version: '20260808-097', sql: `ALTER TABLE outbox_messages ADD COLUMN parish_id TEXT NOT NULL DEFAULT 'gia-ton'` },
  { version: '20260808-098', sql: `CREATE INDEX IF NOT EXISTS idx_grade_overrides_parish ON grade_overrides(parish_id)` },
  { version: '20260808-099', sql: `CREATE INDEX IF NOT EXISTS idx_outbox_messages_parish ON outbox_messages(parish_id, status)` },
  // Backfill: override tồn tại TRƯỚC migration 096 đều rơi vào default 'gia-ton'
  // dù grade thật của giáo xứ khác — khôi phục đúng tenant qua join grades
  // (grade_overrides.grade_id → grades.parish_id, FK cascade đảm bảo luôn resolve).
  { version: '20260808-100', sql: `UPDATE grade_overrides SET parish_id = (SELECT g.parish_id FROM grades g WHERE g.id = grade_overrides.grade_id) WHERE parish_id = 'gia-ton'` },
  // audit (AYL-04): semester_locks thêm unlocked_by/unlocked_at —
  // unlock ghi ai mở khóa + thời điểm. ALTER an toàn trên DB cũ (runner bỏ qua duplicate column).
  { version: '20260808-101', sql: `ALTER TABLE semester_locks ADD COLUMN unlocked_by TEXT` },
  { version: '20260808-102', sql: `ALTER TABLE semester_locks ADD COLUMN unlocked_at TEXT` },
  // A-NEW-36 (2026-08-11): system_settings PK (key) GLOBAL → composite (key, parish_id).
  // Trước đây key là PK toàn cục nên key chỉ tồn tại 1 row/1 parish (insert parish thứ
  // hai SQLITE_CONSTRAINT) và purge upsert không lọc parish đè row parish khác. Không
  // thể ALTER TABLE cho composite PK trong SQLite → rebuild: rename → tạo mới (base DDL
  // đã đổi cho fresh DB) → copy dữ liệu → drop cũ + index.
  { version: '20260811-103', sql: `ALTER TABLE system_settings RENAME TO system_settings_old;
    CREATE TABLE system_settings (
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      parish_id TEXT NOT NULL DEFAULT 'gia-ton',
      PRIMARY KEY (key, parish_id)
    );
    INSERT INTO system_settings (key, value, description, updated_by, updated_at, parish_id)
      SELECT key, value, description, updated_by, updated_at, parish_id FROM system_settings_old;
    DROP TABLE system_settings_old;
    CREATE INDEX IF NOT EXISTS idx_system_settings_parish_id ON system_settings(parish_id)` },
  // ADR-027 (2026-08-12): Tên Thánh GLV + username tự sinh `chức vụ_Tên thánh + Họ và tên`
  // (bỏ dấu, nối liền, viết thường — vd: glv_pherophanvanbao). Cột nullable — user cũ
  // không có Tên Thánh; CREATE USER mới bắt buộc nhập. Runner bỏ qua duplicate column
  // trên DB đã deploy (C-03).
  { version: '20260812-104', sql: `ALTER TABLE users ADD COLUMN holy_name TEXT` },
  { version: '20260812-105', sql: `ALTER TABLE notices ADD COLUMN idempotency_key TEXT` },
  { version: '20260812-106', sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_notices_idempotency ON notices(idempotency_key)` },
  { version: '20260812-107', sql: `ALTER TABLE import_batches ADD COLUMN classes_created TEXT DEFAULT '[]'` },
  { version: '20260812-108', sql: `
    PRAGMA defer_foreign_keys=ON;
    DROP TABLE IF EXISTS import_batches_new;
    CREATE TABLE import_batches_new (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      file_name TEXT,
      content_hash TEXT,
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      classes_created TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'partial', 'failed', 'undone', 'partial_undone')),
      parish_id TEXT NOT NULL DEFAULT 'gia-ton',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO import_batches_new (id, user_id, file_name, content_hash, total_rows, imported, skipped, error_count, classes_created, status, parish_id, created_at)
    SELECT id, user_id, file_name, content_hash, total_rows, imported, skipped, error_count, classes_created, status, parish_id, created_at FROM import_batches;
    DROP TABLE import_batches;
    ALTER TABLE import_batches_new RENAME TO import_batches;
  ` },
  { version: '20260812-109', sql: `
    PRAGMA defer_foreign_keys=ON;
    DROP TABLE IF EXISTS grades_new;
    CREATE TABLE grades_new (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      academic_year TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      semester INTEGER NOT NULL CHECK(semester IN (1, 2)),
      score_oral REAL,
      score_15m REAL,
      score_1_period REAL,
      score_midterm REAL,
      score_final REAL,
      score_dao_duc REAL,
      comments TEXT,
      score_oral_source TEXT,
      score_oral_updated_at TEXT,
      score_15m_source TEXT,
      score_15m_updated_at TEXT,
      score_1_period_source TEXT,
      score_1_period_updated_at TEXT,
      score_midterm_source TEXT,
      score_midterm_updated_at TEXT,
      score_final_source TEXT,
      score_final_updated_at TEXT,
      score_dao_duc_source TEXT,
      score_dao_duc_updated_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      parish_id TEXT NOT NULL DEFAULT 'gia-ton',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    );
    INSERT INTO grades_new (id, student_id, academic_year, semester, score_oral, score_15m, score_1_period, score_midterm, score_final, score_dao_duc, comments, score_oral_source, score_oral_updated_at, score_15m_source, score_15m_updated_at, score_1_period_source, score_1_period_updated_at, score_midterm_source, score_midterm_updated_at, score_final_source, score_final_updated_at, score_dao_duc_source, score_dao_duc_updated_at, version, parish_id, created_at, updated_at, updated_by)
    SELECT id, student_id, academic_year, semester, score_oral, score_15m, score_1_period, score_midterm, score_final, score_dao_duc, comments, score_oral_source, score_oral_updated_at, score_15m_source, score_15m_updated_at, score_1_period_source, score_1_period_updated_at, score_midterm_source, score_midterm_updated_at, score_final_source, score_final_updated_at, score_dao_duc_source, score_dao_duc_updated_at, version, parish_id, created_at, updated_at, updated_by FROM grades;
    DROP TABLE grades;
    ALTER TABLE grades_new RENAME TO grades;
  `   },
  // Telegram parent notifications (Option 2): store only one-time token hashes and
  // consent-aware chat links. Telegram chat IDs are unique globally, so a chat can
  // never be attached to two parent accounts at the same time.
  { version: '20260812-110', sql: `CREATE TABLE IF NOT EXISTS telegram_link_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )` },
  { version: '20260812-111', sql: `CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user ON telegram_link_tokens(parish_id, user_id)` },
  { version: '20260812-112', sql: `CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expiry ON telegram_link_tokens(expires_at)` },
  { version: '20260812-113', sql: `CREATE TABLE IF NOT EXISTS telegram_links (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    chat_id TEXT NOT NULL UNIQUE,
    telegram_user_id TEXT,
    telegram_username TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'REVOKED')),
    notifications_enabled INTEGER NOT NULL DEFAULT 1,
    linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT,
    last_seen_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )` },
  { version: '20260812-114', sql: `CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON telegram_links(parish_id, user_id, status)` },
  { version: '20260812-115', sql: `CREATE INDEX IF NOT EXISTS idx_telegram_links_chat_status ON telegram_links(chat_id, status)` },
  { version: '20260813-116', sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_students_code_parish ON students(parish_id, code)` },
  { version: '20260814-109', sql: `
CREATE TABLE "__new_academic_year_snapshots" (
	"id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"academic_year_id" text NOT NULL,
	"student_id" text NOT NULL,
	"semester1_gpa" real,
	"semester2_gpa" real,
	"year_gpa" real,
	"classification" text,
	"attendance_rate" real,
	"promotion_status" text,
	"generated_by" text NOT NULL,
	"generated_at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","academic_year_id") REFERENCES "academic_years"("parish_id","id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("parish_id","student_id") REFERENCES "students"("parish_id","id") ON UPDATE no action ON DELETE restrict
);

INSERT INTO "__new_academic_year_snapshots"("id", "parish_id", "academic_year_id", "student_id", "semester1_gpa", "semester2_gpa", "year_gpa", "classification", "attendance_rate", "promotion_status", "generated_by", "generated_at", "created_at", "updated_at") SELECT "id", "parish_id", "academic_year_id", "student_id", "semester1_gpa", "semester2_gpa", "year_gpa", "classification", "attendance_rate", "promotion_status", "generated_by", "generated_at", "created_at", "updated_at" FROM "academic_year_snapshots";
DROP TABLE "academic_year_snapshots";
ALTER TABLE "__new_academic_year_snapshots" RENAME TO "academic_year_snapshots";

CREATE INDEX "idx_academic_year_snapshots_student" ON "academic_year_snapshots" ("parish_id","student_id","academic_year_id");
CREATE INDEX "idx_academic_year_snapshots_year" ON "academic_year_snapshots" ("parish_id","academic_year_id");
CREATE UNIQUE INDEX "idx_academic_year_snapshots_unique" ON "academic_year_snapshots" ("parish_id","student_id","academic_year_id");
CREATE TABLE "__new_assessments" (
	"id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"semester" integer NOT NULL,
	"academic_year_id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","academic_year_id") REFERENCES "academic_years"("parish_id","id") ON UPDATE no action ON DELETE restrict
);

INSERT INTO "__new_assessments"("id", "name", "type", "weight", "semester", "academic_year_id", "parish_id", "created_at", "updated_at") SELECT "id", "name", "type", "weight", "semester", "academic_year_id", "parish_id", "created_at", "updated_at" FROM "assessments";
DROP TABLE "assessments";
ALTER TABLE "__new_assessments" RENAME TO "assessments";
CREATE INDEX "idx_assessments_lookup" ON "assessments" ("parish_id","academic_year_id","semester");
CREATE TABLE "__new_attendance" (
	"id" text NOT NULL,
	"student_id" text NOT NULL,
	"date" text NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" text,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","student_id") REFERENCES "students"("parish_id","id") ON UPDATE no action ON DELETE restrict
);

INSERT INTO "__new_attendance"("id", "student_id", "date", "type", "status", "note", "version", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "student_id", "date", "type", "status", "note", "version", "parish_id", "created_at", "updated_at", "updated_by" FROM "attendance";
DROP TABLE "attendance";
ALTER TABLE "__new_attendance" RENAME TO "attendance";
CREATE INDEX "idx_attendance_parish_id" ON "attendance" ("parish_id");
CREATE INDEX "idx_attendance_student_id" ON "attendance" ("student_id");
CREATE INDEX "idx_attendance_sync" ON "attendance" ("parish_id","updated_at");
CREATE INDEX "idx_attendance_lookup" ON "attendance" ("parish_id","student_id","date");
CREATE UNIQUE INDEX "idx_attendance_unique" ON "attendance" ("parish_id","student_id","date","type");
CREATE TABLE "__new_attendance_sessions" (
	"id" text NOT NULL,
	"class_id" text NOT NULL,
	"date" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","class_id") REFERENCES "classes"("parish_id","id") ON UPDATE no action ON DELETE restrict
);

INSERT INTO "__new_attendance_sessions"("id", "class_id", "date", "type", "status", "parish_id", "created_at", "updated_at") SELECT "id", "class_id", "date", "type", "status", "parish_id", "created_at", "updated_at" FROM "attendance_sessions";
DROP TABLE "attendance_sessions";
ALTER TABLE "__new_attendance_sessions" RENAME TO "attendance_sessions";
CREATE UNIQUE INDEX "idx_attendance_sessions_unique" ON "attendance_sessions" ("parish_id","class_id","date","type");
CREATE TABLE "__new_catechist_assignments" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"class_id" text NOT NULL,
	"role_in_class" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" text,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","user_id") REFERENCES "users"("parish_id","id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("parish_id","class_id") REFERENCES "classes"("parish_id","id") ON UPDATE no action ON DELETE restrict
);

INSERT INTO "__new_catechist_assignments"("id", "user_id", "class_id", "role_in_class", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "user_id", "class_id", "role_in_class", "parish_id", "created_at", "updated_at", "updated_by" FROM "catechist_assignments";
DROP TABLE "catechist_assignments";
ALTER TABLE "__new_catechist_assignments" RENAME TO "catechist_assignments";
CREATE INDEX "idx_catechist_assignments_parish_id" ON "catechist_assignments" ("parish_id");
CREATE INDEX "idx_catechist_assignments_user_id" ON "catechist_assignments" ("user_id");
CREATE UNIQUE INDEX "idx_catechist_assignments_unique" ON "catechist_assignments" ("user_id","class_id");
CREATE TABLE "__new_classes" (
	"id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"branch_id" text NOT NULL,
	"academic_year_id" text NOT NULL,
	"room" text,
	"idempotency_key" text,
	"deleted_at" text,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" text,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","branch_id") REFERENCES "branches"("parish_id","id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("parish_id","academic_year_id") REFERENCES "academic_years"("parish_id","id") ON UPDATE no action ON DELETE restrict
);

INSERT INTO "__new_classes"("id", "code", "name", "branch_id", "academic_year_id", "room", "idempotency_key", "deleted_at", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "code", "name", "branch_id", "academic_year_id", "room", "idempotency_key", "deleted_at", "parish_id", "created_at", "updated_at", "updated_by" FROM "classes";
DROP TABLE "classes";
ALTER TABLE "__new_classes" RENAME TO "classes";
CREATE INDEX "idx_classes_parish_id" ON "classes" ("parish_id");
CREATE UNIQUE INDEX "idx_classes_code_year" ON "classes" ("code","academic_year_id");
CREATE UNIQUE INDEX "idx_classes_idempotency" ON "classes" ("idempotency_key");
CREATE TABLE "__new_exam_results" (
	"id" text NOT NULL,
	"exam_session_id" text NOT NULL,
	"student_id" text NOT NULL,
	"score" real NOT NULL,
	"source" text DEFAULT 'qr_scan' NOT NULL,
	"answers" text,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","exam_session_id") REFERENCES "exam_sessions"("parish_id","id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("parish_id","student_id") REFERENCES "students"("parish_id","id") ON UPDATE no action ON DELETE restrict
);

INSERT INTO "__new_exam_results"("id", "exam_session_id", "student_id", "score", "source", "answers", "parish_id", "created_at") SELECT "id", "exam_session_id", "student_id", "score", "source", "answers", "parish_id", "created_at" FROM "exam_results";
DROP TABLE "exam_results";
ALTER TABLE "__new_exam_results" RENAME TO "exam_results";
CREATE UNIQUE INDEX "idx_exam_results_unique" ON "exam_results" ("exam_session_id","student_id");
CREATE INDEX "idx_exam_results_lookup" ON "exam_results" ("parish_id","exam_session_id");
CREATE TABLE "__new_exam_sessions" (
	"id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"class_id" text NOT NULL,
	"subject" text NOT NULL,
	"score_type" text NOT NULL,
	"max_score" integer DEFAULT 10 NOT NULL,
	"semester" integer NOT NULL,
	"academic_year" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"completed_by" text,
	"completed_at" text,
	"exam_type" text DEFAULT 'written' NOT NULL,
	"question_count" integer,
	"answer_key" text,
	"idempotency_key" text,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","class_id") REFERENCES "classes"("parish_id","id") ON UPDATE no action ON DELETE restrict
);

INSERT INTO "__new_exam_sessions"("id", "parish_id", "class_id", "subject", "score_type", "max_score", "semester", "academic_year", "status", "created_by", "completed_by", "completed_at", "exam_type", "question_count", "answer_key", "idempotency_key", "created_at") SELECT "id", "parish_id", "class_id", "subject", "score_type", "max_score", "semester", "academic_year", "status", "created_by", "completed_by", "completed_at", "exam_type", "question_count", "answer_key", "idempotency_key", "created_at" FROM "exam_sessions";
DROP TABLE "exam_sessions";
ALTER TABLE "__new_exam_sessions" RENAME TO "exam_sessions";
CREATE INDEX "idx_exam_sessions_class" ON "exam_sessions" ("parish_id","class_id","score_type");
CREATE INDEX "idx_exam_sessions_status" ON "exam_sessions" ("parish_id","status","created_at");
CREATE TABLE "__new_grade_import_hashes" (
	"id" text NOT NULL,
	"hash" text NOT NULL,
	"class_id" text NOT NULL,
	"semester" integer NOT NULL,
	"academic_year" text NOT NULL,
	"total_rows" integer NOT NULL,
	"user_id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL
);

INSERT INTO "__new_grade_import_hashes"("id", "hash", "class_id", "semester", "academic_year", "total_rows", "user_id", "parish_id", "created_at") SELECT "id", "hash", "class_id", "semester", "academic_year", "total_rows", "user_id", "parish_id", "created_at" FROM "grade_import_hashes";
DROP TABLE "grade_import_hashes";
ALTER TABLE "__new_grade_import_hashes" RENAME TO "grade_import_hashes";
CREATE UNIQUE INDEX "idx_grade_import_hashes_unique" ON "grade_import_hashes" ("hash","class_id","semester","academic_year","parish_id");
CREATE TABLE "__new_grade_overrides" (
	"id" text NOT NULL,
	"grade_id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"score_field" text NOT NULL,
	"manual_value" real NOT NULL,
	"reason_code" text DEFAULT 'TeacherAdjustment' NOT NULL,
	"reason_note" text,
	"overridden_by" text NOT NULL,
	"overridden_at" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","grade_id") REFERENCES "grades"("parish_id","id") ON UPDATE no action ON DELETE cascade
);

INSERT INTO "__new_grade_overrides"("id", "grade_id", "parish_id", "score_field", "manual_value", "reason_code", "reason_note", "overridden_by", "overridden_at", "version", "deleted_at", "created_at", "updated_at") SELECT "id", "grade_id", "parish_id", "score_field", "manual_value", "reason_code", "reason_note", "overridden_by", "overridden_at", "version", "deleted_at", "created_at", "updated_at" FROM "grade_overrides";
DROP TABLE "grade_overrides";
ALTER TABLE "__new_grade_overrides" RENAME TO "grade_overrides";
CREATE INDEX "idx_grade_overrides_lookup" ON "grade_overrides" ("grade_id","score_field");
CREATE INDEX "idx_grade_overrides_parish" ON "grade_overrides" ("parish_id");
CREATE TABLE "__new_grades" (
	"id" text NOT NULL,
	"student_id" text NOT NULL,
	"academic_year" text NOT NULL,
	"semester" integer NOT NULL,
	"score_oral" real,
	"score_15m" real,
	"score_1_period" real,
	"score_midterm" real,
	"score_final" real,
	"score_dao_duc" real,
	"comments" text,
	"score_oral_source" text,
	"score_oral_updated_at" text,
	"score_15m_source" text,
	"score_15m_updated_at" text,
	"score_1_period_source" text,
	"score_1_period_updated_at" text,
	"score_midterm_source" text,
	"score_midterm_updated_at" text,
	"score_final_source" text,
	"score_final_updated_at" text,
	"score_dao_duc_source" text,
	"score_dao_duc_updated_at" text,
	"version" integer DEFAULT 1 NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" text,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","student_id") REFERENCES "students"("parish_id","id") ON UPDATE no action ON DELETE no action
);

INSERT INTO "__new_grades"("id", "student_id", "academic_year", "semester", "score_oral", "score_15m", "score_1_period", "score_midterm", "score_final", "score_dao_duc", "comments", "score_oral_source", "score_oral_updated_at", "score_15m_source", "score_15m_updated_at", "score_1_period_source", "score_1_period_updated_at", "score_midterm_source", "score_midterm_updated_at", "score_final_source", "score_final_updated_at", "score_dao_duc_source", "score_dao_duc_updated_at", "version", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "student_id", "academic_year", "semester", "score_oral", "score_15m", "score_1_period", "score_midterm", "score_final", "score_dao_duc", "comments", "score_oral_source", "score_oral_updated_at", "score_15m_source", "score_15m_updated_at", "score_1_period_source", "score_1_period_updated_at", "score_midterm_source", "score_midterm_updated_at", "score_final_source", "score_final_updated_at", "score_dao_duc_source", "score_dao_duc_updated_at", "version", "parish_id", "created_at", "updated_at", "updated_by" FROM "grades";
DROP TABLE "grades";
ALTER TABLE "__new_grades" RENAME TO "grades";
CREATE INDEX "idx_grades_parish_id" ON "grades" ("parish_id");
CREATE INDEX "idx_grades_student_id" ON "grades" ("student_id");
CREATE INDEX "idx_grades_sync" ON "grades" ("parish_id","updated_at");
CREATE UNIQUE INDEX "idx_grades_lookup" ON "grades" ("parish_id","student_id","academic_year","semester");
CREATE TABLE "__new_import_batch_students" (
	"id" text NOT NULL,
	"batch_id" text NOT NULL,
	"student_id" text,
	"action" text NOT NULL,
	"row_index" integer NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","batch_id") REFERENCES "import_batches"("parish_id","id") ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY ("parish_id","student_id") REFERENCES "students"("parish_id","id") ON UPDATE no action ON DELETE set null
);

INSERT INTO "__new_import_batch_students"("id", "batch_id", "student_id", "action", "row_index", "parish_id", "created_at") SELECT "id", "batch_id", "student_id", "action", "row_index", "parish_id", "created_at" FROM "import_batch_students";
DROP TABLE "import_batch_students";
ALTER TABLE "__new_import_batch_students" RENAME TO "import_batch_students";
CREATE INDEX "idx_import_batch_students_batch_id" ON "import_batch_students" ("batch_id");
CREATE INDEX "idx_import_batch_students_parish_id" ON "import_batch_students" ("parish_id");
CREATE TABLE "__new_import_batches" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"file_name" text,
	"content_hash" text,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"classes_created" text DEFAULT '[]',
	"status" text DEFAULT 'processing' NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","user_id") REFERENCES "users"("parish_id","id") ON UPDATE no action ON DELETE no action
);

INSERT INTO "__new_import_batches"("id", "user_id", "file_name", "content_hash", "total_rows", "imported", "skipped", "error_count", "classes_created", "status", "parish_id", "created_at") SELECT "id", "user_id", "file_name", "content_hash", "total_rows", "imported", "skipped", "error_count", "classes_created", "status", "parish_id", "created_at" FROM "import_batches";
DROP TABLE "import_batches";
ALTER TABLE "__new_import_batches" RENAME TO "import_batches";
CREATE INDEX "idx_import_batches_parish_id" ON "import_batches" ("parish_id");
CREATE INDEX "idx_import_batches_user_id" ON "import_batches" ("user_id");
CREATE TABLE "__new_notifications" (
	"id" text NOT NULL,
	"student_id" text,
	"type" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"recipient" text NOT NULL,
	"message" text,
	"error" text,
	"triggered_by_type" text NOT NULL,
	"triggered_by_user_id" text,
	"sent_at" text,
	"target_user_ids" text,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","student_id") REFERENCES "students"("parish_id","id") ON UPDATE no action ON DELETE set null,
	FOREIGN KEY ("parish_id","triggered_by_user_id") REFERENCES "users"("parish_id","id") ON UPDATE no action ON DELETE set null
);

INSERT INTO "__new_notifications"("id", "student_id", "type", "channel", "status", "recipient", "message", "error", "triggered_by_type", "triggered_by_user_id", "sent_at", "target_user_ids", "parish_id", "created_at") SELECT "id", "student_id", "type", "channel", "status", "recipient", "message", "error", "triggered_by_type", "triggered_by_user_id", "sent_at", "target_user_ids", "parish_id", "created_at" FROM "notifications";
DROP TABLE "notifications";
ALTER TABLE "__new_notifications" RENAME TO "notifications";
CREATE INDEX "idx_notifications_parish_id" ON "notifications" ("parish_id");
CREATE INDEX "idx_notifications_lookup" ON "notifications" ("parish_id","status","created_at");
CREATE TABLE "__new_promotion_records" (
	"id" text NOT NULL,
	"student_id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"academic_year" text NOT NULL,
	"target_class_id" text NOT NULL,
	"next_class_id" text,
	"auto_decision" text NOT NULL,
	"final_decision" text NOT NULL,
	"is_overridden" integer DEFAULT 0 NOT NULL,
	"override_reason" text,
	"gpa_snapshot" real NOT NULL,
	"attendance_snapshot" real NOT NULL,
	"conduct_snapshot" text,
	"rules_version" text DEFAULT 'v1.0' NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_latest" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","student_id") REFERENCES "students"("parish_id","id") ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY ("parish_id","approved_by") REFERENCES "users"("parish_id","id") ON UPDATE no action ON DELETE no action
);

INSERT INTO "__new_promotion_records"("id", "student_id", "parish_id", "academic_year", "target_class_id", "next_class_id", "auto_decision", "final_decision", "is_overridden", "override_reason", "gpa_snapshot", "attendance_snapshot", "conduct_snapshot", "rules_version", "approved_by", "approved_at", "status", "version", "is_latest", "created_at", "updated_at") SELECT "id", "student_id", "parish_id", "academic_year", "target_class_id", "next_class_id", "auto_decision", "final_decision", "is_overridden", "override_reason", "gpa_snapshot", "attendance_snapshot", "conduct_snapshot", "rules_version", "approved_by", "approved_at", "status", "version", "is_latest", "created_at", "updated_at" FROM "promotion_records";
DROP TABLE "promotion_records";
ALTER TABLE "__new_promotion_records" RENAME TO "promotion_records";
CREATE INDEX "idx_promotion_records_lookup" ON "promotion_records" ("parish_id","student_id","academic_year");
CREATE UNIQUE INDEX "idx_promotion_records_unique" ON "promotion_records" ("parish_id","student_id","academic_year","version");
CREATE TABLE "__new_push_subscriptions" (
	"id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_id" text,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","user_id") REFERENCES "users"("parish_id","id") ON UPDATE no action ON DELETE set null
);

INSERT INTO "__new_push_subscriptions"("id", "endpoint", "p256dh", "auth", "user_id", "parish_id", "created_at") SELECT "id", "endpoint", "p256dh", "auth", "user_id", "parish_id", "created_at" FROM "push_subscriptions";
DROP TABLE "push_subscriptions";
ALTER TABLE "__new_push_subscriptions" RENAME TO "push_subscriptions";
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" ("endpoint");
CREATE INDEX "idx_push_subscriptions_parish_id" ON "push_subscriptions" ("parish_id");
CREATE INDEX "idx_push_subscriptions_user_id" ON "push_subscriptions" ("user_id");
CREATE TABLE "__new_refresh_tokens" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" text NOT NULL,
	"revoked_at" text,
	"replaced_by" text,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","user_id") REFERENCES "users"("parish_id","id") ON UPDATE no action ON DELETE cascade
);

INSERT INTO "__new_refresh_tokens"("id", "user_id", "parish_id", "token_hash", "expires_at", "revoked_at", "replaced_by", "created_at") SELECT "id", "user_id", "parish_id", "token_hash", "expires_at", "revoked_at", "replaced_by", "created_at" FROM "refresh_tokens";
DROP TABLE "refresh_tokens";
ALTER TABLE "__new_refresh_tokens" RENAME TO "refresh_tokens";
CREATE UNIQUE INDEX "refresh_tokens_token_hash_unique" ON "refresh_tokens" ("token_hash");
CREATE INDEX "idx_refresh_tokens_parish_id" ON "refresh_tokens" ("parish_id");
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("user_id");
CREATE TABLE "__new_role_permissions" (
	"role" text NOT NULL,
	"permission_id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	PRIMARY KEY("parish_id", "role", "permission_id"),
	FOREIGN KEY ("parish_id","permission_id") REFERENCES "permissions"("parish_id","id") ON UPDATE no action ON DELETE cascade
);

INSERT INTO "__new_role_permissions"("role", "permission_id", "parish_id") SELECT "role", "permission_id", "parish_id" FROM "role_permissions";
DROP TABLE "role_permissions";
ALTER TABLE "__new_role_permissions" RENAME TO "role_permissions";
CREATE UNIQUE INDEX "idx_role_permissions_pk" ON "role_permissions" ("role","permission_id");
CREATE TABLE "__new_service_assignments" (
	"id" text NOT NULL,
	"student_id" text NOT NULL,
	"service_type" text DEFAULT 'le_phuc_vu' NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"created_by" text,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","student_id") REFERENCES "students"("parish_id","id") ON UPDATE no action ON DELETE cascade
);

INSERT INTO "__new_service_assignments"("id", "student_id", "service_type", "parish_id", "created_at", "created_by") SELECT "id", "student_id", "service_type", "parish_id", "created_at", "created_by" FROM "service_assignments";
DROP TABLE "service_assignments";
ALTER TABLE "__new_service_assignments" RENAME TO "service_assignments";
CREATE UNIQUE INDEX "idx_service_assignments_unique" ON "service_assignments" ("student_id","service_type");
CREATE TABLE "__new_students" (
	"id" text NOT NULL,
	"code" text NOT NULL,
	"holy_name" text NOT NULL,
	"full_name" text NOT NULL,
	"gender" text NOT NULL,
	"date_of_birth" text NOT NULL,
	"baptism_date" text,
	"first_communion_date" text,
	"confirmation_date" text,
	"parent_name" text NOT NULL,
	"parent_phone" text NOT NULL,
	"address" text NOT NULL,
	"branch" text NOT NULL,
	"class_id" text NOT NULL,
	"avatar_url" text,
	"status" text DEFAULT 'Đang học' NOT NULL,
	"notes" text,
	"deleted_at" text,
	"idempotency_key" text,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" text,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","class_id") REFERENCES "classes"("parish_id","id") ON UPDATE no action ON DELETE restrict
);

INSERT INTO "__new_students"("id", "code", "holy_name", "full_name", "gender", "date_of_birth", "baptism_date", "first_communion_date", "confirmation_date", "parent_name", "parent_phone", "address", "branch", "class_id", "avatar_url", "status", "notes", "deleted_at", "idempotency_key", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "code", "holy_name", "full_name", "gender", "date_of_birth", "baptism_date", "first_communion_date", "confirmation_date", "parent_name", "parent_phone", "address", "branch", "class_id", "avatar_url", "status", "notes", "deleted_at", "idempotency_key", "parish_id", "created_at", "updated_at", "updated_by" FROM "students";
DROP TABLE "students";
ALTER TABLE "__new_students" RENAME TO "students";
CREATE INDEX "idx_students_parish_id" ON "students" ("parish_id");
CREATE INDEX "idx_students_class_id" ON "students" ("class_id");
CREATE UNIQUE INDEX "idx_students_idempotency" ON "students" ("idempotency_key");
CREATE UNIQUE INDEX "idx_students_code_parish" ON "students" ("parish_id","code");
CREATE TABLE "__new_telegram_link_tokens" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" text NOT NULL,
	"consumed_at" text,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","user_id") REFERENCES "users"("parish_id","id") ON UPDATE no action ON DELETE cascade
);

INSERT INTO "__new_telegram_link_tokens"("id", "user_id", "parish_id", "token_hash", "expires_at", "consumed_at", "created_at") SELECT "id", "user_id", "parish_id", "token_hash", "expires_at", "consumed_at", "created_at" FROM "telegram_link_tokens";
DROP TABLE "telegram_link_tokens";
ALTER TABLE "__new_telegram_link_tokens" RENAME TO "telegram_link_tokens";
CREATE UNIQUE INDEX "telegram_link_tokens_token_hash_unique" ON "telegram_link_tokens" ("token_hash");
CREATE INDEX "idx_telegram_link_tokens_user" ON "telegram_link_tokens" ("parish_id","user_id");
CREATE INDEX "idx_telegram_link_tokens_expiry" ON "telegram_link_tokens" ("expires_at");
CREATE TABLE "__new_telegram_links" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"chat_id" text NOT NULL,
	"telegram_user_id" text,
	"telegram_username" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notifications_enabled" integer DEFAULT 1 NOT NULL,
	"linked_at" text NOT NULL,
	"revoked_at" text,
	"last_seen_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id"),
	FOREIGN KEY ("parish_id","user_id") REFERENCES "users"("parish_id","id") ON UPDATE no action ON DELETE cascade
);

INSERT INTO "__new_telegram_links"("id", "user_id", "parish_id", "chat_id", "telegram_user_id", "telegram_username", "status", "notifications_enabled", "linked_at", "revoked_at", "last_seen_at", "created_at", "updated_at") SELECT "id", "user_id", "parish_id", "chat_id", "telegram_user_id", "telegram_username", "status", "notifications_enabled", "linked_at", "revoked_at", "last_seen_at", "created_at", "updated_at" FROM "telegram_links";
DROP TABLE "telegram_links";
ALTER TABLE "__new_telegram_links" RENAME TO "telegram_links";
CREATE UNIQUE INDEX "telegram_links_chat_id_unique" ON "telegram_links" ("chat_id");
CREATE INDEX "idx_telegram_links_user" ON "telegram_links" ("parish_id","user_id","status");
CREATE INDEX "idx_telegram_links_chat_status" ON "telegram_links" ("chat_id","status");
CREATE TABLE "__new_academic_years" (
	"id" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"is_locked" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"current_semester" integer DEFAULT 1 NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" text,
	PRIMARY KEY("parish_id", "id")
);

INSERT INTO "__new_academic_years"("id", "start_date", "end_date", "is_locked", "status", "current_semester", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "start_date", "end_date", "is_locked", "status", "current_semester", "parish_id", "created_at", "updated_at", "updated_by" FROM "academic_years";
DROP TABLE "academic_years";
ALTER TABLE "__new_academic_years" RENAME TO "academic_years";
CREATE INDEX "idx_academic_years_parish_id" ON "academic_years" ("parish_id");
CREATE TABLE "__new_audit_logs" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"ip" text,
	"user_agent" text,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id")
);

INSERT INTO "__new_audit_logs"("id", "user_id", "action", "entity_type", "entity_id", "old_value", "new_value", "ip", "user_agent", "parish_id", "created_at") SELECT "id", "user_id", "action", "entity_type", "entity_id", "old_value", "new_value", "ip", "user_agent", "parish_id", "created_at" FROM "audit_logs";
DROP TABLE "audit_logs";
ALTER TABLE "__new_audit_logs" RENAME TO "audit_logs";
CREATE INDEX "idx_audit_logs_parish_id" ON "audit_logs" ("parish_id");
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs" ("parish_id","entity_type","entity_id","created_at");
CREATE TABLE "__new_branches" (
	"id" text NOT NULL,
	"name" text NOT NULL,
	"scarf_color" text NOT NULL,
	"age_min" integer NOT NULL,
	"age_max" integer NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" text,
	PRIMARY KEY("parish_id", "id")
);

INSERT INTO "__new_branches"("id", "name", "scarf_color", "age_min", "age_max", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "name", "scarf_color", "age_min", "age_max", "parish_id", "created_at", "updated_at", "updated_by" FROM "branches";
DROP TABLE "branches";
ALTER TABLE "__new_branches" RENAME TO "branches";
CREATE INDEX "idx_branches_parish_id" ON "branches" ("parish_id");
CREATE TABLE "__new_mapping_memory" (
	"id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"scope" text NOT NULL,
	"alias" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_name" text,
	"academic_year_id" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id")
);

INSERT INTO "__new_mapping_memory"("id", "parish_id", "scope", "alias", "entity_id", "entity_name", "academic_year_id", "is_active", "created_by", "created_at") SELECT "id", "parish_id", "scope", "alias", "entity_id", "entity_name", "academic_year_id", "is_active", "created_by", "created_at" FROM "mapping_memory";
DROP TABLE "mapping_memory";
ALTER TABLE "__new_mapping_memory" RENAME TO "mapping_memory";
CREATE UNIQUE INDEX "idx_mapping_memory_unique" ON "mapping_memory" ("parish_id","scope","alias","academic_year_id");
CREATE INDEX "idx_mapping_memory_entity_id" ON "mapping_memory" ("entity_id");
CREATE TABLE "__new_notices" (
	"id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"date" text NOT NULL,
	"author" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"target_branch" text,
	"idempotency_key" text,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"updated_by" text,
	PRIMARY KEY("parish_id", "id")
);

INSERT INTO "__new_notices"("id", "title", "content", "date", "author", "priority", "target_branch", "idempotency_key", "parish_id", "created_at", "updated_at", "updated_by") SELECT "id", "title", "content", "date", "author", "priority", "target_branch", "idempotency_key", "parish_id", "created_at", "updated_at", "updated_by" FROM "notices";
DROP TABLE "notices";
ALTER TABLE "__new_notices" RENAME TO "notices";
CREATE INDEX "idx_notices_parish_id" ON "notices" ("parish_id");
CREATE INDEX "idx_notices_date" ON "notices" ("parish_id","date");
CREATE UNIQUE INDEX "idx_notices_idempotency" ON "notices" ("idempotency_key");
CREATE TABLE "__new_outbox_messages" (
	"id" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sequence_number" integer DEFAULT 1 NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id")
);

INSERT INTO "__new_outbox_messages"("id", "aggregate_id", "event_type", "payload", "status", "sequence_number", "parish_id", "created_at") SELECT "id", "aggregate_id", "event_type", "payload", "status", "sequence_number", "parish_id", "created_at" FROM "outbox_messages";
DROP TABLE "outbox_messages";
ALTER TABLE "__new_outbox_messages" RENAME TO "outbox_messages";
CREATE INDEX "idx_outbox_messages_status" ON "outbox_messages" ("status","created_at");
CREATE INDEX "idx_outbox_messages_parish" ON "outbox_messages" ("parish_id","status");
CREATE TABLE "__new_permissions" (
	"id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	PRIMARY KEY("parish_id", "id")
);

INSERT INTO "__new_permissions"("id", "name", "description", "parish_id") SELECT "id", "name", "description", "parish_id" FROM "permissions";
DROP TABLE "permissions";
ALTER TABLE "__new_permissions" RENAME TO "permissions";
CREATE INDEX "idx_permissions_parish_id" ON "permissions" ("parish_id");
CREATE TABLE "__new_semester_locks" (
	"id" text NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"academic_year" text NOT NULL,
	"semester" integer NOT NULL,
	"is_locked" integer DEFAULT 0 NOT NULL,
	"locked_by" text,
	"locked_at" text,
	"unlock_reason" text,
	"unlocked_by" text,
	"unlocked_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id")
);

INSERT INTO "__new_semester_locks"("id", "parish_id", "academic_year", "semester", "is_locked", "locked_by", "locked_at", "unlock_reason", "unlocked_by", "unlocked_at", "created_at", "updated_at") SELECT "id", "parish_id", "academic_year", "semester", "is_locked", "locked_by", "locked_at", "unlock_reason", "unlocked_by", "unlocked_at", "created_at", "updated_at" FROM "semester_locks";
DROP TABLE "semester_locks";
ALTER TABLE "__new_semester_locks" RENAME TO "semester_locks";
CREATE INDEX "idx_semester_locks_lookup" ON "semester_locks" ("parish_id","academic_year","semester");
CREATE UNIQUE INDEX "idx_semester_locks_unique" ON "semester_locks" ("parish_id","academic_year","semester");
CREATE TABLE "__new_users" (
	"id" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_encrypted" text,
	"full_name" text NOT NULL,
	"holy_name" text,
	"phone" text,
	"role" text DEFAULT 'phuta' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" text,
	"last_login_at" text,
	"must_change_password" integer DEFAULT 1 NOT NULL,
	"parish_id" text DEFAULT 'gia-ton' NOT NULL,
	"created_at" text NOT NULL,
	PRIMARY KEY("parish_id", "id")
);

INSERT INTO "__new_users"("id", "username", "password_hash", "password_encrypted", "full_name", "holy_name", "phone", "role", "status", "token_version", "failed_attempts", "locked_until", "last_login_at", "must_change_password", "parish_id", "created_at") SELECT "id", "username", "password_hash", "password_encrypted", "full_name", "holy_name", "phone", "role", "status", "token_version", "failed_attempts", "locked_until", "last_login_at", "must_change_password", "parish_id", "created_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "__new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_unique" ON "users" ("username");
CREATE INDEX "idx_users_parish_id" ON "users" ("parish_id");
  ` },
  // C1 (audit 2026-08-14): rebuild 109 đánh rơi idx_exam_sessions_idempotency UNIQUE
  // (được tạo bởi migration 094). Khôi phục DB-level idempotency guard (ADR-023):
  // app-layer dedup (examService SERV-EXAM-1) vẫn giữ — index là backstop chống
  // duplicate session khi retry offline-sync. Single-statement, an toàn cho DB deploy.
  { version: '20260814-117', sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_sessions_idempotency ON exam_sessions(idempotency_key)` },
  // ADR-033: Create leave_requests table for parent online leave application & attendance auto-sync
  { version: '20260814-118', sql: `
CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  student_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  parent_id TEXT,
  parent_name TEXT NOT NULL,
  parent_phone TEXT NOT NULL,
  date TEXT NOT NULL,
  session_types TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by TEXT,
  reviewer_name TEXT,
  review_note TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(parish_id, id),
  FOREIGN KEY(parish_id, student_id) REFERENCES students(parish_id, id) ON DELETE CASCADE,
  FOREIGN KEY(parish_id, class_id) REFERENCES classes(parish_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_parish ON leave_requests(parish_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_class ON leave_requests(parish_id, class_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_student ON leave_requests(parish_id, student_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_date ON leave_requests(parish_id, date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(parish_id, status);
` },
  // Level 2 (ADR-023): Smart Exam Paper Management — store full questions JSON in exam_sessions
  { version: '20260815-119', sql: `ALTER TABLE exam_sessions ADD COLUMN questions TEXT` },
  // ADR-039: Parish Financial & Fund Management (Funds, Transactions, Student Fee Records)
  { version: '20260815-120', sql: `
CREATE TABLE IF NOT EXISTS funds (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  initial_balance REAL NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_funds_code_parish ON funds(parish_id, code);
CREATE INDEX IF NOT EXISTS idx_funds_parish ON funds(parish_id);

CREATE TABLE IF NOT EXISTS financial_transactions (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  fund_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  person_name TEXT,
  person_phone TEXT,
  student_id TEXT,
  class_id TEXT,
  academic_year TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  receipt_number TEXT,
  proof_url TEXT,
  target_fund_id TEXT,
  recorded_by TEXT NOT NULL,
  recorded_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id, id),
  FOREIGN KEY (parish_id, fund_id) REFERENCES funds(parish_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_transactions_fund ON financial_transactions(parish_id, fund_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON financial_transactions(parish_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_academic ON financial_transactions(parish_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_transactions_class ON financial_transactions(parish_id, class_id);

CREATE TABLE IF NOT EXISTS student_fee_records (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  student_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  fee_type TEXT NOT NULL DEFAULT 'NIEN_LIEM' CHECK(fee_type IN ('NIEN_LIEM', 'TRAI_HE', 'DONG_PHUC', 'GIAO_LY', 'OTHER')),
  title TEXT NOT NULL,
  expected_amount REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('UNPAID', 'PARTIAL', 'PAID', 'EXEMPTED')),
  paid_date TEXT,
  transaction_id TEXT,
  note TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id, id),
  FOREIGN KEY (parish_id, student_id) REFERENCES students(parish_id, id) ON DELETE CASCADE,
  FOREIGN KEY (parish_id, class_id) REFERENCES classes(parish_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_fees_unique ON student_fee_records(parish_id, student_id, academic_year, fee_type);
CREATE INDEX IF NOT EXISTS idx_student_fees_class ON student_fee_records(parish_id, class_id, academic_year);

INSERT OR IGNORE INTO funds (id, parish_id, name, code, description, initial_balance, is_default, is_active)
VALUES 
  ('FND-001-GENERAL', 'gia-ton', 'Quỹ Chung Xứ Đoàn', 'GENERAL', 'Quỹ hoạt động chính của Xứ Đoàn TNTT', 0, 1, 1),
  ('FND-002-CHARITY', 'gia-ton', 'Quỹ Bác Ái', 'CHARITY', 'Quỹ hỗ trợ thiếu nhi khó khăn và bác ái mùa Chay', 0, 0, 1),
  ('FND-003-CAMP', 'gia-ton', 'Quỹ Trại Hè & Sự Kiện', 'CAMP', 'Quỹ tổ chức sa mạc huấn luyện, trại hè và các ngày lễ lớn', 0, 0, 1),
  ('FND-004-LEADERS', 'gia-ton', 'Quỹ Huynh Trưởng', 'LEADERS', 'Quỹ sinh hoạt và đào tạo Ban Huynh Trưởng', 0, 0, 1);
` },
  // ADR-046 (2026-08-16): users.username UNIQUE toàn cục → composite (parish_id, username).
  // Global unique chặn 2 giáo xứ dùng chung username (PH: username = SĐT — ADR-026/027) và
  // login (auth.ts) lookup không filter parish. Composite unique không mất data (global unique
  // ⊃ per-parish unique — subset không thể có duplicate trong cùng parish). DROP index cũ
  // trước khi tạo composite — single-statement idempotent, an toàn cho DB đang chạy.
  { version: '20260816-121', sql: `
DROP INDEX IF EXISTS users_username_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_parish ON users(parish_id, username);
` },
  // ADR-048: server-authoritative exam finalization ledger.  These are add-only
  // tables so existing grades/exam sessions remain compatible during rollout.
  { version: '20260817-122', sql: `
CREATE TABLE IF NOT EXISTS assessment_entries (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  student_id TEXT NOT NULL,
  exam_session_id TEXT,
  academic_year TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK(semester IN (1, 2)),
  score_type TEXT NOT NULL CHECK(score_type IN ('oral', '15m', '1period', 'midterm', 'final')),
  raw_score REAL NOT NULL CHECK(raw_score >= 0),
  max_score REAL NOT NULL DEFAULT 10 CHECK(max_score > 0 AND max_score <= 10),
  score REAL NOT NULL CHECK(score >= 0 AND score <= 10),
  source TEXT NOT NULL CHECK(source IN ('exam_finalization', 'legacy_baseline')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(parish_id, id),
  FOREIGN KEY(parish_id, student_id) REFERENCES students(parish_id, id) ON DELETE RESTRICT,
  FOREIGN KEY(parish_id, exam_session_id) REFERENCES exam_sessions(parish_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_entries_exam_student ON assessment_entries(parish_id, exam_session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_assessment_entries_lookup ON assessment_entries(parish_id, student_id, academic_year, semester, score_type);

CREATE TABLE IF NOT EXISTS exam_finalizations (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  exam_session_id TEXT NOT NULL,
  completed_by TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(parish_id, id),
  FOREIGN KEY(parish_id, exam_session_id) REFERENCES exam_sessions(parish_id, id) ON DELETE CASCADE,
  UNIQUE(parish_id, exam_session_id)
);

CREATE TABLE IF NOT EXISTS exam_finalization_items (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  finalization_id TEXT NOT NULL,
  exam_result_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  grade_id TEXT,
  score_field TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('committed', 'conflict')),
  existing_source TEXT,
  raw_score REAL NOT NULL,
  final_score REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(parish_id, id),
  FOREIGN KEY(parish_id, finalization_id) REFERENCES exam_finalizations(parish_id, id) ON DELETE CASCADE,
  FOREIGN KEY(parish_id, student_id) REFERENCES students(parish_id, id) ON DELETE RESTRICT,
  UNIQUE(parish_id, finalization_id, exam_result_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_finalization_items_lookup ON exam_finalization_items(parish_id, finalization_id, student_id);
` },
  // ADR-049: Scan Engine v2 diagnostics. Add-only, nullable and compatible with
  // legacy/offline results. Images are explicitly forbidden by the API layer.
  { version: '20260818-123', sql: `ALTER TABLE exam_results ADD COLUMN scan_metadata TEXT` },
  // Tách hai ADD COLUMN thành hai migration single-statement để deploy dở dang
  // có thể tự phục hồi qua duplicate-column tolerance của migration runner.
  { version: '20260818-124', sql: `ALTER TABLE exam_sessions ADD COLUMN answer_variants TEXT` },
  { version: '20260818-125', sql: `ALTER TABLE exam_results ADD COLUMN exam_version TEXT NOT NULL DEFAULT 'A'` },
  // Domain 2 multi-tenant hardening: migration 109 rebuilt these tenant-local
  // unique keys without parish_id. Recreate only those explicit indexes with
  // parish_id first so same logical IDs/codes can coexist in different parishes.
  { version: '20260820-126', sql: `
DROP INDEX IF EXISTS idx_classes_code_year;
CREATE UNIQUE INDEX idx_classes_code_year ON classes(parish_id, code, academic_year_id);
DROP INDEX IF EXISTS idx_catechist_assignments_unique;
CREATE UNIQUE INDEX idx_catechist_assignments_unique ON catechist_assignments(parish_id, user_id, class_id);
DROP INDEX IF EXISTS idx_role_permissions_pk;
CREATE UNIQUE INDEX idx_role_permissions_pk ON role_permissions(parish_id, role, permission_id);
DROP INDEX IF EXISTS idx_service_assignments_unique;
CREATE UNIQUE INDEX idx_service_assignments_unique ON service_assignments(parish_id, student_id, service_type);
DROP INDEX IF EXISTS idx_exam_results_unique;
CREATE UNIQUE INDEX idx_exam_results_unique ON exam_results(parish_id, exam_session_id, student_id);
` },
]

async function runMigrations() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const { rows } = await client.execute(`SELECT version FROM schema_migrations`)
  const applied = new Set((rows || []).map((r: any) => r.version))

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue

    const isMultiStatement = migration.sql.includes(';')
    try {
      if (isMultiStatement) {
        // Multi-statement table rebuilds in SQLite: execute with foreign_keys OFF in executeMultiple
        const cleanSql = migration.sql.trim().replace(/;+$/, '')
        const batchSql = `PRAGMA foreign_keys = OFF;\n${cleanSql};\nPRAGMA foreign_keys = ON;`
        try {
          await client.executeMultiple(batchSql)
        } catch (err) {
          try { await client.execute('PRAGMA foreign_keys = ON;') } catch {}
          throw err
        }
      } else {
        await client.execute(migration.sql)
      }
      await client.execute(`INSERT OR IGNORE INTO schema_migrations (version) VALUES ('${migration.version}')`)
    } catch (err) {
      const msg = String(err).toLowerCase()
      // C-03: Single-statement ALTER TABLE ADD COLUMN / CREATE INDEX can safely tolerate
      // 'duplicate column' or 'already exists' on deployed DBs. Multi-statement rebuilds
      // must fail-closed and throw without marking as applied.
      if (!isMultiStatement && (msg.includes('duplicate column') || msg.includes('already exists'))) {
        await client.execute(`INSERT OR IGNORE INTO schema_migrations (version) VALUES ('${migration.version}')`)
      } else {
        console.error(`Migration failed: ${migration.version}`, err)
      }
    }
  }
}

// Defensive schema sync cho SQLite DBs đã deploy: bảo đảm 100% cột classes_created & content_hash tồn tại trên import_batches
try { await client.execute(`ALTER TABLE import_batches ADD COLUMN classes_created TEXT DEFAULT '[]'`) } catch {}
try { await client.execute(`ALTER TABLE import_batches ADD COLUMN content_hash TEXT`) } catch {}

await runMigrations()

for (const sql of INDICES) {
  try { await client.execute(sql) } catch {}
}

export const db = drizzle(client, { schema })
export { client }

// GRADE-TD-01 (audit 2026-08-09): kiểu transaction chuẩn của Drizzle — thay thế
// `tx: any` ở mọi repository/service (cùng `db.transaction(cb)` thì cùng kiểu).
// Lưu ý: `db` (LibSQLDatabase) không cùng kiểu với transaction → dùng `DbExecutor`
// cho tham số mặc định `= db`, `DbTransaction` cho tham số bắt buộc là tx.
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type DbExecutor = DbTransaction | typeof db

// A-NEW-13 (2026-08-11): `db.transaction` của drizzle libsql gọi `client.transaction()`
// — libsql local **mở connection riêng** cho transaction (Sqlite3Client transaction()
// set #db=null → lazy reconnect) và connection mới KHÔNG có PRAGMA busy_timeout
// (per-connection). Hệ quả: BEGIN IMMEDIATE concurrent thua lock → SQLITE_BUSY ngay lập tức
// (test race: 1×200 + 9×500). Helper này: set busy_timeout ngay trong tx + retry
// SQLITE_BUSY với backoff — transaction thắng commit trong ~ms nên retry hiếm khi lặp.
export const MAX_TX_BUSY_RETRY = 8

export async function runDbTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        await tx.run(sql`PRAGMA busy_timeout=5000`)
        return fn(tx)
      })
    } catch (err) {
      const busy = err instanceof LibsqlError && err.code === 'SQLITE_BUSY'
      if (!busy || attempt >= MAX_TX_BUSY_RETRY) throw err
      // backoff nhị phân ngắn: 25, 50, 100, 200, 400, 800, 1600, 3200ms
      await new Promise((r) => setTimeout(r, 25 * 2 ** attempt))
    }
  }
}
