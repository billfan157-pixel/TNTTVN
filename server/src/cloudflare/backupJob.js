import { DurableObject } from 'cloudflare:workers'
import { client } from '../db/connection.ts'
import { getObject, withBlobBucket } from '../services/blobStorage.ts'
import { createAndStoreRemoteBackup, decryptLogicalSnapshot } from '../services/remoteBackup.ts'

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
    if (typeof objectKey !== 'string' || !/^backups\/turso-[A-Za-z0-9-]+\.json\.gz\.enc$/.test(objectKey)) {
      throw new Error('Invalid backup object key')
    }
    return withBlobBucket(this.env.BLOB_BUCKET, async () => {
      const encrypted = await getObject(objectKey)
      if (!encrypted) throw new Error('Backup object not found')
      const snapshot = decryptLogicalSnapshot(encrypted)
      return { objectKey, encryptedBytes: encrypted.byteLength, rowCount: snapshot.rowCount,
        tableCount: snapshot.tables.length, checksum: snapshot.checksum }
    })
  }
}
