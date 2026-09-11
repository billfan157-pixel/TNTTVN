import { resolve } from 'node:path'
import { rehearseOperationsMigrations } from '../db/operationsMigrationRehearsal.js'

const sourceBackupPath = process.argv[2]
if (!sourceBackupPath) {
  throw new Error('Usage: npm --prefix server run db:audit:operations-migration -- <finalized-backup.sqlite>')
}

const manifest = await rehearseOperationsMigrations({ sourceBackupPath: resolve(sourceBackupPath) })
console.log(JSON.stringify(manifest, null, 2))
