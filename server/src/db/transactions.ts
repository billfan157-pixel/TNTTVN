import { LibsqlError } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { db } from './database.js'
import { dbConfig } from './connection.js'

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type DbExecutor = DbTransaction | typeof db

export const MAX_TX_BUSY_RETRY = 8

export async function runDbTransaction<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        // DEPLOY-MIGRATE (ADR-056): Turso remote từ chối PRAGMA trong transaction
        // (SQL_PARSE_ERROR "not allowed statement" qua Hrana batch) — busy_timeout
        // chỉ áp dụng cho file SQLite local; remote đã có retry loop bên dưới.
        if (!dbConfig.isRemote) {
          await tx.run(sql`PRAGMA busy_timeout=5000`)
        }
        return fn(tx)
      })
    } catch (err) {
      const busy = err instanceof LibsqlError && err.code === 'SQLITE_BUSY'
      if (!busy || attempt >= MAX_TX_BUSY_RETRY) throw err
      await new Promise((r) => setTimeout(r, 25 * 2 ** attempt))
    }
  }
}
