import { client } from './connection.js'
import { applyBootstrapSchema } from './bootstrapSchema.js'
import { MIGRATIONS } from './migrations.js'
import { applyMigrations } from './migrationRunner.js'
import { applyDefensiveSync } from './defensiveSync.js'
import { applyIndices } from './bootstrapIndices.js'

// Phase 3 (db split): file này chỉ còn orchestrate thứ tự khởi động —
// logic đã tách verbatim sang connection/bootstrapSchema/migrations/
// defensiveSync/bootstrapIndices/database/transactions. THỨ TỰ BẮT BUỘC
// (xem research trong module tương ứng):
// bootstrap DDL → migrations → defensive sync → indices → drizzle init.
// Mọi importer cũ (`db`, `client`, `dbConfig`, `runDbTransaction`, types)
// giữ nguyên path qua re-export dưới.
await applyBootstrapSchema(client)

// Root-cause remediation: migration execution itself now fails closed. The separate
// executable-schema readiness gate remains as defense in depth before HTTP bind.
await applyMigrations(client, MIGRATIONS)
await applyDefensiveSync(client)
await applyIndices(client)

export { client, dbConfig } from './connection.js'
export { db } from './database.js'
export { runDbTransaction, MAX_TX_BUSY_RETRY } from './transactions.js'
export type { DbTransaction, DbExecutor } from './transactions.js'
