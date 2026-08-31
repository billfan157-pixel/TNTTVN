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
  idx_role_permissions_pk: ['parish_id', 'role', 'permission_id'],
  idx_service_assignments_unique: ['parish_id', 'student_id', 'service_type'],
  idx_exam_results_unique: ['parish_id', 'exam_session_id', 'student_id'],
  idx_attendance_sessions_unique: ['parish_id', 'class_id', 'date', 'type'],
  idx_students_idempotency: ['parish_id', 'idempotency_key'],
  idx_notices_idempotency: ['parish_id', 'idempotency_key'],
  idx_classes_idempotency: ['parish_id', 'idempotency_key'],
  idx_exam_sessions_idempotency: ['parish_id', 'idempotency_key'],
  idx_exam_result_mutations_session: ['parish_id', 'exam_session_id', 'created_at'],
  idx_parish_people_name: ['parish_id', 'full_name'],
  idx_parish_people_linked_user: ['parish_id', 'linked_user_id'],
  idx_parish_units_parent: ['parish_id', 'parent_id', 'sort_order'],
  idx_parish_terms_person: ['parish_id', 'person_id', 'start_date'],
  idx_parish_records_timeline: ['parish_id', 'status', 'show_on_timeline', 'occurred_on'],
  idx_parish_assets_type: ['parish_id', 'asset_type', 'captured_on'],
}

const TRIGGERS = [
  'check_grade_scores_insert',
  'check_grade_scores_update',
  'check_outbox_messages_status_insert',
  'check_outbox_messages_status_update',
  'check_grade_overrides_field_insert',
  'check_grade_overrides_field_update',
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
])

const SPECIAL_COMPOSITE_PRIMARY_KEYS: Record<string, string[]> = {
  exam_result_mutations: ['parish_id', 'user_id', 'client_mutation_id'],
  parish_record_people: ['parish_id', 'record_id', 'person_id'],
  parish_record_assets: ['parish_id', 'record_id', 'asset_id'],
}

const REQUIRED_COLUMNS: Record<string, string[]> = {
  import_batches: ['content_hash', 'classes_created', 'created_class_ids'],
  import_batch_students: ['rollback_snapshot'],
  grades: ['score_dao_duc_source', 'score_dao_duc_updated_at'],
  notifications: ['target_user_ids'],
  users: ['password_encrypted', 'holy_name'],
  exam_results: ['parish_id', 'scan_metadata', 'exam_version'],
  exam_sessions: ['idempotency_key', 'questions', 'answer_variants'],
  exam_result_mutations: ['client_mutation_id', 'parish_id', 'user_id', 'exam_session_id', 'student_id', 'request_hash', 'response_json'],
  promotion_records: ['is_latest', 'is_overridden', 'final_decision', 'status'],
  grade_overrides: ['parish_id', 'deleted_at', 'score_field', 'manual_value'],
  parish_profiles: ['parish_id', 'display_name', 'founded_date'],
  parish_people: ['parish_id', 'id', 'visibility', 'deleted_at'],
  parish_organization_units: ['parish_id', 'id', 'parent_id', 'deleted_at'],
  parish_service_terms: ['parish_id', 'id', 'person_id', 'unit_id', 'deleted_at'],
  parish_records: ['parish_id', 'id', 'status', 'visibility', 'show_on_timeline', 'deleted_at'],
  parish_archive_assets: ['parish_id', 'id', 'storage_type', 'object_key', 'external_url', 'deleted_at'],
}

function createHealthyClient(
  options: { omitMigration?: string; omitIndex?: string; omitTrigger?: string; omitColumn?: string } = {},
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

      const tableMatch = statement.match(/^PRAGMA table_info\('([^']+)'\)$/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        const rows: Array<{ name: string; pk: number }> = []
        if (COMPOSITE_PK_TABLES.has(tableName)) {
          rows.push({ name: 'parish_id', pk: 1 }, { name: 'id', pk: 2 })
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

  it('fails closed when grade_overrides tenant columns drift away', async () => {
    await expect(
      assertDatabaseReady(createHealthyClient({ omitColumn: 'grade_overrides.parish_id' })),
    ).rejects.toThrow(/missing required column grade_overrides\.parish_id/)
  })
})
