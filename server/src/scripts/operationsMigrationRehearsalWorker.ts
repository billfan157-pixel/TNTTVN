import { rehearseOperationsMigrationsInWorker } from '../db/operationsMigrationRehearsal.js'

const [sourceBackupPath, workingDirectory, liveDatabasePath] = process.argv.slice(2)
if (!sourceBackupPath || !workingDirectory || !liveDatabasePath) throw new Error('Invalid Operations migration rehearsal worker arguments.')

const manifest = await rehearseOperationsMigrationsInWorker({ sourceBackupPath, workingDirectory, liveDatabasePath })
console.log(JSON.stringify(manifest))
