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
  idx_financial_transactions_receipt_unique: ['parish_id', 'receipt_number'],
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
  'users', 'students', 'classes', 'grades', 'attendance', 'audit_logs',
  'funds', 'financial_transactions', 'student_fee_records',
  'assessment_entries', 'exam_finalizations', 'exam_finalization_items', 'leave_requests',
  'exam_sessions', 'exam_results', 'attendance_sessions', 'academic_year_snapshots',
  'promotion_records', 'catechist_assignments', 'notifications', 'service_assignments',
  'import_batches', 'import_batch_students', 'mapping_memory', 'notices', 'outbox_messages',
  'semester_locks', 'assessments', 'academic_years', 'branches', 'permissions',
  'refresh_tokens', 'push_subscriptions', 'telegram_link_tokens', 'telegram_links',
])

const REQUIRED_COLUMNS: Record<string, string[]> = {
  import_batches: ['content_hash', 'classes_created'],
  grades: ['score_dao_duc_source', 'score_dao_duc_updated_at'],
  notifications: ['target_user_ids'],
  users: ['password_encrypted', 'holy_name'],
  exam_results: ['parish_id', 'scan_metadata', 'exam_version'],
  exam_sessions: ['idempotency_key', 'questions', 'answer_variants'],
  assessment_entries: ['parish_id', 'student_id', 'exam_session_id', 'source'],
  exam_finalizations: ['parish_id', 'exam_session_id'],
  exam_finalization_items: ['parish_id', 'finalization_id', 'student_id'],
  leave_requests: ['parish_id', 'student_id', 'class_id', 'status'],
  financial_transactions: ['parish_id', 'fund_id', 'student_id', 'class_id'],
  student_fee_records: ['parish_id', 'student_id', 'class_id', 'transaction_id'],
}

function createHealthyClient(
  options: { omitMigration?: string; omitIndex?: string; omitTrigger?: string } = {},
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
        for (const column of REQUIRED_COLUMNS[tableName] || []) {
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
})