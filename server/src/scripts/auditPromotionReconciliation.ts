import { createHash } from 'node:crypto'
import { createClient } from '@libsql/client'
import { getDbConfig } from '../db/dbConfig.js'

interface InventoryRow {
  parish_id: unknown
  academic_year_id: unknown
  status: unknown
  target_year_id: unknown
  snapshot_count: unknown
  unresolved_count: unknown
}

const configured = getDbConfig()
const auditUrl = process.env.AUDIT_DATABASE_URL
const url = auditUrl || configured.url
// Never forward the default database credential to an explicitly different
// audit endpoint. A local file audit may intentionally omit a token.
const authToken = auditUrl ? process.env.AUDIT_DATABASE_AUTH_TOKEN : configured.authToken
const includeParishId = process.env.PROMOTION_INVENTORY_INCLUDE_PARISH_ID === 'true'
const client = createClient(authToken ? { url, authToken } : { url })

function parishReference(parishId: string): string {
  if (includeParishId) return parishId
  return `sha256:${createHash('sha256').update(parishId).digest('hex').slice(0, 12)}`
}

try {
  const columns = await client.execute("PRAGMA table_info('academic_years')")
  const hasTarget = columns.rows.some((row) => String(row.name ?? row[1]) === 'promotion_target_year_id')
  if (!hasTarget) throw new Error('promotion_target_year_id is missing; deploy migration 20260904-169 before inventory')

  const tx = await client.transaction('read')
  try {
    const result = await tx.execute(`
      SELECT
        ay.parish_id,
        ay.id AS academic_year_id,
        ay.status,
        ay.promotion_target_year_id AS target_year_id,
        COUNT(s.student_id) AS snapshot_count,
        SUM(CASE
          WHEN s.student_id IS NULL THEN 0
          WHEN pr.id IS NULL THEN 1
          ELSE 0
        END) AS unresolved_count
      FROM academic_years ay
      LEFT JOIN academic_year_snapshots s
        ON s.parish_id = ay.parish_id
       AND s.academic_year_id = ay.id
      LEFT JOIN promotion_records pr
        ON pr.parish_id = s.parish_id
       AND pr.student_id = s.student_id
       AND pr.academic_year = s.academic_year_id
       AND pr.status = 'ACTIVE'
       AND pr.is_latest = 1
      WHERE ay.status IN ('PROMOTED', 'ARCHIVED')
      GROUP BY ay.parish_id, ay.id, ay.status, ay.promotion_target_year_id
      ORDER BY ay.parish_id, ay.start_date
    `)
    await tx.commit()

    const findings = (result.rows as unknown as InventoryRow[])
      .map((row) => {
        const targetYearId = row.target_year_id == null ? null : String(row.target_year_id)
        const unresolvedCount = Number(row.unresolved_count ?? 0)
        const status = String(row.status)
        const classification = status === 'ARCHIVED' && unresolvedCount > 0
          ? 'archived_incomplete'
          : targetYearId == null
            ? 'legacy_unbound'
            : unresolvedCount > 0
              ? 'retryable_backlog'
              : 'resolved'
        return {
          parishRef: parishReference(String(row.parish_id)),
          academicYearId: String(row.academic_year_id),
          status,
          targetYearId,
          snapshotCount: Number(row.snapshot_count ?? 0),
          unresolvedCount,
          classification,
        }
      })
      .filter((row) => row.classification !== 'resolved')

    console.log(JSON.stringify({
      status: 'read_only_inventory_complete',
      targetFingerprint: createHash('sha256').update(url).digest('hex').slice(0, 16),
      parishIdentifiers: includeParishId ? 'plain_explicit_opt_in' : 'sha256_truncated',
      findingCount: findings.length,
      requiresOperatorReview: findings.some((row) => row.classification === 'legacy_unbound' || row.classification === 'archived_incomplete'),
      findings,
    }, null, 2))
  } catch (error) {
    try { await tx.rollback() } catch { /* read transaction may already be closed */ }
    throw error
  }
} finally {
  client.close()
}
