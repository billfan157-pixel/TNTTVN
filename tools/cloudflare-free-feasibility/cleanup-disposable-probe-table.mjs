// Remove only the empty table created by the earlier disposable transaction probe.
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'

const values = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (!values.TURSO_URL?.startsWith('libsql://catevia-cloudflare-probe-20260924-') || !values.TURSO_AUTH_TOKEN) {
  throw new Error('Disposable Turso database required')
}
const client = createClient({ url: values.TURSO_URL, authToken: values.TURSO_AUTH_TOKEN })
try {
  const table = await client.execute("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = '__catevia_cf_probe'")
  if (table.rows.length !== 1) throw new Error('Disposable probe table missing or ambiguous')
  const count = await client.execute('SELECT count(*) AS count FROM "__catevia_cf_probe"')
  if (Number(count.rows[0]?.count) !== 0) throw new Error('Disposable probe table is not empty')
  await client.execute('DROP TABLE "__catevia_cf_probe"')
  process.stdout.write(JSON.stringify({ scope: 'disposable-turso-only', removedEmptyProbeTable: true }) + '\n')
} finally {
  client.close()
}
