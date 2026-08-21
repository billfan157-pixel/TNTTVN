export interface SchemaHealthClient {
  execute(statement: string): Promise<{ rows: readonly unknown[] }>
}

const REQUIRED_MIGRATION_MARKERS = [
  '20260816-121', // username uniqueness becomes tenant-local
  '20260818-123', // exam_results.scan_metadata
  '20260818-124', // exam_sessions.answer_variants
  '20260818-125', // exam_results.exam_version
  '20260820-126', // tenant-local composite unique indexes
  '20260820-127', // tenant-local idempotency indexes
] as const

const REQUIRED_INDEX_COLUMNS: Record<string, readonly string[]> = {
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

const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  exam_results: ['scan_metadata', 'exam_version'],
  exam_sessions: ['answer_variants'],
}

const REQUIRED_TENANT_COMPOSITE_PRIMARY_KEYS = [
  'users',
  'students',
  'classes',
  'grades',
  'attendance',
  'audit_logs',
] as const

function rowValue(row: unknown, key: string, index: number): unknown {
  if (Array.isArray(row)) return row[index]
  if (row && typeof row === 'object') {
    return (row as Record<string, unknown>)[key]
  }
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
 * migrated or tenant-critical guards are absent/malformed.
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
    if (!appliedMarkers.has(marker.toLowerCase())) {
      problems.push(`missing required migration marker ${marker}`)
    }
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

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    const tableInfo = await getTableInfo(client, tableName)
    const actualColumns = new Set(tableInfo.map((column) => column.name))
    for (const column of requiredColumns) {
      if (!actualColumns.has(column)) {
        problems.push(`missing required column ${tableName}.${column}`)
      }
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
