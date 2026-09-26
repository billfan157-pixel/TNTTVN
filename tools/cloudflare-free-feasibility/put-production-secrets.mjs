// Upload reviewed production values from an ignored local file to the inert
// catevia-api Worker. Never echo values or put them in command arguments.
import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (process.argv[2] === '--check') {
  const required = [
    'TURSO_URL', 'TURSO_AUTH_TOKEN', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'REPORT_HMAC_SECRET',
    'OPS_TOKEN', 'PASSWORD_CIPHER_KEY', 'BACKUP_ENCRYPTION_KEY', 'SUPER_ADMIN_ID',
    'CATEVIA_PROXY_SHARED_SECRET', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'APNS_KEY_ID', 'APNS_TEAM_ID',
    'APNS_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY',
  ]
  const run = spawnSync(process.execPath, [
    './node_modules/wrangler/bin/wrangler.js', 'secret', 'list',
    '--config', 'wrangler-catevia-production.jsonc',
  ], { cwd: new URL('.', import.meta.url), encoding: 'utf8', maxBuffer: 1024 * 1024 })
  if (run.status !== 0) throw new Error(`Production secret inventory failed (exit ${run.status})`)
  let live
  try { live = JSON.parse(run.stdout) } catch { throw new Error('Production secret inventory was not valid JSON') }
  const names = new Set(live.map(entry => entry.name))
  const missing = required.filter(name => !names.has(name))
  process.stdout.write(`${JSON.stringify({ ok: missing.length === 0, required: required.length, missing })}\n`)
  process.exitCode = missing.length === 0 ? 0 : 1
  process.exit()
}

if (process.argv[2] !== '--execute'
  || (process.argv[3] && process.argv[3] !== '--providers')
  || process.argv[4]) {
  throw new Error('Use --execute or --execute --providers after reviewing the production credential source')
}
const providerMode = process.argv[3] === '--providers'
const source = new URL('./.dev.vars.catevia-production', import.meta.url)
const raw = readFileSync(source, 'utf8').replace(/^\uFEFF/, '')
const entries = raw.trimEnd().split(/\r?\n/).map(line => {
  const separator = line.indexOf('=')
  if (separator < 1) throw new Error('Malformed production secrets file')
  return [line.slice(0, separator), line.slice(separator + 1)]
})
const values = new Map(entries)
if (values.size !== entries.length) throw new Error('Duplicate production secret name')
const coreSecrets = ['TURSO_URL', 'TURSO_AUTH_TOKEN', 'JWT_SECRET', 'JWT_REFRESH_SECRET',
  'REPORT_HMAC_SECRET', 'OPS_TOKEN', 'PASSWORD_CIPHER_KEY', 'BACKUP_ENCRYPTION_KEY', 'SUPER_ADMIN_ID',
  'CATEVIA_PROXY_SHARED_SECRET']
const providerSecrets = ['FIREBASE_SERVICE_ACCOUNT_JSON', 'APNS_KEY_ID', 'APNS_TEAM_ID',
  'APNS_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']
const allowed = providerMode ? providerSecrets : coreSecrets
if (entries.some(([key]) => !coreSecrets.includes(key) && !providerSecrets.includes(key))
  || allowed.some(key => !values.get(key))) {
  throw new Error('Missing or unexpected production secret name')
}
if (providerMode) {
  let firebase
  try {
    firebase = JSON.parse(values.get('FIREBASE_SERVICE_ACCOUNT_JSON'))
  } catch {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON')
  }
  if (!firebase || typeof firebase !== 'object'
    || typeof firebase.project_id !== 'string' || typeof firebase.client_email !== 'string'
    || typeof firebase.private_key !== 'string' || !firebase.private_key.includes('BEGIN')) {
    throw new Error('Incomplete FIREBASE_SERVICE_ACCOUNT_JSON')
  }
  for (const key of ['APNS_KEY_ID', 'APNS_TEAM_ID']) {
    if (!/^[A-Z0-9]{10}$/.test(values.get(key))) throw new Error(`Malformed ${key}`)
  }
  if (!values.get('APNS_PRIVATE_KEY').includes('BEGIN')) throw new Error('Malformed APNS_PRIVATE_KEY')
  for (const key of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) {
    if (!/^[A-Za-z0-9_-]{32,512}$/.test(values.get(key))) throw new Error(`Malformed ${key}`)
  }
} else {
  if (values.get('TURSO_URL') !== 'libsql://tnttvn-billfan157-pixel.aws-us-east-1.turso.io') {
    throw new Error('Production database URL mismatch')
  }
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(values.get('TURSO_AUTH_TOKEN'))) {
    throw new Error('Malformed production database token')
  }
  for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'REPORT_HMAC_SECRET', 'OPS_TOKEN', 'CATEVIA_PROXY_SHARED_SECRET']) {
    if (values.get(key).length < 32) throw new Error(`Weak ${key}`)
  }
  if (!/^[a-f0-9]{64}$/i.test(values.get('PASSWORD_CIPHER_KEY'))) throw new Error('Invalid PASSWORD_CIPHER_KEY')
  const backupKey = values.get('BACKUP_ENCRYPTION_KEY')
  if (!/^[a-f0-9]{64}$/i.test(backupKey)
    && (!/^[A-Za-z0-9+/_-]{43}=?$/.test(backupKey) || Buffer.from(backupKey, 'base64').length !== 32)) {
    throw new Error('Invalid BACKUP_ENCRYPTION_KEY')
  }
  if (values.get('SUPER_ADMIN_ID').trim() !== values.get('SUPER_ADMIN_ID')) throw new Error('Malformed SUPER_ADMIN_ID')
}
if (process.platform !== 'win32' && (statSync(source).mode & 0o077) !== 0) {
  throw new Error('Production secrets file must not be readable by other users')
}

for (const key of allowed) {
  const run = spawnSync(process.execPath, [
    './node_modules/wrangler/bin/wrangler.js', 'secret', 'put', key,
    '--config', 'wrangler-catevia-production-bootstrap.jsonc',
  ], {
    cwd: new URL('.', import.meta.url), input: Buffer.from(values.get(key), 'utf8'), encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  if (run.status !== 0) throw new Error(`Production secret upload failed for ${key} (exit ${run.status})`)
  process.stdout.write(`Stored ${key} on disabled catevia-api Worker\n`)
}
