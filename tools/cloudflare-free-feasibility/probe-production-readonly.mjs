// Read-only inventory of migration dependencies. Never prints database rows.
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client/web'

const entries = readFileSync(new URL('../../.render-env-paste.txt', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').split(/\r?\n/).map(line => {
    const separator = line.indexOf('=')
    return separator > 0 ? [line.slice(0, separator), line.slice(separator + 1)] : null
  }).filter(Boolean)
const values = new Map(entries)
if (values.get('TURSO_URL') !== 'libsql://tnttvn-billfan157-pixel.aws-us-east-1.turso.io'
  || !values.get('TURSO_AUTH_TOKEN')) throw new Error('Verified production database source required')
const db = createClient({ url: values.get('TURSO_URL'), authToken: values.get('TURSO_AUTH_TOKEN') })
try {
  const [assets, schema] = await Promise.all([
    db.execute("SELECT count(*) AS n FROM parish_archive_assets WHERE object_key IS NOT NULL AND deleted_at IS NULL"),
    db.execute('PRAGMA page_count'),
  ])
  process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'production-readonly',
    uploadedArchiveAssets: Number(assets.rows[0]?.n || 0), pageCount: Number(schema.rows[0]?.page_count || 0) })}\n`)
} finally {
  db.close()
}
