import { describe, expect, it } from 'vitest'
import {
  assertDatabaseReady,
  REQUIRED_MIGRATION_MARKERS,
  type SchemaHealthClient,
} from '../db/schemaHealth.js'

const INDEXES: Record<string, string[]> = {
  idx_users_username_parish: ['parish_id', 'username'],
  idx_students_code_parish: ['parish_id', 'code'],
  idx_attendance_unique: ['parish_id', 'student_id', 'date', 'type'],
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
  idx_parish_terms_person: ['parish_id', 'person_id', 'start_date'],
  idx_parish_records_timeline: ['parish_id', 'status', 'show_on_timeline', 'occurred_on'],
  idx_parish_assets_type: ['parish_id', 'asset_type', 'captured_on'],
  idx_feedback_inbox: ['parish_id', 'target_type', 'target_user_id', 'status', 'created_at'],
  idx_feedback_public_sender: ['parish_id', 'sender_user_id', 'created_at'],
  idx_password_reset_request_user: ['parish_id', 'user_id'],
  idx_password_reset_requests_inbox: ['parish_id', 'status', 'last_requested_at'],
  idx_users_active_role: ['parish_id', 'role', 'deleted_at'],
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

const TRIGGERS = [
  'check_grade_scores_insert',
  'check_grade_scores_update',
  'check_outbox_messages_status_insert',
  'check_outbox_messages_status_update',
  'check_grade_overrides_field_insert',
  'check_grade_overrides_field_update',
  'check_exam_session_blueprint_insert',
  'check_exam_session_blueprint_update',
]

const COMPOSITE_PK_TABLES = new Set([
  'users',
  'students',
  'classes',
  'grades',
  'attendance',
  'audit_logs',
  'funds',
  'financial_transactions',
  'student_fee_records',
  'parish_people',
  'parish_organization_units',
  'parish_service_terms',
  'parish_records',
  'parish_archive_assets',
  'feedback_messages',
  'password_reset_requests',
  'native_push_tokens',
  'question_bank_items',
  'question_bank_versions',
  'exam_blueprints',
  'exam_blueprint_rules',
  'exam_question_snapshots',
  // Phase 3: composite-PK gates mở rộng (schemaHealth REQUIRED_COMPOSITE_PRIMARY_KEYS).
  'notifications',
  'outbox_messages',
  'refresh_tokens',
  'semester_locks',
  'promotion_records',
  'grade_overrides',
  'catechist_assignments',
])

const SPECIAL_COMPOSITE_PRIMARY_KEYS: Record<string, string[]> = {
  exam_result_mutations: ['parish_id', 'user_id', 'client_mutation_id'],
  parish_record_people: ['parish_id', 'record_id', 'person_id'],
  parish_record_assets: ['parish_id', 'record_id', 'asset_id'],
}

const REQUIRED_COLUMNS: Record<string, string[]> = {
  academic_years: ['promotion_target_year_id', 'finalization_policy'],
  academic_year_snapshots: ['source_class_id', 'report_snapshot'],
  import_batches: ['content_hash', 'classes_created', 'created_class_ids'],
  import_batch_students: ['rollback_snapshot'],
  grades: ['score_dao_duc_source', 'score_dao_duc_updated_at'],
  notifications: ['target_user_ids', 'attempt_count', 'max_attempts', 'lease_owner', 'lease_expires_at', 'next_attempt_at', 'delivery_kind'],
  notices: ['parish_id', 'id', 'updated_at', 'deleted_at', 'parent_revoked_at'],
  users: ['password_encrypted', 'holy_name', 'deleted_at'],
  exam_results: ['parish_id', 'scan_metadata', 'exam_version', 'result_version', 'attempt_fingerprint', 'captured_at', 'saved_by', 'saved_at'],
  exam_sessions: ['idempotency_key', 'questions', 'answer_variants', 'variant_manifests', 'source_type', 'blueprint_id', 'blueprint_snapshot', 'build_request_hash'],
  exam_result_mutations: ['client_mutation_id', 'parish_id', 'user_id', 'exam_session_id', 'student_id', 'request_hash', 'response_json'],
  promotion_records: ['is_latest', 'is_overridden', 'final_decision', 'status', 'completed_at', 'completed_target_year_id'],
  grade_overrides: ['parish_id', 'deleted_at', 'score_field', 'manual_value'],
  parish_profiles: ['parish_id', 'display_name', 'founded_date'],
  parish_people: ['parish_id', 'id', 'visibility', 'deleted_at'],
  parish_organization_units: ['parish_id', 'id', 'parent_id', 'deleted_at'],
  parish_service_terms: ['parish_id', 'id', 'person_id', 'unit_id', 'deleted_at'],
  parish_records: ['parish_id', 'id', 'status', 'visibility', 'show_on_timeline', 'deleted_at'],
  parish_archive_assets: ['parish_id', 'id', 'storage_type', 'object_key', 'external_url', 'deleted_at'],
  feedback_messages: ['parish_id', 'id', 'target_type', 'target_user_id', 'visibility', 'sender_user_id', 'subject', 'content', 'status'],
  password_reset_requests: ['parish_id', 'id', 'user_id', 'status', 'request_count', 'last_requested_at', 'resolved_at', 'resolved_by'],
  native_push_tokens: ['parish_id', 'id', 'installation_id', 'platform', 'token', 'user_id', 'created_at', 'updated_at'],
  question_bank_items: ['parish_id', 'id', 'status', 'current_version', 'branch_id', 'curriculum_level', 'difficulty', 'provenance', 'created_by'],
  question_bank_versions: ['parish_id', 'id', 'question_id', 'version', 'question_type', 'stem', 'answer_data', 'metadata_snapshot', 'content_hash'],
  exam_blueprints: ['parish_id', 'id', 'name', 'status', 'total_questions', 'max_score', 'version', 'created_by'],
  exam_blueprint_rules: ['parish_id', 'id', 'blueprint_id', 'ordinal', 'question_type', 'question_count', 'points_each'],
  exam_question_snapshots: ['parish_id', 'id', 'exam_session_id', 'question_id', 'question_version_id', 'source_position', 'snapshot_json', 'content_hash'],
}

function createHealthyClient(
  options: { omitMigration?: string; omitIndex?: string; omitTrigger?: string; omitColumn?: string; omitFeedbackConstraint?: string; omitAssessmentTable?: boolean; omitPkTable?: string } = {},
): SchemaHealthClient {
  return {
    async execute(statement: string) {
      if (statement.startsWith('SELECT version FROM schema_migrations')) {
        return {
          rows: REQUIRED_MIGRATION_MARKERS
            .filter((version) => version !== options.omitMigration)
            .map((version) => ({ version })),
        }
      }

      if (statement.startsWith("SELECT name, sql FROM sqlite_master WHERE type = 'index'")) {
        return {
          rows: Object.entries(INDEXES)
            .filter(([name]) => name !== options.omitIndex)
            .map(([name, columns]) => ({
              name,
              sql: `CREATE UNIQUE INDEX ${name} ON synthetic_table (${columns.join(', ')})`,
            })),
        }
      }

      if (statement.startsWith("SELECT name FROM sqlite_master WHERE type = 'trigger'")) {
        return {
          rows: TRIGGERS
            .filter((name) => name !== options.omitTrigger)
            .map((name) => ({ name })),
        }
      }

      if (statement.startsWith("SELECT name, sql FROM sqlite_master WHERE type = 'table'")) {
        const fragments = [
          'visibility=anonymousandsender_user_idisnull',
          'visibility=publicandsender_user_idisnotnull',
          'target_type=parishandtarget_user_idisnull',
          'target_type=homeroom_teacherandtarget_user_idisnotnull',
        ].filter(fragment => fragment !== options.omitFeedbackConstraint)
        const rows: Array<{ name: string; sql: string }> = [
          { name: 'feedback_messages', sql: fragments.join(' ') },
          {
            name: 'password_reset_requests',
            sql: 'request_count>=1 status=pendingandresolved_atisnullandresolved_byisnull statusin(resolved,dismissed)andresolved_atisnotnullandresolved_byisnotnull',
          },
        ]
        // Tier 2 (20260904-168): ledger CHECK phải chấp nhận manual_entry.
        if (!options.omitAssessmentTable) {
          rows.push({
            name: 'assessment_entries',
            sql: 'sourcein(exam_finalization,legacy_baseline,manual_entry)',
          })
        }
        return { rows }
      }

      const tableMatch = statement.match(/^PRAGMA table_info\('([^']+)'\)$/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        const rows: Array<{ name: string; pk: number }> = []
        // Auto-push PK tôn trọng cả omitPkTable lẫn omitColumn: drift cột PK
        // phải làm fail cả column gate lẫn PK gate (không tự hồi sinh).
        if (COMPOSITE_PK_TABLES.has(tableName) && options.omitPkTable !== tableName) {
          for (const [pkName, pk] of [['parish_id', 1], ['id', 2]] as const) {
            if (options.omitColumn === `${tableName}.${pkName}`) continue
            rows.push({ name: pkName, pk })
          }
        }
        for (const [index, column] of (SPECIAL_COMPOSITE_PRIMARY_KEYS[tableName] || []).entries()) {
          rows.push({ name: column, pk: index + 1 })
        }
        for (const column of REQUIRED_COLUMNS[tableName] || []) {
          if (options.omitColumn === `${tableName}.${column}`) continue
          if (!rows.some((row) => row.name === column)) rows.push({ name: column, pk: 0 })
        }
        return { rows }
      }

      if (statement === 'PRAGMA foreign_key_check') return { rows: [] }

      throw new Error(`Unexpected SQL in schema-health test: ${statement}`)
    },
  }
}

