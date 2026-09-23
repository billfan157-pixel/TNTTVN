import type { Client } from '@libsql/client'

// Defensive schema sync for historical SQLite deployments. These are intentionally
// duplicate-safe compatibility repairs; the readiness gate validates the resulting
// required columns before the server is allowed to accept traffic.
export const DEFENSIVE_ALTERS = [
  `ALTER TABLE import_batches ADD COLUMN classes_created TEXT DEFAULT '[]'`,
  `ALTER TABLE import_batches ADD COLUMN content_hash TEXT`,
  `ALTER TABLE import_batches ADD COLUMN created_class_ids TEXT DEFAULT '[]'`,
  `ALTER TABLE import_batch_students ADD COLUMN rollback_snapshot TEXT`,
  `ALTER TABLE exam_results ADD COLUMN essay_score REAL`,
  `ALTER TABLE notices ADD COLUMN target_audience TEXT NOT NULL DEFAULT 'all'`,
  `ALTER TABLE notices ADD COLUMN deleted_at TEXT`,
  `ALTER TABLE notifications ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE notifications ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE notifications ADD COLUMN lease_owner TEXT`,
  `ALTER TABLE notifications ADD COLUMN lease_expires_at TEXT`,
  `ALTER TABLE notifications ADD COLUMN next_attempt_at TEXT`,
  `ALTER TABLE notifications ADD COLUMN delivery_kind TEXT`,
  `ALTER TABLE notices ADD COLUMN parent_revoked_at TEXT`,
  `ALTER TABLE exam_sessions ADD COLUMN variant_manifests TEXT`,
  `ALTER TABLE exam_sessions ADD COLUMN source_type TEXT NOT NULL DEFAULT 'legacy'`,
  `ALTER TABLE exam_sessions ADD COLUMN blueprint_id TEXT`,
  `ALTER TABLE exam_sessions ADD COLUMN blueprint_snapshot TEXT`,
]

export async function applyDefensiveSync(client: Client): Promise<void> {
  // Legacy compatibility ALTERs are normally all present. Check their columns
  // in one remote query instead of issuing 18 expected duplicate-column errors
  // on every cold start. Missing columns still use the original ALTER path.
  const columns = await client.execute(`
    SELECT m.name AS table_name, p.name AS column_name
    FROM sqlite_master AS m JOIN pragma_table_info(m.name) AS p
    WHERE m.type = 'table'
  `)
  const present = new Set(columns.rows.map(row => {
    const values = row as Record<string, unknown>
    return `${String(values.table_name).toLowerCase()}.${String(values.column_name).toLowerCase()}`
  }))
  for (const statement of DEFENSIVE_ALTERS) {
    const match = statement.match(/^ALTER\s+TABLE\s+([A-Za-z0-9_]+)\s+ADD\s+COLUMN\s+([A-Za-z0-9_]+)/i)
    if (match && present.has(`${match[1].toLowerCase()}.${match[2].toLowerCase()}`)) continue
    try { await client.execute(statement) } catch {}
  }
}
