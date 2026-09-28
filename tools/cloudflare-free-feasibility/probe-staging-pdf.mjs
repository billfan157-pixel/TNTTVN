// Exercise the real authenticated Catevia PDF route with synthetic content only.
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
const username = `cf-pdf-${nonce}`
const password = `${randomBytes(20).toString('base64url')}Aa1!`
const observations = []
const origin = 'https://catevia-api-staging.billfan157.workers.dev'

async function call(label, path, init = {}) {
  const start = performance.now()
  const response = await fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(60_000) })
  observations.push({ label, status: response.status, elapsedMs: Math.round(performance.now() - start) })
  return response
}

try {
  await db.execute({
    sql: `INSERT INTO users (id, username, password_hash, full_name, role, status, token_version, failed_attempts, must_change_password, parish_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)`,
    args: [`CFP-${nonce}`, username, await bcrypt.hash(password, 12), 'Synthetic PDF Staging Admin', 'admin', 'ACTIVE', 'gia-ton', new Date().toISOString()],
  })
  await call('unauthorized-pdf', '/api/reports/generate-pdf', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ htmlContent: '<h1>synthetic</h1>' }),
  })
  const login = await call('admin-login', '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }),
  })
  if (login.status === 200) {
    const accessToken = (await login.json())?.data?.accessToken
    if (accessToken) {
      const render = (label) => call(label, '/api/reports/generate-pdf', {
        method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          htmlContent: '<!doctype html><html lang="vi"><meta charset="utf-8"><h1>Catevia</h1><p>Báo cáo thử nghiệm tiếng Việt</p><script>document.body.innerHTML="bad"</script><img src="https://example.org/blocked.png"></html>',
          options: { format: 'A4' },
        }),
      })
      const burst = process.argv[2] === 'burst'
      const pdfs = burst
        ? await Promise.all([render('authenticated-pdf-1'), render('authenticated-pdf-2')])
        : [await render('authenticated-pdf')]
      for (const [index, pdf] of pdfs.entries()) {
        if (pdf.status === 200) {
          const bytes = Buffer.from(await pdf.arrayBuffer())
          observations.push({ label: `pdf-integrity-${index + 1}`, hasPdfSignature: bytes.subarray(0, 5).toString('ascii') === '%PDF-', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
        }
      }
    }
  }
} catch (error) {
  observations.push({ label: 'probe-error', class: error?.name || 'UnknownError', code: error?.cause?.code })
} finally {
  db.close()
  const result = { capturedAt: new Date().toISOString(), scope: 'disposable-turso-and-synthetic-html-only', observations }
  writeFileSync(new URL('./results/2026-09-24-catevia-staging-pdf.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
