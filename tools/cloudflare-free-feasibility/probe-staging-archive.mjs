// Synthetic admin + tiny PNG prove the real archive route uses the staging R2
// binding. All credentials remain in memory; only status/timing/checksums pass.
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes, createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client/web'

const vars = Object.fromEntries(readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  }))
if (!vars.TURSO_URL?.includes('catevia-cloudflare-probe-20260924') || !vars.TURSO_AUTH_TOKEN) {
  throw new Error('Disposable database credential required')
}

const db = createClient({ url: vars.TURSO_URL, authToken: vars.TURSO_AUTH_TOKEN })
const nonce = randomBytes(8).toString('hex')
const username = `cf-archive-${nonce}`
const userId = `CFP-${nonce}`
const password = `${randomBytes(20).toString('base64url')}Aa1!`
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=', 'base64')
const digest = createHash('sha256').update(png).digest('hex')
const observations = []

async function call(label, path, init = {}) {
  const start = performance.now()
  try {
    const response = await fetch(`https://catevia-api-staging.billfan157.workers.dev${path}`, {
      ...init, signal: AbortSignal.timeout(35_000),
    })
    observations.push({ label, status: response.status, elapsedMs: Math.round(performance.now() - start) })
    return response
  } catch (error) {
    observations.push({ label, status: 'transport-error', errorClass: error?.name || 'UnknownError', causeCode: error?.cause?.code, elapsedMs: Math.round(performance.now() - start) })
    return null
  }
}

try {
  await db.execute({
    sql: `INSERT INTO users (id, username, password_hash, full_name, role, status, token_version, failed_attempts, must_change_password, parish_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`,
    args: [userId, username, await bcrypt.hash(password, 12), 'Synthetic R2 Staging Admin', 'admin', 'ACTIVE', 'gia-ton', new Date().toISOString()],
  })
  const login = await call('admin-login', '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
  })
  if (login?.status === 200) {
    const accessToken = (await login.json())?.data?.accessToken
    if (accessToken) {
      const form = new FormData()
      form.set('file', new Blob([png], { type: 'image/png' }), 'synthetic-1x1.png')
      form.set('assetType', 'IMAGE')
      form.set('title', 'Synthetic Worker R2 Probe')
      form.set('visibility', 'STAFF')
      form.set('recordIds', '[]')
      const upload = await call('archive-upload', '/api/parish-profile/assets/upload', {
        method: 'POST', headers: { authorization: `Bearer ${accessToken}` }, body: form,
      })
      if (upload?.status === 201) {
        const asset = (await upload.json())?.data
        observations.push({ label: 'asset-persisted', hasObjectKey: Boolean(asset?.objectKey), checksumMatches: asset?.checksumSha256 === digest })
        const route = `/api/parish-profile/assets/${encodeURIComponent(asset.id)}/download`
        await call('unauthorized-download', route)
        const download = await call('authorized-download', route, { headers: { authorization: `Bearer ${accessToken}` } })
        if (download?.status === 200) {
          const bytes = Buffer.from(await download.arrayBuffer())
          observations.push({ label: 'download-integrity', sizeMatches: bytes.length === png.length, checksumMatches: createHash('sha256').update(bytes).digest('hex') === digest })
        }
      }
    }
  }
} finally {
  db.close()
  const result = { capturedAt: new Date().toISOString(), scope: 'disposable-turso-and-test-r2-only', observations }
  writeFileSync(new URL('./results/2026-09-24-catevia-staging-archive.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
