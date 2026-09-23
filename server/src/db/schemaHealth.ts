export interface SchemaHealthClient {
  execute(statement: string): Promise<{ rows: readonly unknown[] }>
}

function migrationRange(prefix: string, start: number, end: number, excluded: readonly number[] = []): string[] {
  const excludedSet = new Set(excluded)
  const markers: string[] = []
  for (let version = start; version <= end; version++) {
    if (!excludedSet.has(version)) markers.push(`${prefix}-${String(version).padStart(3, '0')}`)
  }
  return markers
}

/**
 * Exact manifest represented by MIGRATIONS in db/index.ts.
 * Intentionally absent historical numbers (020/030/036/046) are excluded.
 * A migration that logs-and-continues without recording its version therefore
 * becomes a startup-blocking condition here, regardless of its age.
 */
export const REQUIRED_MIGRATION_MARKERS = [
  ...migrationRange('20240728', 1, 38, [20, 30, 36]),
  ...migrationRange('20240729', 39, 42),
  ...migrationRange('20240730', 43, 52, [46]),
  ...migrationRange('20240802', 53, 62),
  ...migrationRange('20260803', 63, 64),
  ...migrationRange('20260804', 65, 66),
  ...migrationRange('20260805', 67, 71),
  ...migrationRange('20260806', 72, 73),
  ...migrationRange('20260807', 74, 81),
  ...migrationRange('20260808', 82, 102),
  '20260811-103',
  ...migrationRange('20260812', 104, 115),
  '20260813-116',
  '20260814-109',
  ...migrationRange('20260814', 117, 118),
  ...migrationRange('20260815', 119, 120),
  '20260816-121',
  '20260817-122',
  ...migrationRange('20260818', 123, 125),
  ...migrationRange('20260820', 126, 127),
  ...migrationRange('20260822', 128, 128),
  ...migrationRange('20260824', 129, 129),
  ...migrationRange('20260827', 130, 131),
  ...migrationRange('20260828', 132, 135),
  ...migrationRange('20260831', 136, 146),
  ...migrationRange('20260901', 147, 148),
  ...migrationRange('20260902', 149, 158),
  ...migrationRange('20260903', 159, 165),
  ...migrationRange('20260904', 166, 169),
  ...migrationRange('20260906', 170, 176),
  ...migrationRange('20260907', 177, 181),
  ...migrationRange('20260907', 182, 192),
  ...migrationRange('20260907', 193, 205),
  ...migrationRange('20260907', 206, 210),
  ...migrationRange('20260907', 211, 212),
  ...migrationRange('20260907', 213, 226),
  ...migrationRange('20260908', 227, 235),
  '20260909-236',
  '20260909-237',
  '20260909-238',
  '20260909-239',
  '20260909-240',
  '20260909-241',
  '20260909-242',
  '20260909-243',
  '20260909-244',
  '20260909-245',
  '20260909-246',
  '20260909-247',
  '20260909-248',
  '20260909-249',
  '20260909-250',
  '20260910-251',
  '20260910-252',
  '20260910-253',
  '20260910-254',
  '20260911-255',
  '20260912-256',
  '20260912-257',
  '20260912-258',
  '20260912-259',
  '20260917-261',
  '20260922-264',
  '20260922-265',
] as const