describe('database startup readiness gate', () => {
  it.each([
    'academic_years.finalization_policy',
    'academic_year_snapshots.source_class_id',
    'academic_year_snapshots.report_snapshot',
    'promotion_records.completed_at',
  ])('fails closed when cross-domain recovery evidence column %s is missing', async (column) => {
    await expect(assertDatabaseReady(createHealthyClient({ omitColumn: column })))
      .rejects.toThrow(`missing required column ${column}`)
  })

  it('requires the historical evidence migration marker even when columns exist', async () => {
    await expect(assertDatabaseReady(createHealthyClient({ omitMigration: '20260907-181' })))
      .rejects.toThrow('missing required migration marker 20260907-181')
  })

  it('accepts a fully migrated tenant-safe schema snapshot', async () => {
    await expect(assertDatabaseReady(createHealthyClient())).resolves.toBeUndefined()
  })

  it('fails closed when any historical migration marker or tenant index is missing', async () => {
    await expect(
      assertDatabaseReady(createHealthyClient({
        omitMigration: '20260815-120',
        omitIndex: 'idx_students_idempotency',
      })),
    ).rejects.toThrow(/missing required migration marker 20260815-120[\s\S]*missing required index idx_students_idempotency/)
  })

  it('fails closed when a required database integrity trigger is missing', async () => {
    await expect(
      assertDatabaseReady(createHealthyClient({ omitTrigger: 'check_grade_scores_update' })),
    ).rejects.toThrow(/missing required integrity trigger check_grade_scores_update/)
  })

  // A-NEW-62: prod từng thiếu promotion_records.is_latest → report-card 500 âm thầm.
  // Gate phải chặn STARTUP (fail fast) thay vì để runtime nổ giữa request phụ huynh.
  it('fails closed when promotion_records.is_latest column drifts away', async () => {
    await expect(
      assertDatabaseReady(createHealthyClient({ omitColumn: 'promotion_records.is_latest' })),
    ).rejects.toThrow(/missing required column promotion_records\.is_latest/)
  })

  it('fails closed when the immutable exam manifest column is missing', async () => {
    await expect(
      assertDatabaseReady(createHealthyClient({ omitColumn: 'exam_sessions.variant_manifests' })),
    ).rejects.toThrow(/missing required column exam_sessions\.variant_manifests/)
  })

  it('fails closed when grade_overrides tenant columns drift away', async () => {
    await expect(
      assertDatabaseReady(createHealthyClient({ omitColumn: 'grade_overrides.parish_id' })),
    ).rejects.toThrow(/missing required column grade_overrides\.parish_id/)
  })

  it('fails closed when the anonymous sender DB constraint drifts away', async () => {
    await expect(
      assertDatabaseReady(createHealthyClient({ omitFeedbackConstraint: 'visibility=anonymousandsender_user_idisnull' })),
    ).rejects.toThrow(/feedback_messages is missing privacy constraint visibility=anonymousandsender_user_idisnull/)
  })

  it('fails closed when the assessment ledger rejects manual_entry (Tier 2)', async () => {
    await expect(
      assertDatabaseReady(createHealthyClient({ omitAssessmentTable: true })),
    ).rejects.toThrow(/missing required table assessment_entries/)
  })

  it('fails closed when an extended composite-PK gate drifts (Phase 3)', async () => {
    await expect(
      assertDatabaseReady(createHealthyClient({ omitPkTable: 'promotion_records' })),
    ).rejects.toThrow(/must use composite primary key/)
  })
})
