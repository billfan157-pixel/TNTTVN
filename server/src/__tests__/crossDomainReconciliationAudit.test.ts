import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { auditCrossDomainReconciliation } from '../scripts/auditCrossDomainReconciliation.js'

async function fixture() {
  const client = createClient({ url: ':memory:' })
  for (const statement of [
    `CREATE TABLE academic_years (parish_id TEXT, id TEXT, status TEXT, finalization_policy TEXT)`,
    `CREATE TABLE academic_year_snapshots (id TEXT, parish_id TEXT, academic_year_id TEXT, source_class_id TEXT, report_snapshot TEXT)`,
    `CREATE TABLE grades (id TEXT, parish_id TEXT, student_id TEXT, academic_year TEXT, semester INTEGER, score_oral REAL, score_oral_source TEXT, score_15m REAL, score_15m_source TEXT, score_1_period REAL, score_1_period_source TEXT)`,
    `CREATE TABLE assessment_entries (parish_id TEXT, student_id TEXT, academic_year TEXT, semester INTEGER, score_type TEXT, score REAL)`,
    `CREATE TABLE grade_overrides (parish_id TEXT, grade_id TEXT, score_field TEXT, deleted_at TEXT)`,
  ]) await client.execute(statement)
  return client
}

describe('read-only cross-domain reconciliation inventory', () => {
  it('fails closed with a clear error when the target has not received evidence migrations', async () => {
    const client = createClient({ url: ':memory:' })
    try {
      await client.execute(`CREATE TABLE academic_years (parish_id TEXT, id TEXT, status TEXT)`)
      await expect(auditCrossDomainReconciliation(client)).rejects.toThrow(
        'Cross-domain reconciliation requires current schema: academic_years.finalization_policy',
      )
    } finally {
      client.close()
    }
  })

  it('reports missing historical evidence and mismatched daily projection without exposing identifiers or scores', async () => {
    const client = await fixture()
    try {
      await client.execute({
        sql: `INSERT INTO academic_years VALUES (?, ?, ?, ?)`,
        args: ['parish-sensitive', '2024-2025', 'FINALIZED', null],
      })
      await client.execute({
        sql: `INSERT INTO grades VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ['grade-sensitive', 'parish-sensitive', 'student-sensitive', '2024-2025', 1, 9, 'daily_avg', null, null, null, null],
      })
      await client.execute({
        sql: `INSERT INTO assessment_entries VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
        args: ['parish-sensitive', 'student-sensitive', '2024-2025', 1, 'oral', 6, 'parish-sensitive', 'student-sensitive', '2024-2025', 1, 'oral', 8],
      })

      const result = await auditCrossDomainReconciliation(client)
      expect(result.findings.map(finding => finding.reason)).toEqual(expect.arrayContaining([
        'missing_snapshots', 'missing_finalization_policy', 'projection_mismatch',
      ]))
      expect(JSON.stringify(result)).not.toContain('parish-sensitive')
      expect(JSON.stringify(result)).not.toContain('student-sensitive')
      expect(JSON.stringify(result)).not.toContain('grade-sensitive')
      expect(JSON.stringify(result)).not.toContain('"ledgerAverage"')
    } finally {
      client.close()
    }
  })

  it('excludes an active manual override and returns no findings for complete consistent evidence', async () => {
    const client = await fixture()
    try {
      await client.execute(`INSERT INTO academic_years VALUES ('p', '2025-2026', 'FINALIZED', '{"version":1}')`)
      await client.execute(`INSERT INTO academic_year_snapshots VALUES ('s', 'p', '2025-2026', 'class', '{"version":1}')`)
      await client.execute(`INSERT INTO grades VALUES ('g', 'p', 'student', '2025-2026', 1, 10, 'manual', NULL, NULL, NULL, NULL)`)
      await client.execute(`INSERT INTO assessment_entries VALUES ('p', 'student', '2025-2026', 1, 'oral', 7)`)
      await client.execute(`INSERT INTO grade_overrides VALUES ('p', 'g', 'scoreOral', NULL)`)

      const result = await auditCrossDomainReconciliation(client)
      expect(result).toMatchObject({ findingCount: 0, requiresOperatorReview: false })
    } finally {
      client.close()
    }
  })
})
