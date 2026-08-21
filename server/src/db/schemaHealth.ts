import { REQUIRED_TENANT_COMPOSITE_PRIMARY_KEYS } from './dataLifecycle.js'

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
] as const

const REQUIRED_INDEX_COLUMNS: Record<string, readonly string[]> = {
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
}

const REQUIRED_TRIGGER_NAMES = [
  'check_grade_scores_insert',
  'check_grade_scores_update',
  'check_outbox_messages_status_insert',
  'check_outbox_messages_status_update',
  'check_grade_overrides_field_insert',
  'check_grade_overrides_field_update',
] as const

const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
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
    .replace(/["'`\[\]\s]/g, '')
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function getTableInfo(client: SchemaHealthClient, tableName: string) {
  const result = await client.execute(`PRAGMA table_info(${quoteSqlLiteral(tableName)})`)
  return result.rows.map((row) => ({
    name: normalizeIdentifier(rowValue(row, 'name', 1)),
    pk: Number(rowValue(row, 'pk', 5) ?? 0),
  }))
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

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const tableInfo = await getTableInfo(client, tableName)
    const actualColumns = new Set(tableInfo.map((column) => column.name))
    for (const column of requiredColumns) {
      if (!actualColumns.has(column)) problems.push(`missing required column ${tableName}.${column}`)
    }
  }

  for (const tableName of REQUIRED_TENANT_COMPOSITE_PRIMARY_KEYS) {
    const tableInfo = await getTableInfo(client, tableName)
    const parishPk = tableInfo.find((column) => column.name === 'parish_id')?.pk ?? 0
    const idPk = tableInfo.find((column) => column.name === 'id')?.pk ?? 0
    if (parishPk !== 1 || idPk !== 2) {
      problems.push(
        `table ${tableName} must use composite primary key (parish_id, id); got pk ordinals parish_id=${parishPk}, id=${idPk}`,
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
