// Bounded connectivity comparison against the disposable staging database.
// Only status, elapsed time, and error class are recorded; never credentials.
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createClient } from '@libsql/client/web'

const pairs = readFileSync(new URL('./.dev.vars.catevia-staging', import.meta.url), 'utf8')
  .replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/).map((line) => {
    const equal = line.indexOf('=')
    return [line.slice(0, equal), line.slice(equal + 1)]
  })
const secrets = Object.fromEntries(pairs)
if (!secrets.TURSO_URL?.includes('catevia-cloudflare-probe-20260924') || !secrets.TURSO_AUTH_TOKEN) {
  throw new Error('Disposable Turso database is required')
}

const db = createClient({ url: secrets.TURSO_URL, authToken: secrets.TURSO_AUTH_TOKEN })
const base = 'https://catevia-api-staging.billfan157.workers.dev'
const observations = []
for (let i = 0; i < 4; i++) {
  for (const target of ['local-turso', 'worker-health', 'worker-auth-unknown']) {
    const start = performance.now()
    let status = 'error'
    let errorClass
    try {
      if (target === 'local-turso') {
        await db.execute('SELECT 1')
        status = 200
      } else {
        const route = target === 'worker-health' ? '/health' : '/api/auth/login'
        const response = await fetch(base + route, {
          method: target === 'worker-health' ? 'GET' : 'POST',
          headers: target === 'worker-health' ? undefined : { 'content-type': 'application/json' },
          body: target === 'worker-health' ? undefined : JSON.stringify({ username: 'nonexistent-cloudflare-probe', password: 'WrongPassword123!' }),
          signal: AbortSignal.timeout(30_000),
        })
        status = response.status
        await response.arrayBuffer()
      }
    } catch (error) {
      errorClass = error?.code || error?.name || 'UnknownError'
    }
    const result = { sequence: i + 1, target, status, elapsedMs: Math.round(performance.now() - start), ...(errorClass ? { errorClass } : {}) }
    observations.push(result)
    process.stdout.write(`${JSON.stringify(result)}\n`)
  }
}
db.close()
const output = new URL('./results/2026-09-24-catevia-staging-connectivity.json', import.meta.url)
writeFileSync(output, `${JSON.stringify({ capturedAt: new Date().toISOString(), observations }, null, 2)}\n`)
