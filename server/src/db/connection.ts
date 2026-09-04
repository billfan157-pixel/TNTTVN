import { createClient } from '@libsql/client'
import type { Client } from '@libsql/client'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { getDbConfig } from './dbConfig.js'

export const dbConfig = getDbConfig()
const { isRemote, url, authToken, dbPath } = dbConfig

if (!isRemote && dbPath) {
  const dbDir = dirname(dbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }
}

export const client: Client = createClient(
  isRemote
    ? { url, authToken }
    : { url },
)

await client.execute('PRAGMA foreign_keys=ON')

if (!isRemote) {
  await client.execute('PRAGMA journal_mode=WAL')
  await client.execute('PRAGMA busy_timeout=5000')
  await client.execute('PRAGMA synchronous=NORMAL')
}
