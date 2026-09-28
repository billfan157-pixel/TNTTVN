// Explicitly disposable Turso schema rehearsal before any Catevia Worker route.
// Run with a short-lived database-scoped token via an ignored local env file.
const EXPECTED_HOST = 'catevia-cloudflare-probe-20260924-billfan157-pixel.aws-us-east-1.turso.io'

if (process.env.CATEVIA_CF_DISPOSABLE_SCHEMA_PROBE !== 'yes') {
  throw new Error('Set CATEVIA_CF_DISPOSABLE_SCHEMA_PROBE=yes for the disposable schema rehearsal')
}
if (!process.env.TURSO_AUTH_TOKEN || !process.env.TURSO_URL) {
  throw new Error('Disposable Turso URL and token are required')
}
let hostname: string
try {
  const url = new URL(process.env.TURSO_URL)
  if (url.protocol !== 'libsql:') throw new Error('unexpected protocol')
  hostname = url.hostname.toLowerCase()
} catch {
  throw new Error('Disposable Turso URL is malformed')
}
if (hostname !== EXPECTED_HOST) {
  throw new Error('Refusing schema writes outside the named disposable Turso database')
}

// Importing db/index runs the Node release bootstrap and migrations. All
// guards above execute before that import or any network/database operation.
const [{ client }, { assertDatabaseReady }] = await Promise.all([
  import('../db/index.js'),
  import('../db/schemaHealth.js'),
])
try {
  await assertDatabaseReady(client)
  console.log(JSON.stringify({ database: 'catevia-cloudflare-probe-20260924', schemaReady: true }))
} finally {
  client.close()
}
