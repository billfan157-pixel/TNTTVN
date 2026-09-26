import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client/web'

const values = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))

if (values.TURSO_URL !== 'libsql://catevia-cloudflare-probe-20260924-billfan157-pixel.aws-us-east-1.turso.io') {
  process.stdout.write('disposable_database_guard=failed\n')
  process.exit(2)
}

const database = createClient({ url: values.TURSO_URL, authToken: values.TURSO_AUTH_TOKEN })
let rejected = false
try {
  await database.execute('SELECT 1')
} catch {
  rejected = true
} finally {
  try { database.close() } catch {}
}

process.stdout.write(`old_test_token_rejected=${rejected}\n`)
if (!rejected) process.exitCode = 1