const REQUIRED_INDEX_COLUMNS: Record<string, readonly string[]> = {
  idx_users_username_parish: ['parish_id', 'username'],
  idx_users_active_role: ['parish_id', 'role', 'deleted_at'],
  idx_students_code_parish: ['parish_id', 'code'],
  idx_attendance_unique: ['parish_id', 'student_id', 'date', 'type'],
  idx_external_links_active_source: ['parish_id', 'provider', 'entity_kind', 'external_scope', 'external_id'],
  idx_external_links_active_target: ['parish_id', 'provider', 'entity_kind', 'external_scope', 'target_id'],
  idx_external_import_items_run_index: ['parish_id', 'run_id', 'item_index'],
  idx_grades_lookup: ['parish_id', 'student_id', 'academic_year', 'semester'],
  idx_classes_code_year: ['parish_id', 'code', 'academic_year_id'],
  idx_catechist_assignments_unique: ['parish_id', 'user_id', 'class_id'],
  idx_catechist_assignments_one_cn_per_class: ['parish_id', 'class_id'],
  idx_catechist_assignments_one_cn_class_per_user: ['parish_id', 'user_id'],
  idx_role_permissions_pk: ['parish_id', 'role', 'permission_id'],
  idx_service_assignments_unique: ['parish_id', 'student_id', 'service_type'],
  idx_exam_results_unique: ['parish_id', 'exam_session_id', 'student_id'],
  idx_attendance_sessions_unique: ['parish_id', 'class_id', 'date', 'type'],
  idx_students_idempotency: ['parish_id', 'idempotency_key'],
  idx_notices_idempotency: ['parish_id', 'idempotency_key'],
  idx_classes_idempotency: ['parish_id', 'idempotency_key'],
  idx_exam_sessions_idempotency: ['parish_id', 'idempotency_key'],
  idx_exam_sessions_blueprint: ['parish_id', 'blueprint_id'],
  idx_exam_result_mutations_session: ['parish_id', 'exam_session_id', 'created_at'],
  idx_parish_people_name: ['parish_id', 'full_name'],
  idx_parish_people_linked_user: ['parish_id', 'linked_user_id'],
  idx_parish_units_parent: ['parish_id', 'parent_id', 'sort_order'],
  idx_parish_units_one_active_board: ['parish_id'],
  idx_parish_terms_person: ['parish_id', 'person_id', 'start_date'],
  idx_parish_records_timeline: ['parish_id', 'status', 'show_on_timeline', 'occurred_on'],
  idx_parish_assets_type: ['parish_id', 'asset_type', 'captured_on'],
  idx_operation_workstreams_scope: ['parish_id', 'source_unit_id', 'deleted_at'],
  idx_operation_workstreams_event: ['parish_id', 'operation_event_id', 'deleted_at'],
  idx_operation_tasks_list: ['parish_id', 'status', 'due_at', 'deleted_at'],
  idx_operation_tasks_workstream: ['parish_id', 'workstream_id', 'deleted_at'],
  idx_operation_tasks_schedule: ['parish_id', 'scheduled_start_at', 'scheduled_end_at', 'status', 'deleted_at'],
  idx_operation_task_dependencies_task: ['parish_id', 'task_id'],
  idx_operation_task_assignees_user: ['parish_id', 'user_id', 'acknowledgement_status', 'removed_at'],
  idx_operation_task_assignees_person: ['parish_id', 'person_id', 'acknowledgement_status', 'removed_at'],
  idx_operation_task_owner_active: ['parish_id', 'task_id'],
  idx_operation_task_assignee_user_role_active: ['parish_id', 'task_id', 'user_id', 'assignment_role'],
  idx_operation_task_assignee_person_role_active: ['parish_id', 'task_id', 'person_id', 'assignment_role'],
  idx_operation_checklist_task: ['parish_id', 'task_id', 'sort_order'],
  idx_operation_workstream_member_user_role_active: ['parish_id', 'workstream_id', 'user_id', 'operation_role'],
  idx_operation_workstream_member_person_role_active: ['parish_id', 'workstream_id', 'person_id', 'operation_role'],
  idx_operation_workstream_members_user: ['parish_id', 'user_id', 'removed_at'],
  idx_operation_workstream_members_person: ['parish_id', 'person_id', 'removed_at'],
  idx_operation_task_comments_task: ['parish_id', 'task_id', 'created_at'],
  idx_operation_mutation_receipts_created: ['parish_id', 'created_at'],
  idx_operation_events_list: ['parish_id', 'status', 'starts_at', 'deleted_at'],
  idx_operation_events_scope_type: ['parish_id', 'event_scope_type', 'status'],
  idx_operation_tasks_scope: ['parish_id', 'scope_unit_id', 'deleted_at'],
  idx_operation_events_source: ['parish_id', 'source_parish_event_id'],
  idx_operation_events_visibility: ['parish_id', 'visibility', 'starts_at'],
  idx_operation_events_automation_due: ['automation_paused', 'status', 'starts_at', 'ends_at', 'deleted_at'],
  idx_operation_task_dispatch_active: ['parish_id', 'task_id'],
  idx_operation_task_dispatch_reserve_due: ['status', 'reserve_invite_at', 'reserve_invited_at'],
  idx_operation_event_templates_list: ['parish_id', 'scope_unit_id', 'is_active', 'updated_at'],
  idx_operation_event_template_versions_source: ['parish_id', 'source_event_id', 'created_at'],
  idx_operation_event_participants_event: ['parish_id', 'event_id', 'attendance_status'],
  idx_operation_event_participants_user: ['parish_id', 'user_id', 'attendance_status'],
  idx_operation_event_participant_user_unique: ['parish_id', 'event_id', 'user_id'],
  idx_operation_event_participant_person_unique: ['parish_id', 'event_id', 'person_id'],
  idx_operation_blockouts_user_time: ['parish_id', 'user_id', 'starts_at', 'ends_at', 'deleted_at'],
  idx_operation_blockouts_person_time: ['parish_id', 'person_id', 'starts_at', 'ends_at', 'deleted_at'],
  idx_operation_reminders_dedupe: ['parish_id', 'dedupe_key'],
  idx_operation_reminders_due: ['parish_id', 'status', 'trigger_at'],
  idx_feedback_inbox: ['parish_id', 'target_type', 'target_user_id', 'status', 'created_at'],
  idx_feedback_public_sender: ['parish_id', 'sender_user_id', 'created_at'],
  idx_password_reset_request_user: ['parish_id', 'user_id'],
  idx_password_reset_requests_inbox: ['parish_id', 'status', 'last_requested_at'],
  idx_native_push_tokens_installation: ['installation_id'],
  idx_native_push_tokens_platform_token: ['platform', 'token'],
  idx_native_push_tokens_user: ['parish_id', 'user_id'],
  idx_notifications_worker: ['status', 'next_attempt_at', 'lease_expires_at'],
  idx_question_bank_list: ['parish_id', 'status', 'updated_at'],
  idx_question_bank_taxonomy: ['parish_id', 'branch_id', 'curriculum_level', 'lesson_order', 'difficulty'],
  idx_question_bank_author: ['parish_id', 'created_by', 'status'],
  idx_question_bank_versions_number: ['parish_id', 'question_id', 'version'],
  idx_question_bank_versions_question: ['parish_id', 'question_id', 'created_at'],
  idx_exam_blueprints_list: ['parish_id', 'status', 'updated_at'],
  idx_exam_blueprints_taxonomy: ['parish_id', 'branch_id', 'curriculum_level'],
  idx_exam_blueprint_rules_order: ['parish_id', 'blueprint_id', 'ordinal'],
  idx_exam_blueprint_rules_blueprint: ['parish_id', 'blueprint_id'],
  idx_exam_question_snapshots_position: ['parish_id', 'exam_session_id', 'source_position'],
  idx_exam_question_snapshots_usage: ['parish_id', 'question_id', 'created_at'],
}

