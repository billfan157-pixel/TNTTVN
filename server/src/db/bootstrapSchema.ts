import type { Client } from '@libsql/client'

export const BOOTSTRAP_DDL = `
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
    updated_by TEXT,
    deleted_at TEXT,
    parent_revoked_at TEXT
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
    delivery_kind TEXT,
    status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'retrying')),
    recipient TEXT NOT NULL,
    message TEXT,
    error TEXT,
    triggered_by_type TEXT NOT NULL CHECK(triggered_by_type IN ('system', 'user')),
    triggered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    sent_at TEXT,
    target_user_ids TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    lease_owner TEXT,
    lease_expires_at TEXT,
    next_attempt_at TEXT,
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

  CREATE TABLE IF NOT EXISTS native_push_tokens (
    id TEXT NOT NULL,
    installation_id TEXT NOT NULL,
    platform TEXT NOT NULL CHECK(platform IN ('android', 'ios')),
    token TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (parish_id, id),
    FOREIGN KEY (parish_id, user_id) REFERENCES users(parish_id, id) ON DELETE CASCADE
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

  CREATE TABLE IF NOT EXISTS parish_events (
    id TEXT PRIMARY KEY,
    parish_id TEXT NOT NULL DEFAULT 'gia-ton',
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('FEAST_DAY', 'CAMP', 'TRAINING', 'SACRAMENT', 'RETREAT', 'MEETING', 'OTHER')),
    category_name TEXT,
    time TEXT,
    location TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
  );

`

export async function applyBootstrapSchema(client: Client): Promise<void> {
  await client.executeMultiple(BOOTSTRAP_DDL)
}
