import type { MigrationDefinition } from './migrationRunner.js'

export const MIGRATIONS: MigrationDefinition[] = [
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
  { version: '20260803-063', sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique ON attendance(parish_id, student_id, date, type)` },
  { version: '20260803-064', sql: `ALTER TABLE students ADD COLUMN idempotency_key TEXT` },
  { version: '20260804-065', sql: `ALTER TABLE grades ADD COLUMN score_dao_duc_source TEXT` },
  { version: '20260804-066', sql: `ALTER TABLE grades ADD COLUMN score_dao_duc_updated_at TEXT` },
  { version: '20260805-067', sql: `ALTER TABLE academic_years ADD COLUMN status TEXT NOT NULL DEFAULT 'OPEN'` },
  { version: '20260805-068', sql: `ALTER TABLE academic_years ADD COLUMN current_semester INTEGER NOT NULL DEFAULT 1` },
  { version: '20260805-069', sql: `CREATE TABLE IF NOT EXISTS academic_year_snapshots (id TEXT PRIMARY KEY, parish_id TEXT NOT NULL DEFAULT 'gia-ton', academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, semester1_gpa REAL, semester2_gpa REAL, year_gpa REAL, classification TEXT, attendance_rate REAL, promotion_status TEXT CHECK(promotion_status IN ('PROMOTED', 'RETAINED', 'GRADUATED', 'CONDITIONALLY_PROMOTED', 'TRANSFERRED')), generated_by TEXT NOT NULL, generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(parish_id, student_id, academic_year_id))` },
  { version: '20260805-070', sql: `CREATE INDEX IF NOT EXISTS idx_academic_year_snapshots_student ON academic_year_snapshots(parish_id, student_id, academic_year_id)` },
  { version: '20260805-071', sql: `CREATE INDEX IF NOT EXISTS idx_academic_year_snapshots_year ON academic_year_snapshots(parish_id, academic_year_id)` },
  { version: '20260806-072', sql: `DROP TABLE IF EXISTS student_scores` },
  { version: '20260806-073', sql: `DROP TABLE IF EXISTS class_name_mappings` },
  { version: '20260807-074', sql: `CREATE INDEX IF NOT EXISTS idx_classes_idempotency ON classes(idempotency_key)` },
  { version: '20260807-075', sql: `CREATE INDEX IF NOT EXISTS idx_mapping_memory_entity_id ON mapping_memory(entity_id)` },
  { version: '20260807-076', sql: `CREATE INDEX IF NOT EXISTS idx_grade_overrides_lookup ON grade_overrides(grade_id, score_field)` },
  { version: '20260807-077', sql: `CREATE INDEX IF NOT EXISTS idx_outbox_messages_status ON outbox_messages(status, created_at)` },
  { version: '20260807-078', sql: `CREATE INDEX IF NOT EXISTS idx_semester_locks_lookup ON semester_locks(parish_id, academic_year, semester)` },
  { version: '20260807-079', sql: `CREATE INDEX IF NOT EXISTS idx_promotion_records_lookup ON promotion_records(parish_id, student_id, academic_year)` },
  { version: '20260807-080', sql: `CREATE TABLE IF NOT EXISTS refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, parish_id TEXT NOT NULL DEFAULT 'gia-ton', token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, revoked_at TEXT, replaced_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { version: '20260807-081', sql: `ALTER TABLE users ADD COLUMN password_encrypted TEXT` },
  { version: '20260808-082', sql: `ALTER TABLE notifications ADD COLUMN target_user_ids TEXT` },
  { version: '20260808-083', sql: `CREATE TABLE IF NOT EXISTS exam_sessions (id TEXT PRIMARY KEY, parish_id TEXT NOT NULL DEFAULT 'gia-ton', class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, subject TEXT NOT NULL, score_type TEXT NOT NULL CHECK(score_type IN ('oral', '15m', '1period', 'midterm', 'final')), max_score INTEGER NOT NULL DEFAULT 10, semester INTEGER NOT NULL, academic_year TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'completed')), created_by TEXT NOT NULL, completed_by TEXT, completed_at TEXT, exam_type TEXT NOT NULL DEFAULT 'written', question_count INTEGER, answer_key TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)` },
  { version: '20260808-084', sql: `CREATE TABLE IF NOT EXISTS exam_results (id TEXT PRIMARY KEY, exam_session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, score REAL NOT NULL, source TEXT NOT NULL DEFAULT 'qr_scan', answers TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(exam_session_id, student_id))` },
  { version: '20260808-085', sql: `CREATE INDEX IF NOT EXISTS idx_exam_sessions_class ON exam_sessions(parish_id, class_id, score_type)` },
  { version: '20260808-086', sql: `CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON exam_sessions(parish_id, status, created_at)` },
  { version: '20260808-087', sql: `ALTER TABLE exam_results ADD COLUMN parish_id TEXT NOT NULL DEFAULT 'gia-ton'` },
  { version: '20260808-088', sql: `CREATE INDEX IF NOT EXISTS idx_exam_results_lookup ON exam_results(parish_id, exam_session_id)` },
  { version: '20260808-089', sql: `ALTER TABLE exam_sessions ADD COLUMN exam_type TEXT NOT NULL DEFAULT 'written'` },
  { version: '20260808-090', sql: `ALTER TABLE exam_sessions ADD COLUMN question_count INTEGER` },
  { version: '20260808-091', sql: `ALTER TABLE exam_sessions ADD COLUMN answer_key TEXT` },
  { version: '20260808-092', sql: `ALTER TABLE exam_results ADD COLUMN answers TEXT` },
  { version: '20260808-093', sql: `ALTER TABLE exam_sessions ADD COLUMN idempotency_key TEXT` },
  { version: '20260808-094', sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_sessions_idempotency ON exam_sessions(idempotency_key)` },
  { version: '20260808-095', sql: `UPDATE users SET password_encrypted = NULL WHERE status != 'FORCE_PASSWORD_CHANGE'` },
  { version: '20260808-096', sql: `ALTER TABLE grade_overrides ADD COLUMN parish_id TEXT NOT NULL DEFAULT 'gia-ton'` },
  { version: '20260808-097', sql: `ALTER TABLE outbox_messages ADD COLUMN parish_id TEXT NOT NULL DEFAULT 'gia-ton'` },
  { version: '20260808-098', sql: `CREATE INDEX IF NOT EXISTS idx_grade_overrides_parish ON grade_overrides(parish_id)` },
  { version: '20260808-099', sql: `CREATE INDEX IF NOT EXISTS idx_outbox_messages_parish ON outbox_messages(parish_id, status)` },
  { version: '20260808-100', sql: `UPDATE grade_overrides SET parish_id = (SELECT g.parish_id FROM grades g WHERE g.id = grade_overrides.grade_id) WHERE parish_id = 'gia-ton'` },
  { version: '20260808-101', sql: `ALTER TABLE semester_locks ADD COLUMN unlocked_by TEXT` },
  { version: '20260808-102', sql: `ALTER TABLE semester_locks ADD COLUMN unlocked_at TEXT` },
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
  ` },
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
  { version: '20260814-117', sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_sessions_idempotency ON exam_sessions(idempotency_key)` },
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
  { version: '20260815-119', sql: `ALTER TABLE exam_sessions ADD COLUMN questions TEXT` },
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
  { version: '20260816-121', sql: `
DROP INDEX IF EXISTS users_username_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_parish ON users(parish_id, username);
` },
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
  { version: '20260818-123', sql: `ALTER TABLE exam_results ADD COLUMN scan_metadata TEXT` },
  { version: '20260818-124', sql: `ALTER TABLE exam_sessions ADD COLUMN answer_variants TEXT` },
  { version: '20260818-125', sql: `ALTER TABLE exam_results ADD COLUMN exam_version TEXT NOT NULL DEFAULT 'A'` },
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
  { version: '20260820-127', sql: `
DROP INDEX IF EXISTS idx_students_idempotency;
CREATE UNIQUE INDEX idx_students_idempotency ON students(parish_id, idempotency_key);
DROP INDEX IF EXISTS idx_notices_idempotency;
CREATE UNIQUE INDEX idx_notices_idempotency ON notices(parish_id, idempotency_key);
DROP INDEX IF EXISTS idx_classes_idempotency;
CREATE UNIQUE INDEX idx_classes_idempotency ON classes(parish_id, idempotency_key);
DROP INDEX IF EXISTS idx_exam_sessions_idempotency;
CREATE UNIQUE INDEX idx_exam_sessions_idempotency ON exam_sessions(parish_id, idempotency_key);
` },
  // AUDIT-F2 (2026-08-22): index phục vụ GET /audit-logs — orderBy createdAt DESC
  // + filter theo parish. Trước đây chỉ có PK(parish_id,id) + idx_parish_id +
  // idx_entity → mỗi lần mở trang quét toàn bộ row của parish rồi sort.
  { version: '20260822-128', sql: `
CREATE INDEX IF NOT EXISTS idx_audit_logs_parish_created_at ON audit_logs(parish_id, created_at);
` },
  // EXAM-MIXED (2026-08-24): điểm phần tự luận nhập tay của đề kết hợp TN + TL.
  // score vẫn là điểm TỔNG (TN tự chấm + essay_score) — cột này phục vụ merge
  // 2 pha lưu điểm (quét OMR trước / nhập TL sau) và kiểm toán.
  { version: '20260824-129', sql: `ALTER TABLE exam_results ADD COLUMN essay_score REAL` },
  { version: '20260827-130', sql: `ALTER TABLE notices ADD COLUMN target_audience TEXT NOT NULL DEFAULT 'all'` },
  // ADR-058: remove all reversible password copies; bcrypt hash remains SSOT.
  { version: '20260827-131', sql: `UPDATE users SET password_encrypted = NULL WHERE password_encrypted IS NOT NULL` },
  { version: '20260828-132', sql: `ALTER TABLE import_batches ADD COLUMN created_class_ids TEXT DEFAULT '[]'` },
  { version: '20260828-133', sql: `ALTER TABLE import_batch_students ADD COLUMN rollback_snapshot TEXT` },
  { version: '20260828-134', sql: `
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
CREATE INDEX IF NOT EXISTS idx_parish_events_parish_date ON parish_events(parish_id, date);
CREATE INDEX IF NOT EXISTS idx_parish_events_parish_category ON parish_events(parish_id, category);
` },
  { version: '20260828-135', sql: `
CREATE TABLE IF NOT EXISTS exam_result_mutations (
  client_mutation_id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  user_id TEXT NOT NULL,
  exam_session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id, user_id, client_mutation_id),
  FOREIGN KEY (parish_id, exam_session_id) REFERENCES exam_sessions(parish_id, id) ON DELETE CASCADE,
  FOREIGN KEY (parish_id, student_id) REFERENCES students(parish_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_exam_result_mutations_session ON exam_result_mutations(parish_id, exam_session_id, created_at);
` },
  { version: '20260831-136', sql: `
CREATE TABLE IF NOT EXISTS parish_profiles (
  parish_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  patron_name TEXT,
  founded_date TEXT,
  motto TEXT,
  description TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id)
);
` },
  { version: '20260831-137', sql: `
CREATE TABLE IF NOT EXISTS parish_people (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  linked_user_id TEXT,
  holy_name TEXT,
  full_name TEXT NOT NULL,
  birth_year INTEGER CHECK(birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= 2100)),
  biography TEXT,
  service_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(service_status IN ('ACTIVE', 'FORMER', 'DECEASED')),
  visibility TEXT NOT NULL DEFAULT 'STAFF' CHECK(visibility IN ('STAFF', 'ADMIN')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY (parish_id, id)
);
CREATE INDEX IF NOT EXISTS idx_parish_people_name ON parish_people(parish_id, full_name);
CREATE INDEX IF NOT EXISTS idx_parish_people_status ON parish_people(parish_id, service_status);
` },
  { version: '20260831-138', sql: `
CREATE TABLE IF NOT EXISTS parish_organization_units (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK(unit_type IN ('BOARD', 'COMMITTEE', 'BRANCH', 'CHAPTER', 'OTHER')),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY (parish_id, id)
);
CREATE INDEX IF NOT EXISTS idx_parish_units_parent ON parish_organization_units(parish_id, parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_parish_units_type ON parish_organization_units(parish_id, unit_type);
` },
  { version: '20260831-139', sql: `
CREATE TABLE IF NOT EXISTS parish_service_terms (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  unit_id TEXT,
  position_title TEXT NOT NULL,
  rank_title TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY (parish_id, id),
  FOREIGN KEY (parish_id, person_id) REFERENCES parish_people(parish_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id, unit_id) REFERENCES parish_organization_units(parish_id, id) ON DELETE RESTRICT,
  CHECK(end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_parish_terms_person ON parish_service_terms(parish_id, person_id, start_date);
CREATE INDEX IF NOT EXISTS idx_parish_terms_unit ON parish_service_terms(parish_id, unit_id, start_date);
` },
  { version: '20260831-140', sql: `
CREATE TABLE IF NOT EXISTS parish_records (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK(record_type IN ('MILESTONE', 'ACTIVITY', 'ACHIEVEMENT')),
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  occurred_on TEXT NOT NULL,
  ended_on TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  visibility TEXT NOT NULL DEFAULT 'STAFF' CHECK(visibility IN ('STAFF', 'ADMIN')),
  show_on_timeline INTEGER NOT NULL DEFAULT 1 CHECK(show_on_timeline IN (0,1)),
  source_event_id TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  published_by TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY (parish_id, id),
  CHECK(ended_on IS NULL OR ended_on >= occurred_on),
  CHECK((status = 'PUBLISHED' AND published_at IS NOT NULL AND published_by IS NOT NULL) OR status != 'PUBLISHED')
);
CREATE INDEX IF NOT EXISTS idx_parish_records_timeline ON parish_records(parish_id, status, show_on_timeline, occurred_on);
CREATE INDEX IF NOT EXISTS idx_parish_records_type ON parish_records(parish_id, record_type, occurred_on);
` },
  { version: '20260831-141', sql: `
CREATE TABLE IF NOT EXISTS parish_record_people (
  parish_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  relation_role TEXT,
  PRIMARY KEY (parish_id, record_id, person_id),
  FOREIGN KEY (parish_id, record_id) REFERENCES parish_records(parish_id, id) ON DELETE CASCADE,
  FOREIGN KEY (parish_id, person_id) REFERENCES parish_people(parish_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_parish_record_people_person ON parish_record_people(parish_id, person_id);
` },
  { version: '20260831-142', sql: `
CREATE TABLE IF NOT EXISTS parish_archive_assets (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('IMAGE', 'VIDEO', 'POSTER', 'DOCUMENT', 'MINUTES', 'CERTIFICATE', 'OTHER')),
  title TEXT NOT NULL,
  description TEXT,
  captured_on TEXT,
  storage_type TEXT NOT NULL CHECK(storage_type IN ('UPLOAD', 'EXTERNAL')),
  object_key TEXT,
  external_url TEXT,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER CHECK(size_bytes IS NULL OR size_bytes >= 0),
  checksum_sha256 TEXT,
  visibility TEXT NOT NULL DEFAULT 'STAFF' CHECK(visibility IN ('STAFF', 'ADMIN')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY (parish_id, id),
  CHECK(
    (storage_type = 'UPLOAD' AND object_key IS NOT NULL AND external_url IS NULL)
    OR (storage_type = 'EXTERNAL' AND external_url IS NOT NULL AND object_key IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_parish_assets_type ON parish_archive_assets(parish_id, asset_type, captured_on);
CREATE INDEX IF NOT EXISTS idx_parish_assets_storage ON parish_archive_assets(parish_id, storage_type);
` },
  { version: '20260831-143', sql: `
CREATE TABLE IF NOT EXISTS parish_record_assets (
  parish_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  PRIMARY KEY (parish_id, record_id, asset_id),
  FOREIGN KEY (parish_id, record_id) REFERENCES parish_records(parish_id, id) ON DELETE CASCADE,
  FOREIGN KEY (parish_id, asset_id) REFERENCES parish_archive_assets(parish_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_parish_record_assets_asset ON parish_record_assets(parish_id, asset_id);
` },
  { version: '20260831-144', sql: `
CREATE UNIQUE INDEX IF NOT EXISTS idx_parish_people_linked_user
ON parish_people(parish_id, linked_user_id)
WHERE linked_user_id IS NOT NULL AND deleted_at IS NULL;
` },
  { version: '20260831-145', sql: `
CREATE TABLE IF NOT EXISTS feedback_messages (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  target_type TEXT NOT NULL CHECK(target_type IN ('PARISH', 'HOMEROOM_TEACHER')),
  target_user_id TEXT,
  visibility TEXT NOT NULL CHECK(visibility IN ('ANONYMOUS', 'PUBLIC')),
  sender_user_id TEXT,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW', 'READ', 'ARCHIVED')),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id, id),
  FOREIGN KEY (parish_id, target_user_id) REFERENCES users(parish_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id, sender_user_id) REFERENCES users(parish_id, id) ON DELETE RESTRICT,
  CONSTRAINT feedback_sender_privacy_check CHECK(
    (visibility = 'ANONYMOUS' AND sender_user_id IS NULL)
    OR (visibility = 'PUBLIC' AND sender_user_id IS NOT NULL)
  ),
  CONSTRAINT feedback_target_check CHECK(
    (target_type = 'PARISH' AND target_user_id IS NULL)
    OR (target_type = 'HOMEROOM_TEACHER' AND target_user_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_feedback_inbox
ON feedback_messages(parish_id, target_type, target_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_public_sender
ON feedback_messages(parish_id, sender_user_id, created_at);
` },
  { version: '20260831-146', sql: `
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'RESOLVED', 'DISMISSED')),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK(request_count >= 1),
  last_requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id, id),
  FOREIGN KEY (parish_id, user_id) REFERENCES users(parish_id, id) ON DELETE CASCADE,
  FOREIGN KEY (parish_id, resolved_by) REFERENCES users(parish_id, id) ON DELETE RESTRICT,
  CONSTRAINT password_reset_request_resolution_check CHECK(
    (status = 'PENDING' AND resolved_at IS NULL AND resolved_by IS NULL)
    OR (status IN ('RESOLVED', 'DISMISSED') AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_request_user
ON password_reset_requests(parish_id, user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_inbox
ON password_reset_requests(parish_id, status, last_requested_at);
` },
  { version: '20260901-147', sql: `
ALTER TABLE users ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_users_active_role
ON users(parish_id, role, deleted_at);
` },
  { version: '20260901-148', sql: `ALTER TABLE exam_sessions ADD COLUMN variant_manifests TEXT` },
  { version: '20260902-149', sql: `
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_native_push_tokens_installation
ON native_push_tokens(installation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_native_push_tokens_platform_token
ON native_push_tokens(platform, token);
CREATE INDEX IF NOT EXISTS idx_native_push_tokens_user
ON native_push_tokens(parish_id, user_id);
` },
  { version: '20260902-150', sql: `ALTER TABLE exam_sessions ADD COLUMN source_type TEXT NOT NULL DEFAULT 'legacy'` },
  { version: '20260902-151', sql: `ALTER TABLE exam_sessions ADD COLUMN blueprint_id TEXT` },
  { version: '20260902-152', sql: `ALTER TABLE exam_sessions ADD COLUMN blueprint_snapshot TEXT` },
  { version: '20260902-153', sql: `
CREATE TABLE IF NOT EXISTS question_bank_items (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','approved','active','archived')),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK(current_version >= 1),
  branch_id TEXT,
  curriculum_level TEXT,
  book TEXT,
  chapter TEXT,
  lesson TEXT,
  lesson_order INTEGER,
  topic TEXT,
  difficulty TEXT CHECK(difficulty IS NULL OR difficulty IN ('recognition','understanding','application')),
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT,
  provenance TEXT NOT NULL DEFAULT 'human' CHECK(provenance IN ('human','ai','import')),
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  approved_by TEXT,
  archived_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  PRIMARY KEY (parish_id,id),
  FOREIGN KEY (parish_id,branch_id) REFERENCES branches(parish_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id,created_by) REFERENCES users(parish_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_question_bank_list ON question_bank_items(parish_id,status,updated_at);
CREATE INDEX IF NOT EXISTS idx_question_bank_taxonomy ON question_bank_items(parish_id,branch_id,curriculum_level,lesson_order,difficulty);
CREATE INDEX IF NOT EXISTS idx_question_bank_author ON question_bank_items(parish_id,created_by,status);
` },
  { version: '20260902-154', sql: `
CREATE TABLE IF NOT EXISTS question_bank_versions (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  question_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  question_type TEXT NOT NULL CHECK(question_type IN ('multiple_choice','true_false','multiple_select','short_answer','fill_blank','matching','essay')),
  stem TEXT NOT NULL,
  answer_data TEXT NOT NULL,
  explanation TEXT,
  metadata_snapshot TEXT NOT NULL,
  change_note TEXT,
  content_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id,id),
  FOREIGN KEY (parish_id,question_id) REFERENCES question_bank_items(parish_id,id) ON DELETE CASCADE,
  FOREIGN KEY (parish_id,created_by) REFERENCES users(parish_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_question_bank_versions_number ON question_bank_versions(parish_id,question_id,version);
CREATE INDEX IF NOT EXISTS idx_question_bank_versions_question ON question_bank_versions(parish_id,question_id,created_at);
` },
  { version: '20260902-155', sql: `
CREATE TABLE IF NOT EXISTS exam_blueprints (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
  branch_id TEXT,
  curriculum_level TEXT,
  total_questions INTEGER NOT NULL CHECK(total_questions BETWEEN 1 AND 50),
  max_score INTEGER NOT NULL DEFAULT 10 CHECK(max_score BETWEEN 1 AND 10),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id,id),
  FOREIGN KEY (parish_id,branch_id) REFERENCES branches(parish_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id,created_by) REFERENCES users(parish_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_exam_blueprints_list ON exam_blueprints(parish_id,status,updated_at);
CREATE INDEX IF NOT EXISTS idx_exam_blueprints_taxonomy ON exam_blueprints(parish_id,branch_id,curriculum_level);
` },
  { version: '20260902-156', sql: `
CREATE TABLE IF NOT EXISTS exam_blueprint_rules (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  blueprint_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 1),
  question_type TEXT NOT NULL CHECK(question_type IN ('multiple_choice','true_false','multiple_select','short_answer','fill_blank','matching','essay')),
  chapter TEXT,
  lesson_from INTEGER,
  lesson_to INTEGER,
  topic TEXT,
  difficulty TEXT CHECK(difficulty IS NULL OR difficulty IN ('recognition','understanding','application')),
  tags TEXT NOT NULL DEFAULT '[]',
  question_count INTEGER NOT NULL CHECK(question_count >= 1),
  points_each REAL NOT NULL DEFAULT 1 CHECK(points_each > 0),
  avoid_recent_days INTEGER NOT NULL DEFAULT 0 CHECK(avoid_recent_days >= 0),
  PRIMARY KEY (parish_id,id),
  FOREIGN KEY (parish_id,blueprint_id) REFERENCES exam_blueprints(parish_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_blueprint_rules_order ON exam_blueprint_rules(parish_id,blueprint_id,ordinal);
CREATE INDEX IF NOT EXISTS idx_exam_blueprint_rules_blueprint ON exam_blueprint_rules(parish_id,blueprint_id);
` },
  { version: '20260902-157', sql: `
CREATE TABLE IF NOT EXISTS exam_question_snapshots (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL DEFAULT 'gia-ton',
  exam_session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_version_id TEXT NOT NULL,
  source_position INTEGER NOT NULL CHECK(source_position >= 1),
  points REAL NOT NULL DEFAULT 1 CHECK(points > 0),
  snapshot_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id,id),
  FOREIGN KEY (parish_id,exam_session_id) REFERENCES exam_sessions(parish_id,id) ON DELETE CASCADE,
  FOREIGN KEY (parish_id,question_id) REFERENCES question_bank_items(parish_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id,question_version_id) REFERENCES question_bank_versions(parish_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_question_snapshots_position ON exam_question_snapshots(parish_id,exam_session_id,source_position);
CREATE INDEX IF NOT EXISTS idx_exam_question_snapshots_usage ON exam_question_snapshots(parish_id,question_id,created_at);
` },
  { version: '20260902-158', sql: `
CREATE INDEX IF NOT EXISTS idx_exam_sessions_blueprint ON exam_sessions(parish_id,blueprint_id);
CREATE TRIGGER IF NOT EXISTS check_exam_session_blueprint_insert
BEFORE INSERT ON exam_sessions
WHEN NEW.blueprint_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM exam_blueprints
  WHERE parish_id = NEW.parish_id AND id = NEW.blueprint_id
)
BEGIN
  SELECT RAISE(ABORT, 'exam session blueprint must belong to the same parish');
END;
CREATE TRIGGER IF NOT EXISTS check_exam_session_blueprint_update
BEFORE UPDATE OF parish_id,blueprint_id ON exam_sessions
WHEN NEW.blueprint_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM exam_blueprints
  WHERE parish_id = NEW.parish_id AND id = NEW.blueprint_id
)
BEGIN
  SELECT RAISE(ABORT, 'exam session blueprint must belong to the same parish');
END;
` },
  // ADR-101: notice delta sync must carry deletions to every cached device.
  { version: '20260903-159', sql: `ALTER TABLE notices ADD COLUMN deleted_at TEXT` },
  // ADR-102: durable notification worker lease and persisted retry state.
  { version: '20260903-160', sql: `ALTER TABLE notifications ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0` },
  { version: '20260903-161', sql: `ALTER TABLE notifications ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3` },
  { version: '20260903-162', sql: `ALTER TABLE notifications ADD COLUMN lease_owner TEXT` },
  { version: '20260903-163', sql: `ALTER TABLE notifications ADD COLUMN lease_expires_at TEXT` },
  { version: '20260903-164', sql: `ALTER TABLE notifications ADD COLUMN next_attempt_at TEXT` },
  { version: '20260903-165', sql: `CREATE INDEX IF NOT EXISTS idx_notifications_worker ON notifications(status, next_attempt_at, lease_expires_at)` },
  { version: '20260904-166', sql: `ALTER TABLE notifications ADD COLUMN delivery_kind TEXT` },
  { version: '20260904-167', sql: `ALTER TABLE notices ADD COLUMN parent_revoked_at TEXT` },
  // Tier 2 (daily chính thức): sổ assessment ledger nhận thêm attempts nhập tay
  // (`manual_entry`, id = mã entry ổn định của client → idempotent qua PK).
  // SQLite không ALTER CHECK nên recreate-table theo mẫu 20260812-108/109.
  { version: '20260904-168', sql: `
    PRAGMA defer_foreign_keys=ON;
    DROP TABLE IF EXISTS assessment_entries_new;
    CREATE TABLE assessment_entries_new (
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
      source TEXT NOT NULL CHECK(source IN ('exam_finalization', 'legacy_baseline', 'manual_entry')),
      entry_date TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(parish_id, id),
      FOREIGN KEY(parish_id, student_id) REFERENCES students(parish_id, id) ON DELETE RESTRICT,
      FOREIGN KEY(parish_id, exam_session_id) REFERENCES exam_sessions(parish_id, id) ON DELETE CASCADE
    );
    INSERT INTO assessment_entries_new (id, parish_id, student_id, exam_session_id, academic_year, semester, score_type, raw_score, max_score, score, source, entry_date, created_by, created_at)
      SELECT id, parish_id, student_id, exam_session_id, academic_year, semester, score_type, raw_score, max_score, score, source, NULL, created_by, created_at FROM assessment_entries;
    DROP TABLE assessment_entries;
    ALTER TABLE assessment_entries_new RENAME TO assessment_entries;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_entries_exam_student ON assessment_entries(parish_id, exam_session_id, student_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_entries_lookup ON assessment_entries(parish_id, student_id, academic_year, semester, score_type);
  ` },
  // ADR-105 / D8: persist the intended target of a partial academic-year
  // promotion so unresolved snapshots can be retried deterministically.
  { version: '20260904-169', sql: `ALTER TABLE academic_years ADD COLUMN promotion_target_year_id TEXT` },
  // Assessment audit 2026-09-06: result OCC + durable provenance. Keep each
  // ALTER isolated so the migration runner can recover deterministically from
  // a partially upgraded SQLite database.
  { version: '20260906-170', sql: `ALTER TABLE exam_results ADD COLUMN result_version INTEGER NOT NULL DEFAULT 1` },
  { version: '20260906-171', sql: `ALTER TABLE exam_results ADD COLUMN attempt_fingerprint TEXT` },
  { version: '20260906-172', sql: `ALTER TABLE exam_results ADD COLUMN captured_at TEXT` },
  { version: '20260906-173', sql: `ALTER TABLE exam_results ADD COLUMN saved_by TEXT` },
  // Nullable only for legacy rows. Every application write sets saved_at.
  { version: '20260906-174', sql: `ALTER TABLE exam_results ADD COLUMN saved_at TEXT` },
  { version: '20260906-175', sql: `ALTER TABLE exam_sessions ADD COLUMN build_request_hash TEXT` },
  // R7-05/CR3: enforce homeroom cardinality below the service layer. Existing
  // duplicates make this migration fail closed; choosing which assignment to
  // delete requires an administrator decision and must never be automatic.
  { version: '20260906-176', sql: `
CREATE UNIQUE INDEX IF NOT EXISTS idx_catechist_assignments_one_cn_per_class
ON catechist_assignments(parish_id, class_id)
WHERE role_in_class = 'chunhiem';
CREATE UNIQUE INDEX IF NOT EXISTS idx_catechist_assignments_one_cn_class_per_user
ON catechist_assignments(parish_id, user_id)
WHERE role_in_class = 'chunhiem';
` },
  // XD-01: no inferred legacy backfill; approval does not prove membership completion.
  { version: '20260907-177', sql: `ALTER TABLE promotion_records ADD COLUMN completed_at TEXT` },
  { version: '20260907-178', sql: `ALTER TABLE promotion_records ADD COLUMN completed_target_year_id TEXT` },
  // Historical policy/cohort cannot be inferred from today's mutable settings/roster.
  { version: '20260907-179', sql: `ALTER TABLE academic_years ADD COLUMN finalization_policy TEXT` },
  { version: '20260907-180', sql: `ALTER TABLE academic_year_snapshots ADD COLUMN source_class_id TEXT` },
  { version: '20260907-181', sql: `ALTER TABLE academic_year_snapshots ADD COLUMN report_snapshot TEXT` },
  { version: '20260907-182', sql: `CREATE TABLE IF NOT EXISTS operation_workstreams (id TEXT NOT NULL, parish_id TEXT NOT NULL, operation_event_id TEXT, source_unit_id TEXT, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'PLANNING' CHECK(status IN ('PLANNING','IN_PROGRESS','READY','BLOCKED')), is_required INTEGER NOT NULL DEFAULT 0 CHECK(is_required IN (0,1)), leader_person_id TEXT, leader_user_id TEXT, version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT, PRIMARY KEY (parish_id, id), FOREIGN KEY (parish_id, source_unit_id) REFERENCES parish_organization_units(parish_id, id) ON DELETE RESTRICT, FOREIGN KEY (parish_id, leader_person_id) REFERENCES parish_people(parish_id, id) ON DELETE RESTRICT, FOREIGN KEY (parish_id, leader_user_id) REFERENCES users(parish_id, id) ON DELETE RESTRICT)` },
  { version: '20260907-183', sql: `CREATE TABLE IF NOT EXISTS operation_tasks (id TEXT NOT NULL, parish_id TEXT NOT NULL, operation_event_id TEXT, workstream_id TEXT, parent_task_id TEXT, title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('BACKLOG','TODO','IN_PROGRESS','BLOCKED','DONE','CANCELLED')), priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')), due_at TEXT, started_at TEXT, completed_at TEXT, completion_note TEXT, version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, updated_by TEXT NOT NULL, completed_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT, PRIMARY KEY (parish_id, id), FOREIGN KEY (parish_id, workstream_id) REFERENCES operation_workstreams(parish_id, id) ON DELETE RESTRICT, FOREIGN KEY (parish_id, parent_task_id) REFERENCES operation_tasks(parish_id, id) ON DELETE RESTRICT, FOREIGN KEY (parish_id, completed_by) REFERENCES users(parish_id, id) ON DELETE RESTRICT)` },
  { version: '20260907-184', sql: `CREATE TABLE IF NOT EXISTS operation_task_assignees (parish_id TEXT NOT NULL, task_id TEXT NOT NULL, user_id TEXT, person_id TEXT, assignment_role TEXT NOT NULL CHECK(assignment_role IN ('OWNER','CONTRIBUTOR','APPROVER','OBSERVER')), acknowledgement_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(acknowledgement_status IN ('PENDING','ACCEPTED','DECLINED')), assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, responded_at TEXT, completed_at TEXT, note TEXT, PRIMARY KEY (parish_id, task_id, assignment_role), FOREIGN KEY (parish_id, task_id) REFERENCES operation_tasks(parish_id, id) ON DELETE CASCADE, FOREIGN KEY (parish_id, user_id) REFERENCES users(parish_id, id) ON DELETE RESTRICT, FOREIGN KEY (parish_id, person_id) REFERENCES parish_people(parish_id, id) ON DELETE RESTRICT, CHECK((user_id IS NOT NULL AND person_id IS NULL) OR (user_id IS NULL AND person_id IS NOT NULL)))` },
  { version: '20260907-185', sql: `CREATE TABLE IF NOT EXISTS operation_checklist_items (parish_id TEXT NOT NULL, task_id TEXT NOT NULL, id TEXT NOT NULL, label TEXT NOT NULL, is_required INTEGER NOT NULL DEFAULT 0 CHECK(is_required IN (0,1)), is_done INTEGER NOT NULL DEFAULT 0 CHECK(is_done IN (0,1)), completed_by TEXT, completed_at TEXT, sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (parish_id, task_id, id), FOREIGN KEY (parish_id, task_id) REFERENCES operation_tasks(parish_id, id) ON DELETE CASCADE, FOREIGN KEY (parish_id, completed_by) REFERENCES users(parish_id, id) ON DELETE RESTRICT)` },
  { version: '20260907-186', sql: `CREATE INDEX IF NOT EXISTS idx_operation_workstreams_scope ON operation_workstreams(parish_id, source_unit_id, deleted_at)` },
  { version: '20260907-187', sql: `CREATE INDEX IF NOT EXISTS idx_operation_workstreams_event ON operation_workstreams(parish_id, operation_event_id, deleted_at)` },
  { version: '20260907-188', sql: `CREATE INDEX IF NOT EXISTS idx_operation_tasks_list ON operation_tasks(parish_id, status, due_at, deleted_at)` },
  { version: '20260907-189', sql: `CREATE INDEX IF NOT EXISTS idx_operation_tasks_workstream ON operation_tasks(parish_id, workstream_id, deleted_at)` },
  { version: '20260907-190', sql: `CREATE INDEX IF NOT EXISTS idx_operation_task_assignees_user ON operation_task_assignees(parish_id, user_id, acknowledgement_status)` },
  { version: '20260907-191', sql: `CREATE INDEX IF NOT EXISTS idx_operation_task_assignees_person ON operation_task_assignees(parish_id, person_id, acknowledgement_status)` },
  { version: '20260907-192', sql: `CREATE INDEX IF NOT EXISTS idx_operation_checklist_task ON operation_checklist_items(parish_id, task_id, sort_order)` },
  { version: '20260907-193', sql: `CREATE TABLE IF NOT EXISTS operation_events (id TEXT NOT NULL, parish_id TEXT NOT NULL, source_parish_event_id TEXT, title TEXT NOT NULL, description TEXT, event_type TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, timezone TEXT NOT NULL, location TEXT, status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PLANNING','READY','LIVE','COMPLETED','CANCELLED')), visibility TEXT NOT NULL DEFAULT 'INTERNAL' CHECK(visibility IN ('INTERNAL','PUBLIC_SUMMARY')), organizer_person_id TEXT, organizer_user_id TEXT, expected_headcount INTEGER, version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT, PRIMARY KEY (parish_id, id), CHECK(ends_at > starts_at), CHECK(expected_headcount IS NULL OR expected_headcount >= 0))` },
  { version: '20260907-194', sql: `CREATE TABLE IF NOT EXISTS operation_event_participants (parish_id TEXT NOT NULL, event_id TEXT NOT NULL, id TEXT NOT NULL, user_id TEXT, person_id TEXT, participant_role TEXT NOT NULL DEFAULT 'ATTENDEE', attendance_status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(attendance_status IN ('PLANNED','CONFIRMED','DECLINED','ATTENDED','ABSENT')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (parish_id, event_id, id), CHECK((user_id IS NOT NULL AND person_id IS NULL) OR (user_id IS NULL AND person_id IS NOT NULL)))` },
  { version: '20260907-195', sql: `CREATE TABLE IF NOT EXISTS operation_blockouts (parish_id TEXT NOT NULL, id TEXT NOT NULL, user_id TEXT, person_id TEXT, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, reason TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT, PRIMARY KEY (parish_id, id), CHECK(ends_at > starts_at), CHECK((user_id IS NOT NULL AND person_id IS NULL) OR (user_id IS NULL AND person_id IS NOT NULL)))` },
  { version: '20260907-196', sql: `CREATE TABLE IF NOT EXISTS operation_reminders (parish_id TEXT NOT NULL, id TEXT NOT NULL, task_id TEXT, event_id TEXT, recipient_user_id TEXT NOT NULL, trigger_at TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('TASK_DUE','EVENT_START','OVERDUE')), dedupe_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ENQUEUED','SENT','FAILED','CANCELLED')), read_at TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, sent_at TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (parish_id, id), UNIQUE(parish_id, dedupe_key))` },
  { version: '20260907-197', sql: `CREATE INDEX IF NOT EXISTS idx_operation_events_list ON operation_events(parish_id, status, starts_at, deleted_at)` },
  { version: '20260907-198', sql: `CREATE INDEX IF NOT EXISTS idx_operation_events_source ON operation_events(parish_id, source_parish_event_id)` },
  { version: '20260907-199', sql: `CREATE INDEX IF NOT EXISTS idx_operation_events_visibility ON operation_events(parish_id, visibility, starts_at)` },
  { version: '20260907-200', sql: `CREATE INDEX IF NOT EXISTS idx_operation_event_participants_event ON operation_event_participants(parish_id, event_id, attendance_status)` },
  { version: '20260907-201', sql: `CREATE INDEX IF NOT EXISTS idx_operation_event_participants_user ON operation_event_participants(parish_id, user_id, attendance_status)` },
  { version: '20260907-202', sql: `CREATE INDEX IF NOT EXISTS idx_operation_blockouts_user_time ON operation_blockouts(parish_id, user_id, starts_at, ends_at, deleted_at)` },
  { version: '20260907-203', sql: `CREATE INDEX IF NOT EXISTS idx_operation_blockouts_person_time ON operation_blockouts(parish_id, person_id, starts_at, ends_at, deleted_at)` },
  { version: '20260907-204', sql: `CREATE INDEX IF NOT EXISTS idx_operation_reminders_dedupe ON operation_reminders(parish_id, dedupe_key)` },
  { version: '20260907-205', sql: `CREATE INDEX IF NOT EXISTS idx_operation_reminders_due ON operation_reminders(parish_id, status, trigger_at)` },
  { version: '20260907-206', sql: `ALTER TABLE operation_tasks ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK(approval_status IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED'))` },
  { version: '20260907-207', sql: `ALTER TABLE operation_tasks ADD COLUMN approved_by TEXT` },
  { version: '20260907-208', sql: `ALTER TABLE operation_tasks ADD COLUMN approved_at TEXT` },
  { version: '20260907-209', sql: `CREATE TABLE IF NOT EXISTS operation_task_dependencies (parish_id TEXT NOT NULL, task_id TEXT NOT NULL, depends_on_task_id TEXT NOT NULL, dependency_type TEXT NOT NULL DEFAULT 'BLOCKED_BY' CHECK(dependency_type = 'BLOCKED_BY'), PRIMARY KEY (parish_id, task_id, depends_on_task_id), FOREIGN KEY (parish_id, task_id) REFERENCES operation_tasks(parish_id, id) ON DELETE CASCADE, FOREIGN KEY (parish_id, depends_on_task_id) REFERENCES operation_tasks(parish_id, id) ON DELETE RESTRICT, CHECK(task_id <> depends_on_task_id))` },
  { version: '20260907-210', sql: `CREATE INDEX IF NOT EXISTS idx_operation_task_dependencies_task ON operation_task_dependencies(parish_id, task_id)` },
  { version: '20260907-211', sql: `ALTER TABLE operation_reminders ADD COLUMN enqueued_at TEXT` },
  { version: '20260907-212', sql: `ALTER TABLE operation_reminders ADD COLUMN lease_expires_at TEXT` },
  { version: '20260907-213', sql: `ALTER TABLE operation_events ADD COLUMN scope_unit_id TEXT` },
  { version: '20260907-214', sql: `ALTER TABLE operation_events ADD COLUMN outcome_summary TEXT` },
  { version: '20260907-215', sql: `ALTER TABLE operation_tasks ADD COLUMN blocked_reason TEXT` },
  { version: '20260907-216', sql: `ALTER TABLE operation_reminders ADD COLUMN next_attempt_at TEXT` },
  { version: '20260907-217', sql: `ALTER TABLE operation_reminders ADD COLUMN notification_id TEXT` },
  { version: '20260907-218', sql: `
    ALTER TABLE operation_task_assignees RENAME TO operation_task_assignees_legacy;
    DROP INDEX IF EXISTS idx_operation_task_assignees_user;
    DROP INDEX IF EXISTS idx_operation_task_assignees_person;
    CREATE TABLE operation_task_assignees (
      id TEXT NOT NULL,
      parish_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      user_id TEXT,
      person_id TEXT,
      assignment_role TEXT NOT NULL CHECK(assignment_role IN ('OWNER','CONTRIBUTOR','APPROVER','OBSERVER')),
      acknowledgement_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(acknowledgement_status IN ('PENDING','ACCEPTED','DECLINED')),
      assigned_by TEXT NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded_at TEXT,
      completed_at TEXT,
      note TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      removed_at TEXT,
      PRIMARY KEY (parish_id, id),
      FOREIGN KEY (parish_id, task_id) REFERENCES operation_tasks(parish_id, id) ON DELETE CASCADE,
      FOREIGN KEY (parish_id, user_id) REFERENCES users(parish_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (parish_id, person_id) REFERENCES parish_people(parish_id, id) ON DELETE RESTRICT,
      CHECK((user_id IS NOT NULL AND person_id IS NULL) OR (user_id IS NULL AND person_id IS NOT NULL))
    );
    INSERT INTO operation_task_assignees (id, parish_id, task_id, user_id, person_id, assignment_role, acknowledgement_status, assigned_by, assigned_at, responded_at, completed_at, note)
      SELECT 'OPA-' || lower(hex(randomblob(12))), parish_id, task_id, user_id, person_id, assignment_role, acknowledgement_status, assigned_by, assigned_at, responded_at, completed_at, note
      FROM operation_task_assignees_legacy;
    DROP TABLE operation_task_assignees_legacy;
    CREATE UNIQUE INDEX idx_operation_task_owner_active ON operation_task_assignees(parish_id, task_id) WHERE assignment_role = 'OWNER' AND removed_at IS NULL;
    CREATE UNIQUE INDEX idx_operation_task_assignee_user_role_active ON operation_task_assignees(parish_id, task_id, user_id, assignment_role) WHERE user_id IS NOT NULL AND removed_at IS NULL;
    CREATE UNIQUE INDEX idx_operation_task_assignee_person_role_active ON operation_task_assignees(parish_id, task_id, person_id, assignment_role) WHERE person_id IS NOT NULL AND removed_at IS NULL;
    CREATE INDEX idx_operation_task_assignees_user ON operation_task_assignees(parish_id, user_id, acknowledgement_status, removed_at);
    CREATE INDEX idx_operation_task_assignees_person ON operation_task_assignees(parish_id, person_id, acknowledgement_status, removed_at);
  ` },
  { version: '20260907-219', sql: `CREATE TABLE IF NOT EXISTS operation_workstream_members (id TEXT NOT NULL, parish_id TEXT NOT NULL, workstream_id TEXT NOT NULL, user_id TEXT, person_id TEXT, operation_role TEXT NOT NULL CHECK(operation_role IN ('WORKSTREAM_LEAD','CONTRIBUTOR','APPROVER','OBSERVER')), assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, starts_at TEXT, ends_at TEXT, version INTEGER NOT NULL DEFAULT 1, removed_at TEXT, PRIMARY KEY (parish_id, id), FOREIGN KEY (parish_id, workstream_id) REFERENCES operation_workstreams(parish_id, id) ON DELETE CASCADE, FOREIGN KEY (parish_id, user_id) REFERENCES users(parish_id, id) ON DELETE RESTRICT, FOREIGN KEY (parish_id, person_id) REFERENCES parish_people(parish_id, id) ON DELETE RESTRICT, CHECK((user_id IS NOT NULL AND person_id IS NULL) OR (user_id IS NULL AND person_id IS NOT NULL)))` },
  { version: '20260907-220', sql: `CREATE TABLE IF NOT EXISTS operation_task_comments (id TEXT NOT NULL, parish_id TEXT NOT NULL, task_id TEXT NOT NULL, author_user_id TEXT NOT NULL, content TEXT NOT NULL, evidence_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TEXT, PRIMARY KEY (parish_id, id), FOREIGN KEY (parish_id, task_id) REFERENCES operation_tasks(parish_id, id) ON DELETE CASCADE, FOREIGN KEY (parish_id, author_user_id) REFERENCES users(parish_id, id) ON DELETE RESTRICT)` },
  { version: '20260907-221', sql: `CREATE TABLE IF NOT EXISTS operation_mutation_receipts (parish_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, command TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (parish_id, actor_user_id, idempotency_key), FOREIGN KEY (parish_id, actor_user_id) REFERENCES users(parish_id, id) ON DELETE RESTRICT)` },
  { version: '20260907-222', sql: `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_operation_workstream_member_user_role_active ON operation_workstream_members(parish_id, workstream_id, user_id, operation_role) WHERE user_id IS NOT NULL AND removed_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_operation_workstream_member_person_role_active ON operation_workstream_members(parish_id, workstream_id, person_id, operation_role) WHERE person_id IS NOT NULL AND removed_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_operation_workstream_members_user ON operation_workstream_members(parish_id, user_id, removed_at);
    CREATE INDEX IF NOT EXISTS idx_operation_workstream_members_person ON operation_workstream_members(parish_id, person_id, removed_at);
    CREATE INDEX IF NOT EXISTS idx_operation_task_comments_task ON operation_task_comments(parish_id, task_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_operation_mutation_receipts_created ON operation_mutation_receipts(parish_id, created_at);
    DROP INDEX IF EXISTS idx_operation_events_source;
    CREATE UNIQUE INDEX idx_operation_events_source ON operation_events(parish_id, source_parish_event_id) WHERE source_parish_event_id IS NOT NULL AND deleted_at IS NULL;
  ` },
  { version: '20260907-223', sql: `
    INSERT INTO operation_workstream_members (id, parish_id, workstream_id, user_id, person_id, operation_role, assigned_by, assigned_at)
      SELECT 'OWM-' || lower(hex(randomblob(12))), parish_id, id, leader_user_id, NULL, 'WORKSTREAM_LEAD', created_by, created_at
      FROM operation_workstreams WHERE leader_user_id IS NOT NULL AND leader_person_id IS NULL;
    INSERT INTO operation_workstream_members (id, parish_id, workstream_id, user_id, person_id, operation_role, assigned_by, assigned_at)
      SELECT 'OWM-' || lower(hex(randomblob(12))), parish_id, id, NULL, leader_person_id, 'WORKSTREAM_LEAD', created_by, created_at
      FROM operation_workstreams WHERE leader_person_id IS NOT NULL AND leader_user_id IS NULL;
  ` },
  { version: '20260907-224', sql: `
    CREATE TRIGGER check_operation_event_scope_insert BEFORE INSERT ON operation_events BEGIN
      SELECT CASE WHEN NEW.visibility = 'PUBLIC_SUMMARY' AND NEW.source_parish_event_id IS NULL THEN RAISE(ABORT, 'PUBLIC_SUMMARY_REQUIRES_PARISH_EVENT') END;
      SELECT CASE WHEN NEW.source_parish_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.source_parish_event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_SOURCE') END;
      SELECT CASE WHEN NEW.scope_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_organization_units u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.scope_unit_id AND u.deleted_at IS NULL AND u.is_active = 1) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_SCOPE') END;
    END;
    CREATE TRIGGER check_operation_event_scope_update BEFORE UPDATE OF visibility, source_parish_event_id, scope_unit_id ON operation_events BEGIN
      SELECT CASE WHEN NEW.visibility = 'PUBLIC_SUMMARY' AND NEW.source_parish_event_id IS NULL THEN RAISE(ABORT, 'PUBLIC_SUMMARY_REQUIRES_PARISH_EVENT') END;
      SELECT CASE WHEN NEW.source_parish_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.source_parish_event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_SOURCE') END;
      SELECT CASE WHEN NEW.scope_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_organization_units u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.scope_unit_id AND u.deleted_at IS NULL AND u.is_active = 1) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_SCOPE') END;
    END;
    CREATE TRIGGER check_operation_workstream_scope_insert BEFORE INSERT ON operation_workstreams BEGIN
      SELECT CASE WHEN NEW.operation_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.operation_event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_WORKSTREAM_EVENT') END;
      SELECT CASE WHEN NEW.source_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_organization_units u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.source_unit_id AND u.deleted_at IS NULL AND u.is_active = 1) THEN RAISE(ABORT, 'INVALID_OPERATION_WORKSTREAM_SCOPE') END;
    END;
    CREATE TRIGGER check_operation_task_scope_insert BEFORE INSERT ON operation_tasks BEGIN
      SELECT CASE WHEN NEW.operation_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.operation_event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_EVENT') END;
      SELECT CASE WHEN NEW.workstream_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_workstreams w WHERE w.parish_id = NEW.parish_id AND w.id = NEW.workstream_id AND w.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_WORKSTREAM') END;
      SELECT CASE WHEN NEW.operation_event_id IS NOT NULL AND NEW.workstream_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_workstreams w WHERE w.parish_id = NEW.parish_id AND w.id = NEW.workstream_id AND w.operation_event_id = NEW.operation_event_id AND w.deleted_at IS NULL) THEN RAISE(ABORT, 'OPERATION_TASK_EVENT_WORKSTREAM_MISMATCH') END;
    END;
    CREATE TRIGGER check_operation_task_scope_update BEFORE UPDATE OF operation_event_id, workstream_id ON operation_tasks BEGIN
      SELECT CASE WHEN NEW.operation_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.operation_event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_EVENT') END;
      SELECT CASE WHEN NEW.workstream_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_workstreams w WHERE w.parish_id = NEW.parish_id AND w.id = NEW.workstream_id AND w.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_WORKSTREAM') END;
      SELECT CASE WHEN NEW.operation_event_id IS NOT NULL AND NEW.workstream_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_workstreams w WHERE w.parish_id = NEW.parish_id AND w.id = NEW.workstream_id AND w.operation_event_id = NEW.operation_event_id AND w.deleted_at IS NULL) THEN RAISE(ABORT, 'OPERATION_TASK_EVENT_WORKSTREAM_MISMATCH') END;
    END;
  ` },
  { version: '20260907-225', sql: `ALTER TABLE operation_tasks ADD COLUMN is_required INTEGER NOT NULL DEFAULT 0 CHECK(is_required IN (0,1))` },
  { version: '20260907-226', sql: `
    CREATE TRIGGER check_operation_workstream_scope_update BEFORE UPDATE OF operation_event_id, source_unit_id ON operation_workstreams BEGIN
      SELECT CASE WHEN NEW.operation_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.operation_event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_WORKSTREAM_EVENT') END;
      SELECT CASE WHEN NEW.source_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_organization_units u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.source_unit_id AND u.deleted_at IS NULL AND u.is_active = 1) THEN RAISE(ABORT, 'INVALID_OPERATION_WORKSTREAM_SCOPE') END;
    END;
    CREATE TRIGGER check_operation_event_organizer_insert BEFORE INSERT ON operation_events BEGIN
      SELECT CASE WHEN NEW.organizer_user_id IS NOT NULL AND NEW.organizer_person_id IS NOT NULL THEN RAISE(ABORT, 'OPERATION_EVENT_MULTIPLE_ORGANIZERS') END;
      SELECT CASE WHEN NEW.organizer_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.organizer_user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_ORGANIZER_USER') END;
      SELECT CASE WHEN NEW.organizer_person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_people p WHERE p.parish_id = NEW.parish_id AND p.id = NEW.organizer_person_id AND p.service_status = 'ACTIVE' AND p.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_ORGANIZER_PERSON') END;
    END;
    CREATE TRIGGER check_operation_event_organizer_update BEFORE UPDATE OF organizer_user_id, organizer_person_id ON operation_events BEGIN
      SELECT CASE WHEN NEW.organizer_user_id IS NOT NULL AND NEW.organizer_person_id IS NOT NULL THEN RAISE(ABORT, 'OPERATION_EVENT_MULTIPLE_ORGANIZERS') END;
      SELECT CASE WHEN NEW.organizer_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.organizer_user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_ORGANIZER_USER') END;
      SELECT CASE WHEN NEW.organizer_person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_people p WHERE p.parish_id = NEW.parish_id AND p.id = NEW.organizer_person_id AND p.service_status = 'ACTIVE' AND p.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_ORGANIZER_PERSON') END;
    END;
    CREATE TRIGGER check_operation_participant_target_insert BEFORE INSERT ON operation_event_participants BEGIN
      SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM operation_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_PARTICIPANT_EVENT') END;
      SELECT CASE WHEN NEW.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_PARTICIPANT_USER') END;
      SELECT CASE WHEN NEW.person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_people p WHERE p.parish_id = NEW.parish_id AND p.id = NEW.person_id AND p.service_status = 'ACTIVE' AND p.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_PARTICIPANT_PERSON') END;
    END;
    CREATE TRIGGER check_operation_blockout_target_insert BEFORE INSERT ON operation_blockouts BEGIN
      SELECT CASE WHEN NEW.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_BLOCKOUT_USER') END;
      SELECT CASE WHEN NEW.person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_people p WHERE p.parish_id = NEW.parish_id AND p.id = NEW.person_id AND p.service_status = 'ACTIVE' AND p.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_BLOCKOUT_PERSON') END;
    END;
    CREATE TRIGGER check_operation_reminder_target_insert BEFORE INSERT ON operation_reminders BEGIN
      SELECT CASE WHEN (NEW.task_id IS NULL) = (NEW.event_id IS NULL) THEN RAISE(ABORT, 'OPERATION_REMINDER_EXACTLY_ONE_TARGET') END;
      SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.recipient_user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_REMINDER_RECIPIENT') END;
      SELECT CASE WHEN NEW.task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_tasks t WHERE t.parish_id = NEW.parish_id AND t.id = NEW.task_id AND t.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_REMINDER_TASK') END;
      SELECT CASE WHEN NEW.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_REMINDER_EVENT') END;
    END;
  ` },
  { version: '20260908-227', sql: `ALTER TABLE operation_event_participants ADD COLUMN version INTEGER NOT NULL DEFAULT 1` },
  { version: '20260908-228', sql: `ALTER TABLE operation_workstreams ADD COLUMN blocked_reason TEXT` },
  { version: '20260908-229', sql: `
    CREATE UNIQUE INDEX idx_operation_event_participant_user_unique ON operation_event_participants(parish_id, event_id, user_id) WHERE user_id IS NOT NULL;
    CREATE UNIQUE INDEX idx_operation_event_participant_person_unique ON operation_event_participants(parish_id, event_id, person_id) WHERE person_id IS NOT NULL;
  ` },
  { version: '20260908-230', sql: `
    ALTER TABLE parish_service_terms ADD COLUMN position_code TEXT CHECK(position_code IN ('PARISH_LEADER','BRANCH_LEADER','COMMITTEE_LEADER'));
    UPDATE parish_service_terms SET position_code = CASE
      WHEN lower(trim(position_title)) IN ('trưởng xứ đoàn', 'xứ đoàn trưởng')
        AND (unit_id IS NULL OR EXISTS (
          SELECT 1 FROM parish_organization_units u
          WHERE u.parish_id = parish_service_terms.parish_id
            AND u.id = parish_service_terms.unit_id
            AND u.unit_type = 'BOARD'
            AND u.is_active = 1
            AND u.deleted_at IS NULL
        )) THEN 'PARISH_LEADER'
      WHEN lower(trim(position_title)) = 'trưởng ngành' AND EXISTS (
        SELECT 1 FROM parish_organization_units u
        WHERE u.parish_id = parish_service_terms.parish_id
          AND u.id = parish_service_terms.unit_id
          AND u.unit_type = 'BRANCH'
          AND u.is_active = 1
          AND u.deleted_at IS NULL
      ) THEN 'BRANCH_LEADER'
      WHEN lower(trim(position_title)) = 'trưởng ban' AND EXISTS (
        SELECT 1 FROM parish_organization_units u
        WHERE u.parish_id = parish_service_terms.parish_id
          AND u.id = parish_service_terms.unit_id
          AND u.unit_type = 'COMMITTEE'
          AND u.is_active = 1
          AND u.deleted_at IS NULL
      ) THEN 'COMMITTEE_LEADER'
      ELSE NULL
    END
    WHERE position_code IS NULL;
  ` },
  { version: '20260908-231', sql: `
    CREATE TRIGGER check_parish_term_position_scope_insert
    BEFORE INSERT ON parish_service_terms
    WHEN NEW.position_code IS NOT NULL
    BEGIN
      SELECT CASE
        WHEN NEW.position_code = 'PARISH_LEADER' AND NOT (
          NEW.unit_id IS NULL OR EXISTS (
            SELECT 1 FROM parish_organization_units u
            WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
              AND u.unit_type = 'BOARD' AND u.is_active = 1 AND u.deleted_at IS NULL
          )
        ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
        WHEN NEW.position_code = 'BRANCH_LEADER' AND NOT EXISTS (
          SELECT 1 FROM parish_organization_units u
          WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
            AND u.unit_type = 'BRANCH' AND u.is_active = 1 AND u.deleted_at IS NULL
        ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
        WHEN NEW.position_code = 'COMMITTEE_LEADER' AND NOT EXISTS (
          SELECT 1 FROM parish_organization_units u
          WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
            AND u.unit_type = 'COMMITTEE' AND u.is_active = 1 AND u.deleted_at IS NULL
        ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
      END;
    END;
    CREATE TRIGGER check_parish_term_position_scope_update
    BEFORE UPDATE OF parish_id, unit_id, position_code ON parish_service_terms
    WHEN NEW.position_code IS NOT NULL
    BEGIN
      SELECT CASE
        WHEN NEW.position_code = 'PARISH_LEADER' AND NOT (
          NEW.unit_id IS NULL OR EXISTS (
            SELECT 1 FROM parish_organization_units u
            WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
              AND u.unit_type = 'BOARD' AND u.is_active = 1 AND u.deleted_at IS NULL
          )
        ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
        WHEN NEW.position_code = 'BRANCH_LEADER' AND NOT EXISTS (
          SELECT 1 FROM parish_organization_units u
          WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
            AND u.unit_type = 'BRANCH' AND u.is_active = 1 AND u.deleted_at IS NULL
        ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
        WHEN NEW.position_code = 'COMMITTEE_LEADER' AND NOT EXISTS (
          SELECT 1 FROM parish_organization_units u
          WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
            AND u.unit_type = 'COMMITTEE' AND u.is_active = 1 AND u.deleted_at IS NULL
        ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
      END;
    END;
  ` },
  { version: '20260908-232', sql: `ALTER TABLE operation_tasks ADD COLUMN cancellation_reason TEXT` },
  { version: '20260908-233', sql: `
    CREATE TRIGGER check_operation_task_cancellation_insert
    BEFORE INSERT ON operation_tasks
    WHEN NEW.status = 'CANCELLED' AND trim(coalesce(NEW.cancellation_reason, '')) = ''
    BEGIN
      SELECT RAISE(ABORT, 'OPERATION_TASK_CANCELLATION_REASON_REQUIRED');
    END;
    CREATE TRIGGER check_operation_task_cancellation_update
    BEFORE UPDATE OF status, cancellation_reason ON operation_tasks
    WHEN NEW.status = 'CANCELLED' AND trim(coalesce(NEW.cancellation_reason, '')) = ''
    BEGIN
      SELECT RAISE(ABORT, 'OPERATION_TASK_CANCELLATION_REASON_REQUIRED');
    END;
  ` },
  { version: '20260908-234', sql: `ALTER TABLE operation_mutation_receipts ADD COLUMN response_pruned_at TEXT` },
  { version: '20260908-235', sql: `
    UPDATE telegram_link_tokens
    SET consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP)
    WHERE consumed_at IS NULL;
    UPDATE telegram_links
    SET status = 'REVOKED',
        notifications_enabled = 0,
        revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'ACTIVE' OR notifications_enabled <> 0;
    UPDATE notifications
    SET status = 'failed',
        error = 'CHANNEL_RETIRED',
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_attempt_at = NULL
    WHERE type = 'telegram' AND status = 'retrying';
  ` },
  { version: '20260909-236', sql: `ALTER TABLE operation_tasks ADD COLUMN phase TEXT NOT NULL DEFAULT 'PREPARATION' CHECK (phase IN ('PREPARATION', 'EXECUTION', 'FOLLOW_UP'))` },
  { version: '20260909-237', sql: `ALTER TABLE operation_reminders ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)` },
  { version: '20260909-238', sql: `ALTER TABLE operation_blockouts ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)` },
  { version: '20260909-239', sql: `CREATE TABLE operation_event_retrospectives (parish_id TEXT NOT NULL, event_id TEXT NOT NULL, lessons_learned TEXT NOT NULL, improvement_notes TEXT, version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1), created_by TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (parish_id, event_id), FOREIGN KEY (parish_id, event_id) REFERENCES operation_events(parish_id, id) ON DELETE CASCADE)` },
  { version: '20260909-240', sql: `
CREATE TABLE operation_event_templates (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  scope_unit_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  latest_version INTEGER NOT NULL DEFAULT 1 CHECK (latest_version >= 1),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id, id),
  FOREIGN KEY (parish_id, scope_unit_id) REFERENCES parish_organization_units(parish_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_operation_event_templates_list ON operation_event_templates(parish_id, scope_unit_id, is_active, updated_at);
CREATE TABLE operation_event_template_versions (
  parish_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  source_event_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id, template_id, version),
  FOREIGN KEY (parish_id, template_id) REFERENCES operation_event_templates(parish_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id, source_event_id) REFERENCES operation_events(parish_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_operation_event_template_versions_source ON operation_event_template_versions(parish_id, source_event_id, created_at);
` },
  { version: '20260909-241', sql: `
ALTER TABLE operation_events ADD COLUMN source_template_id TEXT;
ALTER TABLE operation_events ADD COLUMN source_template_version INTEGER;
CREATE TRIGGER check_operation_event_template_insert
BEFORE INSERT ON operation_events
WHEN NOT (
  (NEW.source_template_id IS NULL AND NEW.source_template_version IS NULL)
  OR (NEW.source_template_id IS NOT NULL AND NEW.source_template_version >= 1 AND EXISTS (
    SELECT 1 FROM operation_event_template_versions
    WHERE parish_id = NEW.parish_id AND template_id = NEW.source_template_id AND version = NEW.source_template_version
  ))
)
BEGIN SELECT RAISE(ABORT, 'operation event template version must belong to the same parish'); END;
CREATE TRIGGER check_operation_event_template_update
BEFORE UPDATE OF parish_id,source_template_id,source_template_version ON operation_events
WHEN NOT (
  (NEW.source_template_id IS NULL AND NEW.source_template_version IS NULL)
  OR (NEW.source_template_id IS NOT NULL AND NEW.source_template_version >= 1 AND EXISTS (
    SELECT 1 FROM operation_event_template_versions
    WHERE parish_id = NEW.parish_id AND template_id = NEW.source_template_id AND version = NEW.source_template_version
  ))
)
BEGIN SELECT RAISE(ABORT, 'operation event template version must belong to the same parish'); END;
` },
  { version: '20260909-242', sql: `
CREATE TRIGGER check_operation_event_template_version_delete
BEFORE DELETE ON operation_event_template_versions
WHEN EXISTS (
  SELECT 1 FROM operation_events
  WHERE parish_id = OLD.parish_id AND source_template_id = OLD.template_id AND source_template_version = OLD.version
)
BEGIN SELECT RAISE(ABORT, 'operation event template version is referenced by an event'); END;
` },
  { version: '20260909-243', sql: `ALTER TABLE operation_event_templates ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)` },
  { version: '20260909-244', sql: `ALTER TABLE operation_tasks ADD COLUMN scheduled_start_at TEXT` },
  { version: '20260909-245', sql: `ALTER TABLE operation_tasks ADD COLUMN scheduled_end_at TEXT` },
  { version: '20260909-246', sql: `
CREATE TRIGGER check_operation_task_schedule_insert
BEFORE INSERT ON operation_tasks
WHEN NOT (
  (NEW.scheduled_start_at IS NULL AND NEW.scheduled_end_at IS NULL)
  OR (NEW.scheduled_start_at IS NOT NULL AND NEW.scheduled_end_at IS NOT NULL AND NEW.scheduled_end_at > NEW.scheduled_start_at)
)
BEGIN SELECT RAISE(ABORT, 'operation task schedule requires a valid start/end pair'); END;
CREATE TRIGGER check_operation_task_schedule_update
BEFORE UPDATE OF scheduled_start_at,scheduled_end_at ON operation_tasks
WHEN NOT (
  (NEW.scheduled_start_at IS NULL AND NEW.scheduled_end_at IS NULL)
  OR (NEW.scheduled_start_at IS NOT NULL AND NEW.scheduled_end_at IS NOT NULL AND NEW.scheduled_end_at > NEW.scheduled_start_at)
)
BEGIN SELECT RAISE(ABORT, 'operation task schedule requires a valid start/end pair'); END;
` },
  { version: '20260909-247', sql: `CREATE INDEX IF NOT EXISTS idx_operation_tasks_schedule ON operation_tasks(parish_id, scheduled_start_at, scheduled_end_at, status, deleted_at)` },
  { version: '20260909-248', sql: `
CREATE TRIGGER check_parish_unit_hierarchy_insert
BEFORE INSERT ON parish_organization_units
WHEN (
  (NEW.unit_type = 'BOARD' AND NEW.parent_id IS NOT NULL)
  OR (NEW.unit_type IN ('BRANCH','COMMITTEE') AND (
    NEW.parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM parish_organization_units parent
      WHERE parent.parish_id = NEW.parish_id AND parent.id = NEW.parent_id
        AND parent.unit_type = 'BOARD' AND parent.is_active = 1 AND parent.deleted_at IS NULL
    )
  ))
)
BEGIN SELECT RAISE(ABORT, 'PARISH_UNIT_HIERARCHY_MISMATCH'); END;
CREATE TRIGGER check_parish_unit_hierarchy_update
BEFORE UPDATE OF parish_id,parent_id,unit_type ON parish_organization_units
WHEN (
  (NEW.unit_type = 'BOARD' AND NEW.parent_id IS NOT NULL)
  OR (NEW.unit_type IN ('BRANCH','COMMITTEE') AND (
    NEW.parent_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM parish_organization_units parent
      WHERE parent.parish_id = NEW.parish_id AND parent.id = NEW.parent_id
        AND parent.unit_type = 'BOARD' AND parent.is_active = 1 AND parent.deleted_at IS NULL
    )
  ))
)
BEGIN SELECT RAISE(ABORT, 'PARISH_UNIT_HIERARCHY_MISMATCH'); END;
` },
  { version: '20260909-249', sql: `
CREATE TRIGGER check_parish_unit_parent_integrity_update
BEFORE UPDATE OF unit_type,is_active,deleted_at ON parish_organization_units
WHEN (
  NEW.unit_type <> 'BOARD' OR NEW.is_active <> 1 OR NEW.deleted_at IS NOT NULL
) AND EXISTS (
  SELECT 1 FROM parish_organization_units child
  WHERE child.parish_id = NEW.parish_id AND child.parent_id = NEW.id
    AND child.unit_type IN ('BRANCH','COMMITTEE') AND child.deleted_at IS NULL
)
BEGIN SELECT RAISE(ABORT, 'PARISH_BOARD_HAS_CHILD_UNITS'); END;
` },
  { version: '20260909-250', sql: `
CREATE TRIGGER check_parish_leader_term_overlap_insert
BEFORE INSERT ON parish_service_terms
WHEN NEW.position_code IS NOT NULL AND EXISTS (
  SELECT 1 FROM parish_service_terms existing
  WHERE existing.parish_id = NEW.parish_id
    AND existing.position_code = NEW.position_code
    AND existing.deleted_at IS NULL
    AND (NEW.position_code = 'PARISH_LEADER' OR existing.unit_id = NEW.unit_id)
    AND existing.start_date <= coalesce(NEW.end_date, '9999-12-31')
    AND coalesce(existing.end_date, '9999-12-31') >= NEW.start_date
)
BEGIN SELECT RAISE(ABORT, 'PARISH_POSITION_TERM_OVERLAP'); END;
CREATE TRIGGER check_parish_leader_term_overlap_update
BEFORE UPDATE OF parish_id,unit_id,position_code,start_date,end_date,deleted_at ON parish_service_terms
WHEN NEW.position_code IS NOT NULL AND NEW.deleted_at IS NULL AND EXISTS (
  SELECT 1 FROM parish_service_terms existing
  WHERE existing.parish_id = NEW.parish_id
    AND existing.id <> NEW.id
    AND existing.position_code = NEW.position_code
    AND existing.deleted_at IS NULL
    AND (NEW.position_code = 'PARISH_LEADER' OR existing.unit_id = NEW.unit_id)
    AND existing.start_date <= coalesce(NEW.end_date, '9999-12-31')
    AND coalesce(existing.end_date, '9999-12-31') >= NEW.start_date
)
BEGIN SELECT RAISE(ABORT, 'PARISH_POSITION_TERM_OVERLAP'); END;
` },
  { version: '20260910-251', sql: `
CREATE UNIQUE INDEX IF NOT EXISTS idx_parish_units_one_active_board
ON parish_organization_units(parish_id)
WHERE unit_type = 'BOARD' AND is_active = 1 AND deleted_at IS NULL;
` },
  { version: '20260910-252', sql: `
CREATE TRIGGER check_parish_unit_position_scope_update
BEFORE UPDATE OF unit_type ON parish_organization_units
WHEN NEW.unit_type <> OLD.unit_type AND EXISTS (
  SELECT 1 FROM parish_service_terms term
  WHERE term.parish_id = OLD.parish_id AND term.unit_id = OLD.id
    AND term.deleted_at IS NULL AND (
      (term.position_code = 'PARISH_LEADER' AND NEW.unit_type <> 'BOARD') OR
      (term.position_code = 'BRANCH_LEADER' AND NEW.unit_type <> 'BRANCH') OR
      (term.position_code = 'COMMITTEE_LEADER' AND NEW.unit_type <> 'COMMITTEE')
    )
)
BEGIN SELECT RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH'); END;
` },
  { version: '20260910-253', sql: `
PRAGMA legacy_alter_table = ON;
ALTER TABLE operation_events RENAME TO operation_events_legacy;
CREATE TABLE operation_events (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  source_parish_event_id TEXT,
  source_template_id TEXT,
  source_template_version INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PLANNING','PREPARING','READY','LIVE','COMPLETED','CANCELLED')),
  visibility TEXT NOT NULL DEFAULT 'INTERNAL' CHECK(visibility IN ('INTERNAL','PUBLIC_SUMMARY')),
  scope_unit_id TEXT,
  organizer_person_id TEXT,
  organizer_user_id TEXT,
  expected_headcount INTEGER,
  outcome_summary TEXT,
  completion_record_id TEXT,
  automation_paused INTEGER NOT NULL DEFAULT 0 CHECK(automation_paused IN (0,1)),
  automation_paused_at TEXT,
  automation_paused_by TEXT,
  automation_pause_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY (parish_id, id),
  CHECK(ends_at > starts_at),
  CHECK(expected_headcount IS NULL OR expected_headcount >= 0),
  CHECK(organizer_user_id IS NULL OR organizer_person_id IS NULL),
  CHECK((source_template_id IS NULL AND source_template_version IS NULL) OR (source_template_id IS NOT NULL AND source_template_version IS NOT NULL AND source_template_version >= 1)),
  CHECK(visibility <> 'PUBLIC_SUMMARY' OR status IN ('DRAFT','CANCELLED') OR source_parish_event_id IS NOT NULL),
  CHECK(
    (automation_paused = 0 AND automation_paused_at IS NULL AND automation_paused_by IS NULL AND automation_pause_reason IS NULL)
    OR
    (automation_paused = 1 AND automation_paused_at IS NOT NULL AND automation_paused_by IS NOT NULL AND trim(coalesce(automation_pause_reason, '')) <> '')
  )
);
INSERT INTO operation_events (
  id, parish_id, source_parish_event_id, source_template_id, source_template_version,
  title, description, event_type, starts_at, ends_at, timezone, location, status,
  visibility, scope_unit_id, organizer_person_id, organizer_user_id, expected_headcount,
  outcome_summary, version, created_by, updated_by, created_at, updated_at, deleted_at
)
SELECT
  id, parish_id, source_parish_event_id, source_template_id, source_template_version,
  title, description, event_type, starts_at, ends_at, timezone, location, status,
  visibility, scope_unit_id, organizer_person_id, organizer_user_id, expected_headcount,
  outcome_summary, version, created_by, updated_by, created_at, updated_at, deleted_at
FROM operation_events_legacy;
DROP TABLE operation_events_legacy;
CREATE INDEX idx_operation_events_list ON operation_events(parish_id, status, starts_at, deleted_at);
CREATE UNIQUE INDEX idx_operation_events_source ON operation_events(parish_id, source_parish_event_id) WHERE source_parish_event_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_operation_events_visibility ON operation_events(parish_id, visibility, starts_at);
CREATE INDEX idx_operation_events_automation_due ON operation_events(automation_paused, status, starts_at, ends_at, deleted_at);
CREATE TRIGGER check_operation_event_scope_insert BEFORE INSERT ON operation_events BEGIN
  SELECT CASE WHEN NEW.visibility = 'PUBLIC_SUMMARY' AND NEW.status NOT IN ('DRAFT','CANCELLED') AND NEW.source_parish_event_id IS NULL THEN RAISE(ABORT, 'PUBLIC_SUMMARY_REQUIRES_PARISH_EVENT') END;
  SELECT CASE WHEN NEW.source_parish_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.source_parish_event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_SOURCE') END;
  SELECT CASE WHEN NEW.scope_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_organization_units u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.scope_unit_id AND u.deleted_at IS NULL AND u.is_active = 1) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_SCOPE') END;
END;
CREATE TRIGGER check_operation_event_scope_update BEFORE UPDATE OF visibility, status, source_parish_event_id, scope_unit_id ON operation_events BEGIN
  SELECT CASE WHEN NEW.visibility = 'PUBLIC_SUMMARY' AND NEW.status NOT IN ('DRAFT','CANCELLED') AND NEW.source_parish_event_id IS NULL THEN RAISE(ABORT, 'PUBLIC_SUMMARY_REQUIRES_PARISH_EVENT') END;
  SELECT CASE WHEN NEW.source_parish_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.source_parish_event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_SOURCE') END;
  SELECT CASE WHEN NEW.scope_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_organization_units u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.scope_unit_id AND u.deleted_at IS NULL AND u.is_active = 1) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_SCOPE') END;
END;
CREATE TRIGGER check_operation_event_organizer_insert BEFORE INSERT ON operation_events BEGIN
  SELECT CASE WHEN NEW.organizer_user_id IS NOT NULL AND NEW.organizer_person_id IS NOT NULL THEN RAISE(ABORT, 'OPERATION_EVENT_MULTIPLE_ORGANIZERS') END;
  SELECT CASE WHEN NEW.organizer_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.organizer_user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_ORGANIZER_USER') END;
  SELECT CASE WHEN NEW.organizer_person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_people p WHERE p.parish_id = NEW.parish_id AND p.id = NEW.organizer_person_id AND p.service_status = 'ACTIVE' AND p.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_ORGANIZER_PERSON') END;
END;
CREATE TRIGGER check_operation_event_organizer_update BEFORE UPDATE OF organizer_user_id, organizer_person_id ON operation_events BEGIN
  SELECT CASE WHEN NEW.organizer_user_id IS NOT NULL AND NEW.organizer_person_id IS NOT NULL THEN RAISE(ABORT, 'OPERATION_EVENT_MULTIPLE_ORGANIZERS') END;
  SELECT CASE WHEN NEW.organizer_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.organizer_user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_ORGANIZER_USER') END;
  SELECT CASE WHEN NEW.organizer_person_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM parish_people p WHERE p.parish_id = NEW.parish_id AND p.id = NEW.organizer_person_id AND p.service_status = 'ACTIVE' AND p.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_EVENT_ORGANIZER_PERSON') END;
END;
CREATE TRIGGER check_operation_event_template_insert BEFORE INSERT ON operation_events
WHEN NOT (
  (NEW.source_template_id IS NULL AND NEW.source_template_version IS NULL)
  OR (NEW.source_template_id IS NOT NULL AND NEW.source_template_version >= 1 AND EXISTS (
    SELECT 1 FROM operation_event_template_versions
    WHERE parish_id = NEW.parish_id AND template_id = NEW.source_template_id AND version = NEW.source_template_version
  ))
)
BEGIN SELECT RAISE(ABORT, 'operation event template version must belong to the same parish'); END;
CREATE TRIGGER check_operation_event_template_update BEFORE UPDATE OF parish_id,source_template_id,source_template_version ON operation_events
WHEN NOT (
  (NEW.source_template_id IS NULL AND NEW.source_template_version IS NULL)
  OR (NEW.source_template_id IS NOT NULL AND NEW.source_template_version >= 1 AND EXISTS (
    SELECT 1 FROM operation_event_template_versions
    WHERE parish_id = NEW.parish_id AND template_id = NEW.source_template_id AND version = NEW.source_template_version
  ))
)
BEGIN SELECT RAISE(ABORT, 'operation event template version must belong to the same parish'); END;
PRAGMA legacy_alter_table = OFF;
` },
  { version: '20260910-254', sql: `
CREATE TABLE operation_task_dispatches (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  primary_user_id TEXT,
  primary_person_id TEXT,
  reserve_user_id TEXT,
  reserve_person_id TEXT,
  acknowledge_by TEXT NOT NULL,
  primary_invited_at TEXT,
  reserve_invite_at TEXT,
  reserve_invited_at TEXT,
  accepted_target TEXT CHECK(accepted_target IN ('PRIMARY','RESERVE')),
  accepted_assignment_id TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','PENDING','ACCEPTED','CANCELLED')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parish_id,id),
  FOREIGN KEY (parish_id,task_id) REFERENCES operation_tasks(parish_id,id) ON DELETE CASCADE,
  FOREIGN KEY (parish_id,primary_user_id) REFERENCES users(parish_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id,primary_person_id) REFERENCES parish_people(parish_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id,reserve_user_id) REFERENCES users(parish_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id,reserve_person_id) REFERENCES parish_people(parish_id,id) ON DELETE RESTRICT,
  CHECK((primary_user_id IS NOT NULL AND primary_person_id IS NULL) OR (primary_user_id IS NULL AND primary_person_id IS NOT NULL)),
  CHECK((reserve_user_id IS NULL AND reserve_person_id IS NULL) OR (reserve_user_id IS NOT NULL AND reserve_person_id IS NULL) OR (reserve_user_id IS NULL AND reserve_person_id IS NOT NULL)),
  CHECK(reserve_user_id IS NULL OR primary_user_id IS NULL OR reserve_user_id <> primary_user_id),
  CHECK(reserve_person_id IS NULL OR primary_person_id IS NULL OR reserve_person_id <> primary_person_id),
  CHECK((status = 'ACCEPTED' AND accepted_target IS NOT NULL AND accepted_assignment_id IS NOT NULL) OR (status <> 'ACCEPTED' AND accepted_target IS NULL AND accepted_assignment_id IS NULL))
);
CREATE UNIQUE INDEX idx_operation_task_dispatch_active ON operation_task_dispatches(parish_id,task_id) WHERE status IN ('SCHEDULED','PENDING');
CREATE INDEX idx_operation_task_dispatch_reserve_due ON operation_task_dispatches(status,reserve_invite_at,reserve_invited_at);
` },
  { version: '20260911-255', sql: `
PRAGMA legacy_alter_table = ON;
ALTER TABLE operation_reminders RENAME TO operation_reminders_legacy;
CREATE TABLE operation_reminders (
  parish_id TEXT NOT NULL,
  id TEXT NOT NULL,
  task_id TEXT,
  event_id TEXT,
  recipient_user_id TEXT NOT NULL,
  trigger_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('TASK_DUE','EVENT_START','OVERDUE','MANAGER_PREP')),
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ENQUEUED','SENT','FAILED','CANCELLED')),
  read_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  enqueued_at TEXT,
  lease_expires_at TEXT,
  next_attempt_at TEXT,
  notification_id TEXT,
  PRIMARY KEY (parish_id, id)
);
INSERT INTO operation_reminders (
  parish_id, id, task_id, event_id, recipient_user_id, trigger_at, kind, dedupe_key, status,
  read_at, attempt_count, sent_at, error, created_at, version, enqueued_at, lease_expires_at, next_attempt_at, notification_id
)
SELECT
  parish_id, id, task_id, event_id, recipient_user_id, trigger_at, kind, dedupe_key, status,
  read_at, attempt_count, sent_at, error, created_at, version, enqueued_at, lease_expires_at, next_attempt_at, notification_id
FROM operation_reminders_legacy;
DROP TABLE operation_reminders_legacy;
CREATE UNIQUE INDEX idx_operation_reminders_dedupe ON operation_reminders(parish_id, dedupe_key);
CREATE INDEX idx_operation_reminders_due ON operation_reminders(parish_id, status, trigger_at);
CREATE TRIGGER check_operation_reminder_target_insert BEFORE INSERT ON operation_reminders BEGIN
  SELECT CASE WHEN (NEW.task_id IS NULL) = (NEW.event_id IS NULL) THEN RAISE(ABORT, 'OPERATION_REMINDER_EXACTLY_ONE_TARGET') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM users u WHERE u.parish_id = NEW.parish_id AND u.id = NEW.recipient_user_id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_REMINDER_RECIPIENT') END;
  SELECT CASE WHEN NEW.task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_tasks t WHERE t.parish_id = NEW.parish_id AND t.id = NEW.task_id AND t.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_REMINDER_TASK') END;
  SELECT CASE WHEN NEW.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_REMINDER_EVENT') END;
END;
` },
  { version: '20260912-256', sql: `
PRAGMA legacy_alter_table = ON;
DROP TRIGGER IF EXISTS check_parish_term_position_scope_insert;
DROP TRIGGER IF EXISTS check_parish_term_position_scope_update;
DROP TRIGGER IF EXISTS check_parish_leader_term_overlap_insert;
DROP TRIGGER IF EXISTS check_parish_leader_term_overlap_update;
DROP TRIGGER IF EXISTS check_parish_unit_position_scope_update;
ALTER TABLE parish_service_terms RENAME TO parish_service_terms_legacy;
CREATE TABLE parish_service_terms (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  unit_id TEXT,
  position_title TEXT NOT NULL,
  position_code TEXT CHECK(position_code IN ('PARISH_LEADER','PARISH_SECRETARY','PARISH_DEPUTY','BRANCH_LEADER','BRANCH_DEPUTY','COMMITTEE_LEADER','COMMITTEE_DEPUTY')),
  rank_title TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY (parish_id, id),
  FOREIGN KEY (parish_id, person_id) REFERENCES parish_people(parish_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id, unit_id) REFERENCES parish_organization_units(parish_id, id) ON DELETE RESTRICT,
  CHECK(end_date IS NULL OR end_date >= start_date)
);
INSERT INTO parish_service_terms (
  id, parish_id, person_id, unit_id, position_title, position_code, rank_title,
  start_date, end_date, notes, created_by, updated_by, created_at, updated_at, deleted_at
)
SELECT
  id, parish_id, person_id, unit_id, position_title, position_code, rank_title,
  start_date, end_date, notes, created_by, updated_by, created_at, updated_at, deleted_at
FROM parish_service_terms_legacy;
DROP TABLE parish_service_terms_legacy;
CREATE INDEX IF NOT EXISTS idx_parish_terms_person ON parish_service_terms(parish_id, person_id, start_date);
CREATE INDEX IF NOT EXISTS idx_parish_terms_unit ON parish_service_terms(parish_id, unit_id, start_date);
CREATE TRIGGER check_parish_term_position_scope_insert
BEFORE INSERT ON parish_service_terms
WHEN NEW.position_code IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.position_code IN ('PARISH_LEADER','PARISH_SECRETARY','PARISH_DEPUTY') AND NOT (
      NEW.unit_id IS NULL OR EXISTS (
        SELECT 1 FROM parish_organization_units u
        WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
          AND u.unit_type = 'BOARD' AND u.is_active = 1 AND u.deleted_at IS NULL
      )
    ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
    WHEN NEW.position_code IN ('BRANCH_LEADER','BRANCH_DEPUTY') AND NOT EXISTS (
      SELECT 1 FROM parish_organization_units u
      WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
        AND u.unit_type = 'BRANCH' AND u.is_active = 1 AND u.deleted_at IS NULL
    ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
    WHEN NEW.position_code IN ('COMMITTEE_LEADER','COMMITTEE_DEPUTY') AND NOT EXISTS (
      SELECT 1 FROM parish_organization_units u
      WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
        AND u.unit_type = 'COMMITTEE' AND u.is_active = 1 AND u.deleted_at IS NULL
    ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
  END;
END;
CREATE TRIGGER check_parish_term_position_scope_update
BEFORE UPDATE OF parish_id, unit_id, position_code ON parish_service_terms
WHEN NEW.position_code IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.position_code IN ('PARISH_LEADER','PARISH_SECRETARY','PARISH_DEPUTY') AND NOT (
      NEW.unit_id IS NULL OR EXISTS (
        SELECT 1 FROM parish_organization_units u
        WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
          AND u.unit_type = 'BOARD' AND u.is_active = 1 AND u.deleted_at IS NULL
      )
    ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
    WHEN NEW.position_code IN ('BRANCH_LEADER','BRANCH_DEPUTY') AND NOT EXISTS (
      SELECT 1 FROM parish_organization_units u
      WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
        AND u.unit_type = 'BRANCH' AND u.is_active = 1 AND u.deleted_at IS NULL
    ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
    WHEN NEW.position_code IN ('COMMITTEE_LEADER','COMMITTEE_DEPUTY') AND NOT EXISTS (
      SELECT 1 FROM parish_organization_units u
      WHERE u.parish_id = NEW.parish_id AND u.id = NEW.unit_id
        AND u.unit_type = 'COMMITTEE' AND u.is_active = 1 AND u.deleted_at IS NULL
    ) THEN RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH')
  END;
END;
CREATE TRIGGER check_parish_leader_term_overlap_insert
BEFORE INSERT ON parish_service_terms
WHEN NEW.position_code IS NOT NULL AND EXISTS (
  SELECT 1 FROM parish_service_terms existing
  WHERE existing.parish_id = NEW.parish_id
    AND existing.position_code = NEW.position_code
    AND existing.deleted_at IS NULL
    AND (NEW.position_code IN ('PARISH_LEADER','PARISH_SECRETARY','PARISH_DEPUTY') OR existing.unit_id = NEW.unit_id)
    AND existing.start_date <= coalesce(NEW.end_date, '9999-12-31')
    AND coalesce(existing.end_date, '9999-12-31') >= NEW.start_date
)
BEGIN SELECT RAISE(ABORT, 'PARISH_POSITION_TERM_OVERLAP'); END;
CREATE TRIGGER check_parish_leader_term_overlap_update
BEFORE UPDATE OF parish_id,unit_id,position_code,start_date,end_date,deleted_at ON parish_service_terms
WHEN NEW.position_code IS NOT NULL AND NEW.deleted_at IS NULL AND EXISTS (
  SELECT 1 FROM parish_service_terms existing
  WHERE existing.parish_id = NEW.parish_id
    AND existing.id <> NEW.id
    AND existing.position_code = NEW.position_code
    AND existing.deleted_at IS NULL
    AND (NEW.position_code IN ('PARISH_LEADER','PARISH_SECRETARY','PARISH_DEPUTY') OR existing.unit_id = NEW.unit_id)
    AND existing.start_date <= coalesce(NEW.end_date, '9999-12-31')
    AND coalesce(existing.end_date, '9999-12-31') >= NEW.start_date
)
BEGIN SELECT RAISE(ABORT, 'PARISH_POSITION_TERM_OVERLAP'); END;
CREATE TRIGGER check_parish_unit_position_scope_update
BEFORE UPDATE OF unit_type ON parish_organization_units
WHEN NEW.unit_type <> OLD.unit_type AND EXISTS (
  SELECT 1 FROM parish_service_terms term
  WHERE term.parish_id = OLD.parish_id AND term.unit_id = OLD.id
    AND term.deleted_at IS NULL AND (
      (term.position_code IN ('PARISH_LEADER','PARISH_SECRETARY','PARISH_DEPUTY') AND NEW.unit_type <> 'BOARD') OR
      (term.position_code IN ('BRANCH_LEADER','BRANCH_DEPUTY') AND NEW.unit_type <> 'BRANCH') OR
      (term.position_code IN ('COMMITTEE_LEADER','COMMITTEE_DEPUTY') AND NEW.unit_type <> 'COMMITTEE')
    )
)
BEGIN SELECT RAISE(ABORT, 'PARISH_POSITION_SCOPE_MISMATCH'); END;
PRAGMA legacy_alter_table = OFF;
` },
  { version: '20260912-257', sql: `
ALTER TABLE operation_events ADD COLUMN event_scope_type TEXT CHECK(event_scope_type IN ('XU_DOAN','UNIT'));
UPDATE operation_events SET event_scope_type = CASE WHEN scope_unit_id IS NULL THEN 'XU_DOAN' ELSE 'UNIT' END WHERE event_scope_type IS NULL;
CREATE INDEX IF NOT EXISTS idx_operation_events_scope_type ON operation_events(parish_id, event_scope_type, status);
CREATE TRIGGER check_operation_event_scope_type_insert BEFORE INSERT ON operation_events
WHEN NEW.event_scope_type IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.event_scope_type = 'XU_DOAN' AND NEW.scope_unit_id IS NOT NULL THEN RAISE(ABORT, 'OPERATION_EVENT_SCOPE_TYPE_MISMATCH')
    WHEN NEW.event_scope_type = 'UNIT' AND NEW.scope_unit_id IS NULL THEN RAISE(ABORT, 'OPERATION_EVENT_SCOPE_TYPE_MISMATCH')
  END;
END;
CREATE TRIGGER check_operation_event_scope_type_update BEFORE UPDATE OF event_scope_type, scope_unit_id ON operation_events
WHEN NEW.event_scope_type IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.event_scope_type = 'XU_DOAN' AND NEW.scope_unit_id IS NOT NULL THEN RAISE(ABORT, 'OPERATION_EVENT_SCOPE_TYPE_MISMATCH')
    WHEN NEW.event_scope_type = 'UNIT' AND NEW.scope_unit_id IS NULL THEN RAISE(ABORT, 'OPERATION_EVENT_SCOPE_TYPE_MISMATCH')
  END;
END;
` },
  { version: '20260912-258', sql: `
ALTER TABLE operation_tasks ADD COLUMN scope_unit_id TEXT;
UPDATE operation_tasks SET scope_unit_id = (
  SELECT w.source_unit_id FROM operation_workstreams w
  WHERE w.parish_id = operation_tasks.parish_id AND w.id = operation_tasks.workstream_id
) WHERE scope_unit_id IS NULL AND workstream_id IS NOT NULL;
UPDATE operation_tasks SET scope_unit_id = (
  SELECT e.scope_unit_id FROM operation_events e
  WHERE e.parish_id = operation_tasks.parish_id AND e.id = operation_tasks.operation_event_id
) WHERE scope_unit_id IS NULL AND operation_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operation_tasks_scope ON operation_tasks(parish_id, scope_unit_id, deleted_at);
CREATE TRIGGER check_operation_task_scope_unit_insert BEFORE INSERT ON operation_tasks
WHEN NEW.scope_unit_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM parish_organization_units u
    WHERE u.parish_id = NEW.parish_id AND u.id = NEW.scope_unit_id AND u.deleted_at IS NULL AND u.is_active = 1
  ) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_SCOPE') END;
END;
CREATE TRIGGER check_operation_task_scope_unit_update BEFORE UPDATE OF scope_unit_id ON operation_tasks
WHEN NEW.scope_unit_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM parish_organization_units u
    WHERE u.parish_id = NEW.parish_id AND u.id = NEW.scope_unit_id AND u.deleted_at IS NULL AND u.is_active = 1
  ) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_SCOPE') END;
END;
` },
  { version: '20260912-259', sql: `
-- O3 activation on legacy data: exact-match backfill for deputy/secretary titles
-- that migration 20260908-230 left as position_code NULL. Same precedent and
-- fail-closed semantics as 230: overlapping same-code terms abort the migration
-- via check_parish_leader_term_overlap_* so the operator fixes data first
-- (run db:audit:operations-authority preflight before upgrading production).
-- Standalone-task scope stays route-enforced (no DB trigger) because the ADMIN
-- compatibility path (O2) is actor-aware and invisible at the trigger layer.
UPDATE parish_service_terms SET position_code = CASE
  WHEN lower(trim(position_title)) IN ('thư ký', 'thư ký xứ đoàn')
    AND (unit_id IS NULL OR EXISTS (
      SELECT 1 FROM parish_organization_units u
      WHERE u.parish_id = parish_service_terms.parish_id
        AND u.id = parish_service_terms.unit_id
        AND u.unit_type = 'BOARD'
        AND u.is_active = 1
        AND u.deleted_at IS NULL
    )) THEN 'PARISH_SECRETARY'
  WHEN lower(trim(position_title)) IN ('phó xứ đoàn', 'phó xứ')
    AND (unit_id IS NULL OR EXISTS (
      SELECT 1 FROM parish_organization_units u
      WHERE u.parish_id = parish_service_terms.parish_id
        AND u.id = parish_service_terms.unit_id
        AND u.unit_type = 'BOARD'
        AND u.is_active = 1
        AND u.deleted_at IS NULL
    )) THEN 'PARISH_DEPUTY'
  WHEN lower(trim(position_title)) IN ('phó ngành', 'phó trưởng ngành') AND EXISTS (
    SELECT 1 FROM parish_organization_units u
    WHERE u.parish_id = parish_service_terms.parish_id
      AND u.id = parish_service_terms.unit_id
      AND u.unit_type = 'BRANCH'
      AND u.is_active = 1
      AND u.deleted_at IS NULL
  ) THEN 'BRANCH_DEPUTY'
  WHEN lower(trim(position_title)) IN ('phó ban', 'phó trưởng ban') AND EXISTS (
    SELECT 1 FROM parish_organization_units u
    WHERE u.parish_id = parish_service_terms.parish_id
      AND u.id = parish_service_terms.unit_id
      AND u.unit_type = 'COMMITTEE'
      AND u.is_active = 1
      AND u.deleted_at IS NULL
  ) THEN 'COMMITTEE_DEPUTY'
  ELSE position_code
END
WHERE position_code IS NULL;
` },
  { version: '20260912-260', sql: `
PRAGMA legacy_alter_table = ON;
-- Fail closed when live approval/observer state exists. There is no safe
-- automatic mapping (approving/rejecting/revoking on the operator's behalf
-- would fabricate decisions), so the operator resolves it first: finish or
-- remove pending reviews, revoke legacy assignments/memberships. Revoked
-- history rows are inert and stay; approval history stays in audit_logs.
-- (RAISE() cannot be used outside triggers, so each guard inserts the same
-- marker twice into a fresh PRIMARY KEY table: zero bad rows insert nothing,
-- one or more bad rows die on the second insert with a self-naming
-- UNIQUE violation that rolls the whole migration back.)
CREATE TABLE operations_approval_removal_guard_task_assignees(marker TEXT PRIMARY KEY);
INSERT INTO operations_approval_removal_guard_task_assignees(marker)
  SELECT 'legacy-active-assignment' FROM operation_task_assignees WHERE removed_at IS NULL AND assignment_role NOT IN ('OWNER','CONTRIBUTOR')
  UNION ALL
  SELECT 'legacy-active-assignment' FROM operation_task_assignees WHERE removed_at IS NULL AND assignment_role NOT IN ('OWNER','CONTRIBUTOR');
DROP TABLE operations_approval_removal_guard_task_assignees;
CREATE TABLE operations_approval_removal_guard_workstream_members(marker TEXT PRIMARY KEY);
INSERT INTO operations_approval_removal_guard_workstream_members(marker)
  SELECT 'legacy-active-membership' FROM operation_workstream_members WHERE removed_at IS NULL AND operation_role NOT IN ('WORKSTREAM_LEAD','OBSERVER')
  UNION ALL
  SELECT 'legacy-active-membership' FROM operation_workstream_members WHERE removed_at IS NULL AND operation_role NOT IN ('WORKSTREAM_LEAD','OBSERVER');
DROP TABLE operations_approval_removal_guard_workstream_members;
CREATE TABLE operations_approval_removal_guard_tasks(marker TEXT PRIMARY KEY);
INSERT INTO operations_approval_removal_guard_tasks(marker)
  SELECT 'legacy-pending-review' FROM operation_tasks WHERE deleted_at IS NULL AND approval_status = 'PENDING'
  UNION ALL
  SELECT 'legacy-pending-review' FROM operation_tasks WHERE deleted_at IS NULL AND approval_status = 'PENDING';
DROP TABLE operations_approval_removal_guard_tasks;
ALTER TABLE operation_tasks RENAME TO operation_tasks_legacy;
CREATE TABLE operation_tasks (
  id TEXT NOT NULL,
  parish_id TEXT NOT NULL,
  operation_event_id TEXT,
  workstream_id TEXT,
  scope_unit_id TEXT,
  parent_task_id TEXT,
  phase TEXT NOT NULL DEFAULT 'PREPARATION' CHECK(phase IN ('PREPARATION','EXECUTION','FOLLOW_UP')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'TODO' CHECK(status IN ('BACKLOG','TODO','IN_PROGRESS','BLOCKED','DONE','CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
  is_required INTEGER NOT NULL DEFAULT 0 CHECK(is_required IN (0,1)),
  due_at TEXT,
  scheduled_start_at TEXT,
  scheduled_end_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  completion_note TEXT,
  blocked_reason TEXT,
  cancellation_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  completed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  PRIMARY KEY (parish_id, id),
  FOREIGN KEY (parish_id, operation_event_id) REFERENCES operation_events(parish_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id, workstream_id) REFERENCES operation_workstreams(parish_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id, scope_unit_id) REFERENCES parish_organization_units(parish_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id, parent_task_id) REFERENCES operation_tasks(parish_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (parish_id, completed_by) REFERENCES users(parish_id, id) ON DELETE RESTRICT,
  CHECK((scheduled_start_at IS NULL AND scheduled_end_at IS NULL) OR (scheduled_start_at IS NOT NULL AND scheduled_end_at IS NOT NULL AND scheduled_end_at > scheduled_start_at))
);
INSERT INTO operation_tasks (id, parish_id, operation_event_id, workstream_id, scope_unit_id, parent_task_id, phase, title, description, status, priority, is_required, due_at, scheduled_start_at, scheduled_end_at, started_at, completed_at, completion_note, blocked_reason, cancellation_reason, version, created_by, updated_by, completed_by, created_at, updated_at, deleted_at)
  SELECT id, parish_id, operation_event_id, workstream_id, scope_unit_id, parent_task_id, phase, title, description, status, priority, is_required, due_at, scheduled_start_at, scheduled_end_at, started_at, completed_at, completion_note, blocked_reason, cancellation_reason, version, created_by, updated_by, completed_by, created_at, updated_at, deleted_at
  FROM operation_tasks_legacy;
DROP TABLE operation_tasks_legacy;
CREATE INDEX IF NOT EXISTS idx_operation_tasks_list ON operation_tasks(parish_id, status, due_at, deleted_at);
CREATE INDEX IF NOT EXISTS idx_operation_tasks_workstream ON operation_tasks(parish_id, workstream_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_operation_tasks_schedule ON operation_tasks(parish_id, scheduled_start_at, scheduled_end_at, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_operation_tasks_scope ON operation_tasks(parish_id, scope_unit_id, deleted_at);
CREATE TRIGGER check_operation_task_scope_insert BEFORE INSERT ON operation_tasks BEGIN
  SELECT CASE WHEN NEW.operation_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.operation_event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_EVENT') END;
  SELECT CASE WHEN NEW.workstream_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_workstreams w WHERE w.parish_id = NEW.parish_id AND w.id = NEW.workstream_id AND w.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_WORKSTREAM') END;
  SELECT CASE WHEN NEW.operation_event_id IS NOT NULL AND NEW.workstream_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_workstreams w WHERE w.parish_id = NEW.parish_id AND w.id = NEW.workstream_id AND w.operation_event_id = NEW.operation_event_id AND w.deleted_at IS NULL) THEN RAISE(ABORT, 'OPERATION_TASK_EVENT_WORKSTREAM_MISMATCH') END;
END;
CREATE TRIGGER check_operation_task_scope_update BEFORE UPDATE OF operation_event_id, workstream_id ON operation_tasks BEGIN
  SELECT CASE WHEN NEW.operation_event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_events e WHERE e.parish_id = NEW.parish_id AND e.id = NEW.operation_event_id AND e.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_EVENT') END;
  SELECT CASE WHEN NEW.workstream_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_workstreams w WHERE w.parish_id = NEW.parish_id AND w.id = NEW.workstream_id AND w.deleted_at IS NULL) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_WORKSTREAM') END;
  SELECT CASE WHEN NEW.operation_event_id IS NOT NULL AND NEW.workstream_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM operation_workstreams w WHERE w.parish_id = NEW.parish_id AND w.id = NEW.workstream_id AND w.operation_event_id = NEW.operation_event_id AND w.deleted_at IS NULL) THEN RAISE(ABORT, 'OPERATION_TASK_EVENT_WORKSTREAM_MISMATCH') END;
END;
CREATE TRIGGER check_operation_task_cancellation_insert
BEFORE INSERT ON operation_tasks
WHEN NEW.status = 'CANCELLED' AND trim(coalesce(NEW.cancellation_reason, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'OPERATION_TASK_CANCELLATION_REASON_REQUIRED');
END;
CREATE TRIGGER check_operation_task_cancellation_update
BEFORE UPDATE OF status, cancellation_reason ON operation_tasks
WHEN NEW.status = 'CANCELLED' AND trim(coalesce(NEW.cancellation_reason, '')) = ''
BEGIN
  SELECT RAISE(ABORT, 'OPERATION_TASK_CANCELLATION_REASON_REQUIRED');
END;
CREATE TRIGGER check_operation_task_schedule_insert
BEFORE INSERT ON operation_tasks
WHEN NOT (
  (NEW.scheduled_start_at IS NULL AND NEW.scheduled_end_at IS NULL)
  OR (NEW.scheduled_start_at IS NOT NULL AND NEW.scheduled_end_at IS NOT NULL AND NEW.scheduled_end_at > NEW.scheduled_start_at)
)
BEGIN SELECT RAISE(ABORT, 'operation task schedule requires a valid start/end pair'); END;
CREATE TRIGGER check_operation_task_schedule_update
BEFORE UPDATE OF scheduled_start_at,scheduled_end_at ON operation_tasks
WHEN NOT (
  (NEW.scheduled_start_at IS NULL AND NEW.scheduled_end_at IS NULL)
  OR (NEW.scheduled_start_at IS NOT NULL AND NEW.scheduled_end_at IS NOT NULL AND NEW.scheduled_end_at > NEW.scheduled_start_at)
)
BEGIN SELECT RAISE(ABORT, 'operation task schedule requires a valid start/end pair'); END;
CREATE TRIGGER check_operation_task_scope_unit_insert BEFORE INSERT ON operation_tasks
WHEN NEW.scope_unit_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM parish_organization_units u
    WHERE u.parish_id = NEW.parish_id AND u.id = NEW.scope_unit_id AND u.deleted_at IS NULL AND u.is_active = 1
  ) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_SCOPE') END;
END;
CREATE TRIGGER check_operation_task_scope_unit_update BEFORE UPDATE OF scope_unit_id ON operation_tasks
WHEN NEW.scope_unit_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM parish_organization_units u
    WHERE u.parish_id = NEW.parish_id AND u.id = NEW.scope_unit_id AND u.deleted_at IS NULL AND u.is_active = 1
  ) THEN RAISE(ABORT, 'INVALID_OPERATION_TASK_SCOPE') END;
END;
` },
]