// Disposable-only, high-entropy backup fixture approximating the live DB size.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { createClient } from '@libsql/client/web'

const vars = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (!vars.TURSO_URL?.includes('catevia-cloudflare-probe-20260924') || !vars.TURSO_AUTH_TOKEN || vars.OPS_TOKEN?.length < 32) {
  throw new Error('Disposable database and staging OPS credentials required')
}
const db = createClient({ url: vars.TURSO_URL, authToken: vars.TURSO_AUTH_TOKEN })
const prefix = 'cf-backup-size-probe-'
const blocks = 20
const bytesPerBlock = 160 * 1024
const result = { capturedAt: new Date().toISOString(), scope: 'disposable-db-and-test-r2-only',
  fixtureBytes: blocks * bytesPerBlock, inserted: 0, backupStatus: 0, backupElapsedMs: 0, rowCount: 0,
  cleaned: false }
try {
  await db.execute({ sql: 'DELETE FROM system_settings WHERE parish_id = ? AND key LIKE ?', args: ['gia-ton', `${prefix}%`] })
  for (let index = 0; index < blocks; index++) {
    await db.execute({
      sql: 'INSERT INTO system_settings (key, value, description, updated_at, parish_id) VALUES (?, ?, ?, ?, ?)',
      args: [`${prefix}${index}`, randomBytes(bytesPerBlock).toString('base64'), 'Disposable backup size fixture', new Date().toISOString(), 'gia-ton'],
    })
    result.inserted++
  }
  const start = performance.now()
  const response = await fetch('https://catevia-api-staging.billfan157.workers.dev/__staging/encrypted-backup-probe', {
    method: 'POST', headers: { authorization: `Bearer ${vars.OPS_TOKEN}` }, signal: AbortSignal.timeout(120_000),
  })
  const body = await response.json().catch(() => ({}))
  result.backupStatus = response.status
  result.backupElapsedMs = Math.round(performance.now() - start)
  if (body.ok === true) {
    result.rowCount = body.rowCount
    result.objectKey = body.objectKey
  }
} finally {
  await db.execute({ sql: 'DELETE FROM system_settings WHERE parish_id = ? AND key LIKE ?', args: ['gia-ton', `${prefix}%`] })
  result.cleaned = true
  db.close()
  writeFileSync(new URL('./results/2026-09-24-catevia-staging-backup-size.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.backupStatus !== 200 || !result.cleaned) process.exitCode = 1
}
