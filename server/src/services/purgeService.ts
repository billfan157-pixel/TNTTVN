import { createHash } from 'crypto'
import { sql, and, eq } from 'drizzle-orm'
import { db, client } from '../db/index.js'
import { auditLogs, systemSettings } from '../db/schema.js'
import { PURGE_DELETE_ORDER, PURGE_TABLES, type PurgeTableName } from '../db/dataLifecycle.js'
import { generateId } from '../utils/id.js'
import { writeSafetySnapshot, pruneSafetySnapshots } from './safetySnapshot.js'

export const PURGE_CONFIRM_KEY = 'XÓA TẤT CẢ'

export const PURGE_VERSION_KEY = 'purge_version'
export const DEFAULT_PURGE_VERSION = 1

export { PURGE_TABLES }

function computeChecksum(dataObj: any): string {
  return createHash('sha256').update(JSON.stringify(dataObj)).digest('hex')
}

interface PurgeSnapshotOptions {
  parishId: string
  userId: string
}

/**
 * PURGE v3 — Xóa toàn bộ dữ liệu vận hành của giáo xứ theo data-lifecycle
 * registry trong 1 transaction. Giữ nguyên identity/reference/security state:
 * users, branches, permissions, rolePermissions, auditLogs, pushSubscriptions,
 * systemSettings và Telegram account links.
 *
 * D3 invariant: every table that this operation deletes directly is included in
 * the pre-purge safety snapshot. New business tables must be classified in
 * dataLifecycle.ts instead of being silently omitted from a local hard-coded list.
 */
export async function purgeParishData(
  options: PurgeSnapshotOptions,
): Promise<{ countsBefore: Record<string, number>; purgeVersion: number }> {
  const { parishId, userId } = options

  const countsBefore: Record<string, number> = {}
  const snapshotData: Record<string, any[]> = {}

  // 1. Snapshot every destructive target before touching production rows.
  for (const name of PURGE_DELETE_ORDER) {
    const rows = (await client.execute(
      `SELECT * FROM ${name} WHERE parish_id = ?`,
      [parishId],
    )).rows as any[]
    snapshotData[name] = rows
    countsBefore[name] = rows.length
  }

  const snapshotPayload = {
    type: 'PURGE_SAFETY_SNAPSHOT',
    version: '4.0',
    parishId,
    exportedBy: userId,
    exportedAt: new Date().toISOString(),
    checksum: computeChecksum(snapshotData),
    counts: countsBefore,
    data: snapshotData,
  }

  await writeSafetySnapshot('purge-safety', parishId, snapshotPayload)
  await pruneSafetySnapshots(5)

  // 2. Purge child-before-parent in one transaction. defer_foreign_keys remains
  // defense in depth; the explicit order also satisfies immediate RESTRICT rules.
  const nextVersion = await db.transaction(async (tx) => {
    try {
      await tx.run(sql`PRAGMA defer_foreign_keys = ON`)
    } catch { /* explicit child-before-parent order is sufficient */ }

    for (const name of PURGE_DELETE_ORDER) {
      await tx.run(sql`DELETE FROM ${sql.raw(name)} WHERE parish_id = ${parishId}`)
    }

    for (const name of PURGE_DELETE_ORDER) {
      const countRow = await tx.get<{ n: number }>(sql`SELECT count(*) AS n FROM ${sql.raw(name)} WHERE parish_id = ${parishId}`)
      if (Number(countRow?.n ?? 0) !== 0) {
        throw new Error(`PURGE_VERIFY_FAILED: bảng ${name} còn ${countRow?.n} row sau purge`)
      }
    }

    const [existing] = await tx.select().from(systemSettings)
      .where(and(eq(systemSettings.key, PURGE_VERSION_KEY), eq(systemSettings.parishId, parishId)))
      .limit(1)
    const currentVersion = existing && existing.value
      ? Number(existing.value)
      : DEFAULT_PURGE_VERSION
    const nextVersion = currentVersion + 1

    const now = new Date().toISOString()
    await tx.insert(systemSettings)
      .values({
        key: PURGE_VERSION_KEY,
        value: String(nextVersion),
        description: 'Purge version marker — tăng khi xóa toàn bộ dữ liệu giáo xứ',
        updatedBy: userId,
        updatedAt: now,
        parishId,
      })
      .onConflictDoUpdate({
        target: [systemSettings.key, systemSettings.parishId],
        set: {
          value: String(nextVersion),
          updatedBy: userId,
          updatedAt: now,
          parishId,
        },
      })

    await tx.insert(auditLogs).values({
      id: generateId('AUD'),
      userId,
      action: 'SYSTEM_PURGE',
      entityType: 'system',
      entityId: 'purge',
      oldValue: JSON.stringify(countsBefore),
      newValue: JSON.stringify({ purgeVersion: nextVersion, lifecycleTables: PURGE_TABLES.length }),
      parishId,
      createdAt: now,
    })

    return nextVersion
  })

  return { countsBefore, purgeVersion: nextVersion }
}

export type { PurgeTableName }
