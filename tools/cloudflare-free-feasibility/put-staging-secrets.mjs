// Run only against the disposable Catevia staging Worker. Keeps secret values
// out of shell arguments, PowerShell's BOM-adding stdin, and command output.
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const file = new URL('./.dev.vars.catevia-staging', import.meta.url)
const lines = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/)
const values = new Map(lines.map((line) => {
  const separator = line.indexOf('=')
  if (separator < 1) throw new Error('Malformed staging secrets file')
  return [line.slice(0, separator), line.slice(separator + 1)]
}))

const keys = process.argv.slice(2)
const allowed = new Set(['TURSO_AUTH_TOKEN', 'REPORT_HMAC_SECRET', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'OPS_TOKEN', 'BACKUP_ENCRYPTION_KEY'])
if (!keys.length || keys.some((key) => !allowed.has(key))) {
  throw new Error('Specify one or more supported staging secret names')
}
for (const key of keys) {
  const value = values.get(key)
  if (!value || !/^[\x21-\x7E]+$/.test(value)) throw new Error(`Missing or non-ASCII ${key}`)
  if (key === 'TURSO_AUTH_TOKEN' && value.split('.').length !== 3) throw new Error('Malformed Turso token')
  if (key === 'BACKUP_ENCRYPTION_KEY' && !/^[a-f0-9]{64}$/i.test(value)) throw new Error('Invalid backup key')
  if (key !== 'TURSO_AUTH_TOKEN' && value.length < 32) throw new Error(`Weak ${key}`)
}

// Remove the BOM introduced by Windows PowerShell's Set-Content from the local
// file too, so subsequent Node scripts and Wrangler local dev see clean keys.
writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 })
for (const key of keys) {
  const run = spawnSync(process.execPath, [
    './node_modules/wrangler/bin/wrangler.js', 'secret', 'put', key,
    '--config', 'wrangler-catevia-staging-bootstrap.jsonc',
  ], {
    cwd: new URL('.', import.meta.url),
    input: Buffer.from(values.get(key), 'ascii'),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  if (run.status !== 0) {
    // Wrangler may echo malformed input in diagnostics. Never print it.
    throw new Error(`Secret upload failed for ${key} (exit ${run.status})`)
  }
  process.stdout.write(`Stored ${key} on isolated staging Worker\n`)
}
