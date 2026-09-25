// Upload reviewed production values from an ignored local file to the inert
// catevia-api Worker. Never echo values or put them in command arguments.
import { readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

if (process.argv[2] !== '--execute') throw new Error('Use --execute after reviewing the production credential source')
const source = new URL('./.dev.vars.catevia-production', import.meta.url)
const raw = readFileSync(source, 'utf8').replace(/^\uFEFF/, '')
const entries = raw.trimEnd().split(/\r?\n/).map(line => {
  const separator = line.indexOf('=')
  if (separator < 1) throw new Error('Malformed production secrets file')
  return [line.slice(0, separator), line.slice(separator + 1)]
})
const values = new Map(entries)
if (values.size !== entries.length) throw new Error('Duplicate production secret name')
const allowed = ['TURSO_URL', 'TURSO_AUTH_TOKEN', 'JWT_SECRET', 'JWT_REFRESH_SECRET',
  'REPORT_HMAC_SECRET', 'OPS_TOKEN', 'PASSWORD_CIPHER_KEY', 'BACKUP_ENCRYPTION_KEY', 'SUPER_ADMIN_ID']
if (entries.some(([key]) => !allowed.includes(key)) || allowed.some(key => !values.get(key))) {
  throw new Error('Missing or unexpected production secret name')
}
if (values.get('TURSO_URL') !== 'libsql://tnttvn-billfan157-pixel.aws-us-east-1.turso.io') {
  throw new Error('Production database URL mismatch')
}
if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(values.get('TURSO_AUTH_TOKEN'))) {
  throw new Error('Malformed production database token')
}
for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'REPORT_HMAC_SECRET', 'OPS_TOKEN']) {
  if (values.get(key).length < 32) throw new Error(`Weak ${key}`)
}
if (!/^[a-f0-9]{64}$/i.test(values.get('PASSWORD_CIPHER_KEY'))) throw new Error('Invalid PASSWORD_CIPHER_KEY')
const backupKey = values.get('BACKUP_ENCRYPTION_KEY')
if (!/^[a-f0-9]{64}$/i.test(backupKey)
  && (!/^[A-Za-z0-9+/_-]{43}=?$/.test(backupKey) || Buffer.from(backupKey, 'base64').length !== 32)) {
  throw new Error('Invalid BACKUP_ENCRYPTION_KEY')
}
if (values.get('SUPER_ADMIN_ID').trim() !== values.get('SUPER_ADMIN_ID')) throw new Error('Malformed SUPER_ADMIN_ID')
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
