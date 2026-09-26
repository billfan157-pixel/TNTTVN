import type { Client } from '@libsql/client'

export const INDICES = [
  'CREATE INDEX IF NOT EXISTS idx_users_parish_id ON users(parish_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_native_push_tokens_installation ON native_push_tokens(installation_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_native_push_tokens_platform_token ON native_push_tokens(platform, token)',
  'CREATE INDEX IF NOT EXISTS idx_native_push_tokens_user ON native_push_tokens(parish_id, user_id)',
  'CREATE INDEX IF NOT EXISTS idx_students_parish_id ON students(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_students_idempotency ON students(parish_id, idempotency_key)',
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
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_notices_idempotency ON notices(parish_id, idempotency_key)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_parish_id ON audit_logs(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(parish_id, entity_type, entity_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_branches_parish_id ON branches(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_classes_parish_id ON classes(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_catechist_assignments_parish_id ON catechist_assignments(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_catechist_assignments_user_id ON catechist_assignments(user_id)',
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_catechist_assignments_one_cn_per_class ON catechist_assignments(parish_id, class_id) WHERE role_in_class = 'chunhiem'",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_catechist_assignments_one_cn_class_per_user ON catechist_assignments(parish_id, user_id) WHERE role_in_class = 'chunhiem'",
  'CREATE INDEX IF NOT EXISTS idx_notifications_parish_id ON notifications(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_lookup ON notifications(parish_id, status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_worker ON notifications(status, next_attempt_at, lease_expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_permissions_parish_id ON permissions(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_parish_id ON push_subscriptions(parish_id)',
  'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint_unique ON push_subscriptions(parish_id, endpoint)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_transactions_receipt_parish ON financial_transactions(parish_id, receipt_number) WHERE receipt_number IS NOT NULL',
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
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_idempotency ON classes(parish_id, idempotency_key)',
  'CREATE INDEX IF NOT EXISTS idx_mapping_memory_entity_id ON mapping_memory(entity_id)',
  'CREATE INDEX IF NOT EXISTS idx_grade_overrides_lookup ON grade_overrides(grade_id, score_field)',
  'CREATE INDEX IF NOT EXISTS idx_outbox_messages_status ON outbox_messages(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_semester_locks_lookup ON semester_locks(parish_id, academic_year, semester)',
  'CREATE INDEX IF NOT EXISTS idx_promotion_records_lookup ON promotion_records(parish_id, student_id, academic_year)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_sessions_idempotency ON exam_sessions(parish_id, idempotency_key)',
  'CREATE INDEX IF NOT EXISTS idx_exam_sessions_blueprint ON exam_sessions(parish_id, blueprint_id)',
  'CREATE INDEX IF NOT EXISTS idx_exam_result_mutations_session ON exam_result_mutations(parish_id, exam_session_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_question_bank_list ON question_bank_items(parish_id, status, updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_question_bank_taxonomy ON question_bank_items(parish_id, branch_id, curriculum_level, lesson_order, difficulty)',
  'CREATE INDEX IF NOT EXISTS idx_question_bank_author ON question_bank_items(parish_id, created_by, status)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_question_bank_versions_number ON question_bank_versions(parish_id, question_id, version)',
  'CREATE INDEX IF NOT EXISTS idx_question_bank_versions_question ON question_bank_versions(parish_id, question_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_exam_blueprints_list ON exam_blueprints(parish_id, status, updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_exam_blueprints_taxonomy ON exam_blueprints(parish_id, branch_id, curriculum_level)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_blueprint_rules_order ON exam_blueprint_rules(parish_id, blueprint_id, ordinal)',
  'CREATE INDEX IF NOT EXISTS idx_exam_blueprint_rules_blueprint ON exam_blueprint_rules(parish_id, blueprint_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_question_snapshots_position ON exam_question_snapshots(parish_id, exam_session_id, source_position)',
  'CREATE INDEX IF NOT EXISTS idx_exam_question_snapshots_usage ON exam_question_snapshots(parish_id, question_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_parish_events_parish_date ON parish_events(parish_id, date)',
  'CREATE INDEX IF NOT EXISTS idx_parish_events_parish_category ON parish_events(parish_id, category)',
  `CREATE TRIGGER IF NOT EXISTS check_grade_scores_insert BEFORE INSERT ON grades BEGIN SELECT CASE WHEN NEW.score_oral IS NOT NULL AND (NEW.score_oral < 0 OR NEW.score_oral > 10) THEN RAISE(ABORT, 'score_oral out of range 0-10') WHEN NEW.score_15m IS NOT NULL AND (NEW.score_15m < 0 OR NEW.score_15m > 10) THEN RAISE(ABORT, 'score_15m out of range 0-10') WHEN NEW.score_1_period IS NOT NULL AND (NEW.score_1_period < 0 OR NEW.score_1_period > 10) THEN RAISE(ABORT, 'score_1_period out of range 0-10') WHEN NEW.score_midterm IS NOT NULL AND (NEW.score_midterm < 0 OR NEW.score_midterm > 10) THEN RAISE(ABORT, 'score_midterm out of range 0-10') WHEN NEW.score_final IS NOT NULL AND (NEW.score_final < 0 OR NEW.score_final > 10) THEN RAISE(ABORT, 'score_final out of range 0-10') WHEN NEW.score_dao_duc IS NOT NULL AND (NEW.score_dao_duc < 0 OR NEW.score_dao_duc > 10) THEN RAISE(ABORT, 'score_dao_duc out of range 0-10') END; END`,
  `CREATE TRIGGER IF NOT EXISTS check_grade_scores_update BEFORE UPDATE ON grades BEGIN SELECT CASE WHEN NEW.score_oral IS NOT NULL AND (NEW.score_oral < 0 OR NEW.score_oral > 10) THEN RAISE(ABORT, 'score_oral out of range 0-10') WHEN NEW.score_15m IS NOT NULL AND (NEW.score_15m < 0 OR NEW.score_15m > 10) THEN RAISE(ABORT, 'score_15m out of range 0-10') WHEN NEW.score_1_period IS NOT NULL AND (NEW.score_1_period < 0 OR NEW.score_1_period > 10) THEN RAISE(ABORT, 'score_1_period out of range 0-10') WHEN NEW.score_midterm IS NOT NULL AND (NEW.score_midterm < 0 OR NEW.score_midterm > 10) THEN RAISE(ABORT, 'score_midterm out of range 0-10') WHEN NEW.score_final IS NOT NULL AND (NEW.score_final < 0 OR NEW.score_final > 10) THEN RAISE(ABORT, 'score_final out of range 0-10') WHEN NEW.score_dao_duc IS NOT NULL AND (NEW.score_dao_duc < 0 OR NEW.score_dao_duc > 10) THEN RAISE(ABORT, 'score_dao_duc out of range 0-10') END; END`,
  `CREATE TRIGGER IF NOT EXISTS check_outbox_messages_status_insert BEFORE INSERT ON outbox_messages BEGIN SELECT CASE WHEN NEW.status NOT IN ('pending', 'dispatched', 'failed') THEN RAISE(ABORT, 'outbox_messages status invalid') END; END`,
  `CREATE TRIGGER IF NOT EXISTS check_outbox_messages_status_update BEFORE UPDATE ON outbox_messages BEGIN SELECT CASE WHEN NEW.status NOT IN ('pending', 'dispatched', 'failed') THEN RAISE(ABORT, 'outbox_messages status invalid') END; END`,
  `CREATE TRIGGER IF NOT EXISTS check_grade_overrides_field_insert BEFORE INSERT ON grade_overrides BEGIN SELECT CASE WHEN NEW.score_field NOT IN ('scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc') THEN RAISE(ABORT, 'grade_overrides score_field invalid') END; END`,
  `CREATE TRIGGER IF NOT EXISTS check_grade_overrides_field_update BEFORE UPDATE ON grade_overrides BEGIN SELECT CASE WHEN NEW.score_field NOT IN ('scoreOral', 'score15m', 'score1Period', 'scoreMidterm', 'scoreFinal', 'scoreDaoDuc') THEN RAISE(ABORT, 'grade_overrides score_field invalid') END; END`,
]

export async function applyIndices(client: Client): Promise<void> {
  // On an already-migrated database, all 74 CREATE IF NOT EXISTS statements
  // are no-ops. Over a remote libSQL connection each one still costs a round
  // trip on every process wake. Discover existing objects once and run only
  // missing definitions; the executable readiness gate still checks required
  // index shapes and triggers before HTTP bind.
  const existing = await client.execute("SELECT name FROM sqlite_master WHERE type IN ('index', 'trigger')")
  const existingNames = new Set(existing.rows.map(row => String((row as Record<string, unknown>).name).toLowerCase()))
  for (const statement of INDICES) {
    const name = statement.match(/^CREATE\s+(?:UNIQUE\s+)?(?:INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+([A-Za-z0-9_]+)/i)?.[1]
    if (name && existingNames.has(name.toLowerCase())) continue
    try { await client.execute(statement) } catch {}
  }
}
