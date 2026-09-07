import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createClient, type Client, type Row } from '@libsql/client'
import { getDbConfig } from '../db/dbConfig.js'

type FindingReason =
  | 'missing_snapshots'
  | 'missing_finalization_policy'
  | 'incomplete_snapshot_evidence'
  | 'projection_without_ledger'
  | 'ledger_without_grade'
  | 'ledger_not_projected'
  | 'projection_mismatch'

export interface CrossDomainReconciliationFinding {
  parishRef: string
  aggregateRef: string
  category: 'historical_academic_evidence' | 'daily_grade_projection'
  reason: FindingReason
  field?: 'scoreOral' | 'score15m' | 'score1Period'
  ledgerEntryCount?: number
}

export interface CrossDomainReconciliationResult {
  status: 'read_only_cross_domain_reconciliation_complete'
  parishIdentifiers: 'sha256_truncated' | 'plain_explicit_opt_in'
  findingCount: number
  requiresOperatorReview: boolean
  findings: CrossDomainReconciliationFinding[]
}

const hashRef = (kind: string, value: unknown): string =>
  `sha256:${createHash('sha256').update(`${kind}:${String(value ?? '')}`).digest('hex').slice(0, 12)}`

const numberValue = (value: unknown): number => Number(value ?? 0)

export async function auditCrossDomainReconciliation(
  client: Client,
  includeParishId = false,
): Promise<CrossDomainReconciliationResult> {
  const requiredColumns = new Map<string, string[]>([
    ['academic_years', ['parish_id', 'id', 'status', 'finalization_policy']],
    ['academic_year_snapshots', ['id', 'parish_id', 'academic_year_id', 'source_class_id', 'report_snapshot']],
    ['grades', ['id', 'parish_id', 'student_id', 'academic_year', 'semester', 'score_oral', 'score_oral_source', 'score_15m', 'score_15m_source', 'score_1_period', 'score_1_period_source']],
    ['assessment_entries', ['parish_id', 'student_id', 'academic_year', 'semester', 'score_type', 'score']],
    ['grade_overrides', ['parish_id', 'grade_id', 'score_field', 'deleted_at']],
  ])
  for (const [table, expected] of requiredColumns) {
    const columns = await client.execute(`PRAGMA table_info('${table}')`)
    const actual = new Set(columns.rows.map(row => String(row.name ?? row[1])))
    const missing = expected.filter(column => !actual.has(column))
    if (missing.length > 0) {
      throw new Error(`Cross-domain reconciliation requires current schema: ${table}.${missing.join(`, ${table}.`)}`)
    }
  }

  const parishRef = (value: unknown): string => includeParishId
    ? String(value)
    : hashRef('parish', value)
  const findings: CrossDomainReconciliationFinding[] = []
  const tx = await client.transaction('read')
  try {
    const historical = await tx.execute(`
      SELECT ay.parish_id, ay.id AS academic_year_id, ay.finalization_policy,
             COUNT(s.id) AS snapshot_count,
             SUM(CASE WHEN s.id IS NOT NULL AND (
               s.source_class_id IS NULL OR TRIM(s.source_class_id) = ''
               OR s.report_snapshot IS NULL OR TRIM(s.report_snapshot) = ''
             ) THEN 1 ELSE 0 END) AS incomplete_snapshot_count
      FROM academic_years ay
      LEFT JOIN academic_year_snapshots s
        ON s.parish_id = ay.parish_id AND s.academic_year_id = ay.id
      WHERE ay.status IN ('FINALIZED', 'PROMOTED', 'ARCHIVED')
      GROUP BY ay.parish_id, ay.id, ay.finalization_policy
      ORDER BY ay.parish_id, ay.id
    `)
    for (const row of historical.rows as Row[]) {
      const base = {
        parishRef: parishRef(row.parish_id),
        aggregateRef: hashRef('academic-year', `${row.parish_id}:${row.academic_year_id}`),
        category: 'historical_academic_evidence' as const,
      }
      if (numberValue(row.snapshot_count) === 0) findings.push({ ...base, reason: 'missing_snapshots' })
      if (!String(row.finalization_policy ?? '').trim()) findings.push({ ...base, reason: 'missing_finalization_policy' })
      if (numberValue(row.incomplete_snapshot_count) > 0) findings.push({ ...base, reason: 'incomplete_snapshot_evidence' })
    }

    const fields = [
      { column: 'score_oral', source: 'score_oral_source', scoreType: 'oral', field: 'scoreOral' },
      { column: 'score_15m', source: 'score_15m_source', scoreType: '15m', field: 'score15m' },
      { column: 'score_1_period', source: 'score_1_period_source', scoreType: '1period', field: 'score1Period' },
    ] as const

    for (const field of fields) {
      const result = await tx.execute(`
        WITH ledger AS (
          SELECT parish_id, student_id, academic_year, semester,
                 COUNT(*) AS entry_count, ROUND(AVG(score), 1) AS ledger_average
          FROM assessment_entries
          WHERE score_type = '${field.scoreType}'
          GROUP BY parish_id, student_id, academic_year, semester
        )
        SELECT g.parish_id, g.student_id, g.academic_year, g.semester,
               g.id AS grade_id, g.${field.source} AS projection_source,
               l.entry_count, l.ledger_average,
               CASE
                 WHEN l.entry_count IS NULL THEN 'projection_without_ledger'
                 WHEN g.${field.source} <> 'daily_avg' THEN 'ledger_not_projected'
                 ELSE 'projection_mismatch'
               END AS reason
        FROM grades g
        LEFT JOIN ledger l
          ON l.parish_id = g.parish_id AND l.student_id = g.student_id
         AND l.academic_year = g.academic_year AND l.semester = g.semester
        WHERE NOT EXISTS (
          SELECT 1 FROM grade_overrides go
          WHERE go.parish_id = g.parish_id AND go.grade_id = g.id
            AND go.score_field = '${field.field}' AND go.deleted_at IS NULL
        )
          AND (
            (g.${field.source} = 'daily_avg' AND l.entry_count IS NULL)
            OR (l.entry_count IS NOT NULL
              AND COALESCE(g.${field.source}, '') <> 'manual'
              AND (g.${field.source} <> 'daily_avg' OR g.${field.source} IS NULL
                OR g.${field.column} IS NULL
                OR ABS(g.${field.column} - l.ledger_average) > 0.000001))
          )
        UNION ALL
        SELECT l.parish_id, l.student_id, l.academic_year, l.semester,
               NULL AS grade_id, NULL AS projection_source,
               l.entry_count, l.ledger_average, 'ledger_without_grade' AS reason
        FROM ledger l
        LEFT JOIN grades g
          ON g.parish_id = l.parish_id AND g.student_id = l.student_id
         AND g.academic_year = l.academic_year AND g.semester = l.semester
        WHERE g.id IS NULL
      `)
      for (const row of result.rows as Row[]) {
        findings.push({
          parishRef: parishRef(row.parish_id),
          aggregateRef: hashRef('grade-projection', `${row.parish_id}:${row.student_id}:${row.academic_year}:${row.semester}`),
          category: 'daily_grade_projection',
          reason: String(row.reason) as FindingReason,
          field: field.field,
          ledgerEntryCount: numberValue(row.entry_count),
        })
      }
    }
    await tx.commit()
  } catch (error) {
    try { await tx.rollback() } catch { /* read transaction may already be closed */ }
    throw error
  }

  return {
    status: 'read_only_cross_domain_reconciliation_complete',
    parishIdentifiers: includeParishId ? 'plain_explicit_opt_in' : 'sha256_truncated',
    findingCount: findings.length,
    requiresOperatorReview: findings.length > 0,
    findings,
  }
}

async function main(): Promise<void> {
  const configured = getDbConfig()
  const auditUrl = process.env.AUDIT_DATABASE_URL
  const url = auditUrl || configured.url
  const authToken = auditUrl ? process.env.AUDIT_DATABASE_AUTH_TOKEN : configured.authToken
  const client = createClient(authToken ? { url, authToken } : { url })
  try {
    const result = await auditCrossDomainReconciliation(
      client,
      process.env.CROSS_DOMAIN_INVENTORY_INCLUDE_PARISH_ID === 'true',
    )
    console.log(JSON.stringify({
      ...result,
      targetFingerprint: createHash('sha256').update(url).digest('hex').slice(0, 16),
    }, null, 2))
  } finally {
    client.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
