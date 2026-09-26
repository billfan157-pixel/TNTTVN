import { createClient } from '@libsql/client'
import type { Client } from '@libsql/client'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { getDbConfig } from './dbConfig.js'
import { assertNotRecoveryQuarantined } from './recoveryQuarantine.js'
import { isCloudflareWorkerRuntime } from '../utils/cloudflareRuntime.js'

export const dbConfig = getDbConfig()
const { isRemote, url, authToken, dbPath } = dbConfig
const isCloudflareWorker = isCloudflareWorkerRuntime()

if (isCloudflareWorker && !isRemote) {
  throw new Error('Cloudflare Worker requires TURSO_URL; local SQLite is not durable')
}

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

// Cloudflare prohibits asynchronous I/O during module evaluation. The Worker
// release preflight must perform the quarantine/readiness checks before this
// request bundle is deployed; the Node server retains its existing boot gate.
if (!isCloudflareWorker) {
  try {
    await assertNotRecoveryQuarantined(client)
  } catch (error) {
    client.close()
    throw error
  }

  await client.execute('PRAGMA foreign_keys=ON')

  if (!isRemote) {
    await client.execute('PRAGMA journal_mode=WAL')
    await client.execute('PRAGMA busy_timeout=5000')
    await client.execute('PRAGMA synchronous=NORMAL')
  }
}