const REQUIRED_TRIGGER_NAMES = [
  'check_grade_scores_insert',
  'check_grade_scores_update',
  'check_outbox_messages_status_insert',
  'check_outbox_messages_status_update',
  'check_grade_overrides_field_insert',
  'check_grade_overrides_field_update',
  'check_exam_session_blueprint_insert',
  'check_exam_session_blueprint_update',
  'check_operation_event_scope_insert',
  'check_operation_event_scope_update',
  'check_operation_event_scope_type_insert',
  'check_operation_event_scope_type_update',
  'check_operation_workstream_scope_insert',
  'check_operation_workstream_scope_update',
  'check_operation_task_scope_insert',
  'check_operation_task_scope_update',
  'check_operation_task_scope_unit_insert',
  'check_operation_task_scope_unit_update',
  'check_operation_event_organizer_insert',
  'check_operation_event_organizer_update',
  'check_operation_participant_target_insert',
  'check_operation_blockout_target_insert',
  'check_operation_reminder_target_insert',
  'check_parish_term_position_scope_insert',
  'check_parish_term_position_scope_update',
  'check_parish_unit_hierarchy_insert',
  'check_parish_unit_hierarchy_update',
  'check_parish_unit_parent_integrity_update',
  'check_parish_leader_term_overlap_insert',
  'check_parish_leader_term_overlap_update',
  'check_parish_unit_position_scope_update',
  'check_operation_task_cancellation_insert',
  'check_operation_task_cancellation_update',
  'check_operation_task_schedule_insert',
  'check_operation_task_schedule_update',
  'check_operation_event_template_insert',
  'check_operation_event_template_update',
  'check_operation_event_template_version_delete',
] as const

