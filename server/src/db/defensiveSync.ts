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
  for (const statement of DEFENSIVE_ALTERS) {
    try { await client.execute(statement) } catch {}
  }
}
