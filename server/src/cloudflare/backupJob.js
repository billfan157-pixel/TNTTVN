import { DurableObject } from 'cloudflare:workers'
import { client } from '../db/connection.ts'
import { getObject, withBlobBucket } from '../services/blobStorage.ts'
import { createAndStoreRemoteBackup, decryptLogicalSnapshot, readAndVerifyRemoteBackupSet } from '../services/remoteBackup.ts'

// Backup work has a separate invocation budget from the front HTTP Worker.
// Keep one coordinator per deployment; the database remains the sole data writer.
export class BackupJob extends DurableObject {
  running = false

  async createBackup() {
    if (this.running) throw new Error('Backup is already running')
    this.running = true
    try {
      return await withBlobBucket(this.env.BLOB_BUCKET, () => createAndStoreRemoteBackup(client))
    } finally {
      this.running = false
    }
  }

  async verifyBackup(objectKey) {
    if (typeof objectKey !== 'string') throw new Error('Invalid backup object key')
    const isSetManifest = /^backups\/v2\/[^/]+\/manifest\.json$/.test(objectKey)
    const isLegacy = /^backups\/turso-[A-Za-z0-9-]+\.json\.gz\.enc$/.test(objectKey)
    if (!isSetManifest && !isLegacy) throw new Error('Invalid backup object key')
    return withBlobBucket(this.env.BLOB_BUCKET, async () => {
      if (isSetManifest) {
        const contents = await readAndVerifyRemoteBackupSet(objectKey)
        return {
          objectKey,
          format: contents.manifest.format,
          encryptedBytes: contents.encryptedDatabaseBytes,
          manifestBytes: contents.manifestBytes,
          rowCount: contents.snapshot.rowCount,
          tableCount: contents.snapshot.tables.length,
          archiveObjectCount: contents.manifest.archive.count,
          checksum: contents.manifest.checksum,
        }
      }
      const encrypted = await getObject(objectKey)
      if (!encrypted) throw new Error('Backup object not found')
      const snapshot = decryptLogicalSnapshot(encrypted)
      return { objectKey, encryptedBytes: encrypted.byteLength, rowCount: snapshot.rowCount,
        tableCount: snapshot.tables.length, checksum: snapshot.checksum }
    })
  }
}