const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  external_entity_links: ['parish_id', 'id', 'provider', 'entity_kind', 'external_scope', 'external_id', 'target_id', 'version', 'reviewed_by', 'retired_at'],
  external_import_runs: ['parish_id', 'id', 'file_hash', 'actor_id', 'preview_digest', 'status'],
  external_import_items: ['parish_id', 'id', 'run_id', 'item_index', 'observation_hash', 'target_class_id', 'mapping_version', 'class_mapping_version', 'classification', 'receipt'],
  academic_years: ['promotion_target_year_id', 'finalization_policy'],
  academic_year_snapshots: ['source_class_id', 'report_snapshot'],
  import_batches: ['content_hash', 'classes_created', 'created_class_ids'],
  import_batch_students: ['rollback_snapshot'],
  grades: ['score_dao_duc_source', 'score_dao_duc_updated_at'],
  notifications: ['target_user_ids', 'attempt_count', 'max_attempts', 'lease_owner', 'lease_expires_at', 'next_attempt_at', 'delivery_kind'],
  users: ['password_encrypted', 'holy_name', 'deleted_at'],
  exam_results: ['parish_id', 'scan_metadata', 'exam_version', 'result_version', 'attempt_fingerprint', 'captured_at', 'saved_by', 'saved_at'],
  exam_sessions: ['idempotency_key', 'questions', 'answer_variants', 'variant_manifests', 'source_type', 'blueprint_id', 'blueprint_snapshot', 'build_request_hash'],
  exam_result_mutations: ['client_mutation_id', 'parish_id', 'user_id', 'exam_session_id', 'student_id', 'request_hash', 'response_json'],
  // A-NEW-62 (2026-08-23): production từng thiếu promotion_records.is_latest
  // (di sản migration D-04/ADR-031) → mọi SELECT phiếu điểm/khuyến thăng 500 âm thầm.
  // Gate chặt cột cho bảng trong pipeline báo cáo + grade_overrides.phuhuynh-spec.
  promotion_records: ['is_latest', 'is_overridden', 'final_decision', 'status', 'completed_at', 'completed_target_year_id'],
  grade_overrides: ['parish_id', 'deleted_at', 'score_field', 'manual_value'],
  parish_profiles: ['parish_id', 'display_name', 'founded_date'],
  parish_people: ['parish_id', 'id', 'visibility', 'deleted_at'],
  parish_organization_units: ['parish_id', 'id', 'parent_id', 'deleted_at'],
  parish_service_terms: ['parish_id', 'id', 'person_id', 'unit_id', 'position_code', 'deleted_at'],
  parish_records: ['parish_id', 'id', 'status', 'visibility', 'show_on_timeline', 'deleted_at'],
  parish_archive_assets: ['parish_id', 'id', 'storage_type', 'object_key', 'external_url', 'deleted_at'],
  operation_workstreams: ['parish_id', 'id', 'source_unit_id', 'status', 'blocked_reason', 'version', 'deleted_at'],
  operation_tasks: ['parish_id', 'id', 'workstream_id', 'scope_unit_id', 'status', 'priority', 'is_required', 'phase', 'due_at', 'scheduled_start_at', 'scheduled_end_at', 'version', 'blocked_reason', 'cancellation_reason', 'deleted_at'],
  operation_task_dependencies: ['parish_id', 'task_id', 'depends_on_task_id', 'dependency_type'],
  operation_task_assignees: ['parish_id', 'id', 'task_id', 'user_id', 'person_id', 'assignment_role', 'acknowledgement_status', 'version', 'removed_at'],
  operation_checklist_items: ['parish_id', 'task_id', 'id', 'is_required', 'is_done'],
  operation_workstream_members: ['parish_id', 'id', 'workstream_id', 'user_id', 'person_id', 'operation_role', 'version', 'removed_at'],
  operation_task_comments: ['parish_id', 'id', 'task_id', 'author_user_id', 'content', 'deleted_at'],
  operation_mutation_receipts: ['parish_id', 'actor_user_id', 'idempotency_key', 'command', 'request_hash', 'response_json', 'response_pruned_at'],
  operation_events: ['parish_id', 'id', 'source_parish_event_id', 'source_template_id', 'source_template_version', 'event_scope_type', 'scope_unit_id', 'status', 'visibility', 'outcome_summary', 'completion_record_id', 'automation_paused', 'automation_paused_at', 'automation_paused_by', 'automation_pause_reason', 'version', 'deleted_at'],
  operation_task_dispatches: ['parish_id', 'id', 'task_id', 'primary_user_id', 'primary_person_id', 'reserve_user_id', 'reserve_person_id', 'acknowledge_by', 'primary_invited_at', 'reserve_invite_at', 'reserve_invited_at', 'accepted_target', 'accepted_assignment_id', 'status', 'version'],
  operation_event_templates: ['parish_id', 'id', 'scope_unit_id', 'name', 'description', 'latest_version', 'version', 'is_active', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  operation_event_template_versions: ['parish_id', 'template_id', 'version', 'source_event_id', 'snapshot_json', 'created_by', 'created_at'],
  operation_event_retrospectives: ['parish_id', 'event_id', 'lessons_learned', 'improvement_notes', 'version', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  operation_event_participants: ['parish_id', 'event_id', 'id', 'user_id', 'person_id', 'attendance_status', 'version'],
  operation_blockouts: ['parish_id', 'id', 'user_id', 'person_id', 'starts_at', 'ends_at', 'version', 'deleted_at'],
  operation_reminders: ['parish_id', 'id', 'recipient_user_id', 'trigger_at', 'kind', 'dedupe_key', 'status', 'version', 'read_at', 'enqueued_at', 'lease_expires_at', 'next_attempt_at', 'notification_id'],
  feedback_messages: ['parish_id', 'id', 'target_type', 'target_user_id', 'visibility', 'sender_user_id', 'subject', 'content', 'status'],
  password_reset_requests: ['parish_id', 'id', 'user_id', 'status', 'request_count', 'last_requested_at', 'resolved_at', 'resolved_by'],
  native_push_tokens: ['parish_id', 'id', 'installation_id', 'platform', 'token', 'user_id', 'created_at', 'updated_at'],
  notices: ['parish_id', 'id', 'updated_at', 'deleted_at', 'parent_revoked_at'],
  question_bank_items: ['parish_id', 'id', 'status', 'current_version', 'branch_id', 'curriculum_level', 'difficulty', 'provenance', 'created_by'],
  question_bank_versions: ['parish_id', 'id', 'question_id', 'version', 'question_type', 'stem', 'answer_data', 'metadata_snapshot', 'content_hash'],
  exam_blueprints: ['parish_id', 'id', 'name', 'status', 'total_questions', 'max_score', 'version', 'created_by'],
  exam_blueprint_rules: ['parish_id', 'id', 'blueprint_id', 'ordinal', 'question_type', 'question_count', 'points_each'],
  exam_question_snapshots: ['parish_id', 'id', 'exam_session_id', 'question_id', 'question_version_id', 'source_position', 'snapshot_json', 'content_hash'],
}

const REQUIRED_TABLE_SQL_FRAGMENTS: Record<string, readonly string[]> = {
  feedback_messages: [
    'visibility=anonymousandsender_user_idisnull',
    'visibility=publicandsender_user_idisnotnull',
    'target_type=parishandtarget_user_idisnull',
    'target_type=homeroom_teacherandtarget_user_idisnotnull',
  ],
  password_reset_requests: [
    'request_count>=1',
    'status=pendingandresolved_atisnullandresolved_byisnull',
    'statusin(resolved,dismissed)andresolved_atisnotnullandresolved_byisnotnull',
  ],
  // Tier 2 (20260904-168): ledger phải chấp nhận attempts nhập tay.
  assessment_entries: [
    'sourcein(exam_finalization,legacy_baseline,manual_entry)',
  ],
}

const REQUIRED_COMPOSITE_PRIMARY_KEYS: Record<string, readonly string[]> = {
  external_entity_links: ['parish_id', 'id'],
  external_import_runs: ['parish_id', 'id'],
  external_import_items: ['parish_id', 'id'],
  users: ['parish_id', 'id'],
  students: ['parish_id', 'id'],
  classes: ['parish_id', 'id'],
  grades: ['parish_id', 'id'],
  attendance: ['parish_id', 'id'],
  audit_logs: ['parish_id', 'id'],
  funds: ['parish_id', 'id'],
  financial_transactions: ['parish_id', 'id'],
  student_fee_records: ['parish_id', 'id'],
  exam_result_mutations: ['parish_id', 'user_id', 'client_mutation_id'],
  parish_people: ['parish_id', 'id'],
  parish_organization_units: ['parish_id', 'id'],
  parish_service_terms: ['parish_id', 'id'],
  parish_records: ['parish_id', 'id'],
  parish_archive_assets: ['parish_id', 'id'],
  operation_workstreams: ['parish_id', 'id'],
  operation_tasks: ['parish_id', 'id'],
  operation_task_dependencies: ['parish_id', 'task_id', 'depends_on_task_id'],
  operation_task_assignees: ['parish_id', 'id'],
  operation_checklist_items: ['parish_id', 'task_id', 'id'],
  operation_workstream_members: ['parish_id', 'id'],
  operation_task_comments: ['parish_id', 'id'],
  operation_mutation_receipts: ['parish_id', 'actor_user_id', 'idempotency_key'],
  operation_events: ['parish_id', 'id'],
  operation_task_dispatches: ['parish_id', 'id'],
  operation_event_templates: ['parish_id', 'id'],
  operation_event_template_versions: ['parish_id', 'template_id', 'version'],
  operation_event_retrospectives: ['parish_id', 'event_id'],
  operation_event_participants: ['parish_id', 'event_id', 'id'],
  operation_blockouts: ['parish_id', 'id'],
  operation_reminders: ['parish_id', 'id'],
  parish_record_people: ['parish_id', 'record_id', 'person_id'],
  parish_record_assets: ['parish_id', 'record_id', 'asset_id'],
  feedback_messages: ['parish_id', 'id'],
  password_reset_requests: ['parish_id', 'id'],
  native_push_tokens: ['parish_id', 'id'],
  question_bank_items: ['parish_id', 'id'],
  question_bank_versions: ['parish_id', 'id'],
  exam_blueprints: ['parish_id', 'id'],
  exam_blueprint_rules: ['parish_id', 'id'],
  exam_question_snapshots: ['parish_id', 'id'],
  // Phase 3: mở rộng gate composite-PK cho các bảng critical còn lại ( Drizzle
  // schema đã khai báo (parish_id,id) đồng nhất — gate chặn drift/lược PK ở DB
  // thật ngay lúc startup thay vì 500 lúc runtime).
  notifications: ['parish_id', 'id'],
  outbox_messages: ['parish_id', 'id'],
  refresh_tokens: ['parish_id', 'id'],
  semester_locks: ['parish_id', 'id'],
  promotion_records: ['parish_id', 'id'],
  grade_overrides: ['parish_id', 'id'],
  catechist_assignments: ['parish_id', 'id'],
}

function rowValue(row: unknown, key: string, index: number): unknown {
  if (Array.isArray(row)) return row[index]
  if (row && typeof row === 'object') return (row as Record<string, unknown>)[key]
  return undefined
}

function normalizeIdentifier(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeSql(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/["'`[\]\s]/g, '')
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function loadRequiredTableInfo(client: SchemaHealthClient) {
  const names = [...new Set([
    ...Object.keys(REQUIRED_COLUMNS),
    ...Object.keys(REQUIRED_COMPOSITE_PRIMARY_KEYS),
  ])]
  const result = await client.execute(`
    SELECT m.name AS table_name, p.name AS column_name, p.pk AS pk
    FROM sqlite_master AS m JOIN pragma_table_info(m.name) AS p
    WHERE m.type = 'table' AND m.name IN (${names.map(quoteSqlLiteral).join(', ')})
  `)
  const byTable = new Map<string, Array<{ name: string; pk: number }>>()
  for (const row of result.rows) {
    const tableName = normalizeIdentifier(rowValue(row, 'table_name', 0))
    const columns = byTable.get(tableName) || []
    columns.push({
      name: normalizeIdentifier(rowValue(row, 'column_name', 1)),
      pk: Number(rowValue(row, 'pk', 2) ?? 0),
    })
    byTable.set(tableName, columns)
  }
  return byTable
}

/**
 * D3 startup gate for schema/data-integrity invariants that must exist before the
 * HTTP server accepts traffic. db/index.ts executes bootstrap + migrations first;
 * this verifier then fails closed if the executable schema is only partially
 * migrated or integrity/tenant guards are absent or malformed.
 */
export async function assertDatabaseReady(client: SchemaHealthClient): Promise<void> {
  const problems: string[] = []

  const markerList = REQUIRED_MIGRATION_MARKERS.map(quoteSqlLiteral).join(', ')
  const migrationResult = await client.execute(
    `SELECT version FROM schema_migrations WHERE version IN (${markerList})`,
  )
  const appliedMarkers = new Set(
    migrationResult.rows.map((row) => normalizeIdentifier(rowValue(row, 'version', 0))),
  )
  for (const marker of REQUIRED_MIGRATION_MARKERS) {
    if (!appliedMarkers.has(marker.toLowerCase())) problems.push(`missing required migration marker ${marker}`)
  }

  const indexNames = Object.keys(REQUIRED_INDEX_COLUMNS)
  const indexNameList = indexNames.map(quoteSqlLiteral).join(', ')
  const indexResult = await client.execute(
    `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name IN (${indexNameList})`,
  )
  const indexSqlByName = new Map<string, string>()
  for (const row of indexResult.rows) {
    indexSqlByName.set(
      normalizeIdentifier(rowValue(row, 'name', 0)),
      normalizeSql(rowValue(row, 'sql', 1)),
    )
  }

  for (const [indexName, columns] of Object.entries(REQUIRED_INDEX_COLUMNS)) {
    const definition = indexSqlByName.get(indexName.toLowerCase())
    if (!definition) {
      problems.push(`missing required index ${indexName}`)
      continue
    }
    const expectedColumns = `(${columns.join(',')})`
    if (!definition.includes(expectedColumns)) {
      problems.push(`index ${indexName} does not enforce ${expectedColumns}`)
    }
  }

  const triggerNameList = REQUIRED_TRIGGER_NAMES.map(quoteSqlLiteral).join(', ')
  const triggerResult = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name IN (${triggerNameList})`,
  )
  const actualTriggers = new Set(
    triggerResult.rows.map((row) => normalizeIdentifier(rowValue(row, 'name', 0))),
  )
  for (const triggerName of REQUIRED_TRIGGER_NAMES) {
    if (!actualTriggers.has(triggerName)) problems.push(`missing required integrity trigger ${triggerName}`)
  }

  // One schema snapshot replaces a remote PRAGMA round trip per table and
  // shares it between column and composite-PK checks. Missing tables still
  // produce empty column sets and fail the same readiness gates.
  const tableInfoByName = await loadRequiredTableInfo(client)
  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const tableInfo = tableInfoByName.get(tableName) || []
    const actualColumns = new Set(tableInfo.map((column) => column.name))
    for (const column of requiredColumns) {
      if (!actualColumns.has(column)) problems.push(`missing required column ${tableName}.${column}`)
    }
  }

  const constrainedTableNames = Object.keys(REQUIRED_TABLE_SQL_FRAGMENTS)
  const constrainedTableList = constrainedTableNames.map(quoteSqlLiteral).join(', ')
  const tableSqlResult = await client.execute(
    `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN (${constrainedTableList})`,
  )
  const tableSqlByName = new Map<string, string>()
  for (const row of tableSqlResult.rows) {
    tableSqlByName.set(
      normalizeIdentifier(rowValue(row, 'name', 0)),
      normalizeSql(rowValue(row, 'sql', 1)),
    )
  }
  for (const [tableName, fragments] of Object.entries(REQUIRED_TABLE_SQL_FRAGMENTS)) {
    const definition = tableSqlByName.get(tableName.toLowerCase())
    if (!definition) {
      problems.push(`missing required table ${tableName}`)
      continue
    }
    for (const fragment of fragments) {
      if (!definition.includes(fragment)) problems.push(`table ${tableName} is missing privacy constraint ${fragment}`)
    }
  }

  for (const [tableName, primaryKeyColumns] of Object.entries(REQUIRED_COMPOSITE_PRIMARY_KEYS)) {
    const tableInfo = tableInfoByName.get(tableName) || []
    const actualOrdinals = primaryKeyColumns.map(column => tableInfo.find(item => item.name === column)?.pk ?? 0)
    const valid = actualOrdinals.every((ordinal, index) => ordinal === index + 1)
    if (!valid) {
      problems.push(
        `table ${tableName} must use composite primary key (${primaryKeyColumns.join(', ')}); got pk ordinals ${primaryKeyColumns.map((column, index) => `${column}=${actualOrdinals[index]}`).join(', ')}`,
      )
    }
  }

  const foreignKeyCheck = await client.execute('PRAGMA foreign_key_check')
  if (foreignKeyCheck.rows.length > 0) {
    problems.push(`foreign_key_check reported ${foreignKeyCheck.rows.length} violation(s)`)
  }

  if (problems.length > 0) {
    throw new Error(`Database schema readiness check failed:\n- ${problems.join('\n- ')}`)
  }
}
