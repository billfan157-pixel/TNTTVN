import { DurableObject } from 'cloudflare:workers'
import { client } from '../db/connection.ts'
import { withBlobBucket } from '../services/blobStorage.ts'
import { createAndStoreRemoteBackup } from '../services/remoteBackup.ts'

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
}
