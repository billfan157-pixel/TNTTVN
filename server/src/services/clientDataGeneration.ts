import { and, eq } from 'drizzle-orm'
import type { DbExecutor } from '../db/index.js'
import { systemSettings } from '../db/schema.js'

// Keep the legacy persisted key for compatibility with existing clients.
export const PURGE_VERSION_KEY = 'purge_version'
export const DEFAULT_PURGE_VERSION = 1

/**
 * Advance the durable client-data generation after a destructive parish data
 * replacement. The caller owns the surrounding transaction so the generation
 * change commits atomically with the purge or restore it protects.
 */
export async function advanceClientResetVersion(
  executor: DbExecutor,
  parishId: string,
  userId: string,
): Promise<number> {
  const [existing] = await executor.select().from(systemSettings)
    .where(and(eq(systemSettings.key, PURGE_VERSION_KEY), eq(systemSettings.parishId, parishId)))
    .limit(1)
  const currentVersion = existing?.value
    ? Number(existing.value)
    : DEFAULT_PURGE_VERSION
  const nextVersion = Number.isFinite(currentVersion) && currentVersion >= DEFAULT_PURGE_VERSION
    ? currentVersion + 1
    : DEFAULT_PURGE_VERSION + 1
  const now = new Date().toISOString()

  await executor.insert(systemSettings)
    .values({
      key: PURGE_VERSION_KEY,
      value: String(nextVersion),
      description: 'Client data generation — tăng sau purge hoặc partial JSON restore',
      updatedBy: userId,
      updatedAt: now,
      parishId,
    })
    .onConflictDoUpdate({
      target: [systemSettings.key, systemSettings.parishId],
      set: {
        value: String(nextVersion),
        description: 'Client data generation — tăng sau purge hoặc partial JSON restore',
        updatedBy: userId,
        updatedAt: now,
        parishId,
      },
    })

  return nextVersion
}
