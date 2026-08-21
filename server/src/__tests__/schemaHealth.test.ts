import { describe, expect, it } from 'vitest'
import { assertDatabaseReady, type SchemaHealthClient } from '../db/schemaHealth.js'

const MIGRATIONS = [
  '20260816-121',
  '20260818-123',
  '20260818-124',
  '20260818-125',
  '20260820-126',
  '20260820-127',
]

const INDEXES: Record<string, string[]> = {
  idx_users_username_parish: ['parish_id', 'username'],
  idx_attendance_unique: ['parish_id', 'student_id', 'date', 'type'],
  idx_grades_lookup: ['parish_id', 'student_id', 'academic_year', 'semester'],
  idx_classes_code_year: ['parish_id', 'code', 'academic_year_id'],
  idx_catechist_assignments_unique: ['parish_id', 'user_id', 'class_id'],
  idx_role_permissions_pk: ['parish_id', 'role', 'permission_id'],
  idx_service_assignments_unique: ['parish_id', 'student_id', 'service_type'],
  idx_exam_results_unique: ['parish_id', 'exam_session_id', 'student_id'],
  idx_students_idempotency: ['parish_id', 'idempotency_key'],
  idx_notices_idempotency: ['parish_id', 'idempotency_key'],
  idx_classes_idempotency: ['parish_id', 'idempotency_key'],
  idx_exam_sessions_idempotency: ['parish_id', 'idempotency_key'],
}

const COMPOSITE_PK_TABLES = new Set(['users', 'students', 'classes', 'grades', 'attendance', 'audit_logs'])

function createHealthyClient(options: { omitMigration?: string; omitIndex?: string } = {}): SchemaHealthClient {
  return {
    async execute(statement: string) {
      if (statement.startsWith('SELECT version FROM schema_migrations')) {
        return {
          rows: MIGRATIONS
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

      const tableMatch = statement.match(/^PRAGMA table_info\('([^']+)'\)$/)
      if (tableMatch) {
        const tableName = tableMatch[1]
        const rows: Array<{ name: string; pk: number }> = []
        if (COMPOSITE_PK_TABLES.has(tableName)) {
          rows.push({ name: 'parish_id', pk: 1 }, { name: 'id', pk: 2 })
        }
        if (tableName === 'exam_results') {
          rows.push({ name: 'scan_metadata', pk: 0 }, { name: 'exam_version', pk: 0 })
        }
        if (tableName === 'exam_sessions') {
          rows.push({ name: 'answer_variants', pk: 0 })
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

  it('fails closed when the latest tenant migration or index is missing', async () => {
    await expect(
      assertDatabaseReady(createHealthyClient({
        omitMigration: '20260820-127',
        omitIndex: 'idx_students_idempotency',
      })),
    ).rejects.toThrow(/missing required migration marker 20260820-127[\s\S]*missing required index idx_students_idempotency/)
  })
})
