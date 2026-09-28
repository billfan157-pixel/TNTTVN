import { DurableObject } from 'cloudflare:workers'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client/web'
import puppeteer from '@cloudflare/puppeteer'
import { measureBcryptWithRetry } from './authCpuRetry.js'
import { withPasswordCpuNamespace, hashPassword, comparePassword } from '../../../server/src/utils/passwordCompute.ts'
export { PasswordCpu } from '../../../server/src/cloudflare/passwordCpu.js'

// This Worker is an isolated Free-tier feasibility probe, not a Catevia API.
// All endpoints fail closed until a high-entropy PROBE_TOKEN secret is set.
function authorized(request, env) {
  const expected = env.PROBE_TOKEN
  if (typeof expected !== 'string' || expected.length < 32) return false
  const encoder = new TextEncoder()
  const supplied = encoder.encode(request.headers.get('Authorization') ?? '')
  const required = encoder.encode(`Bearer ${expected}`)
  if (supplied.byteLength !== required.byteLength) {
    return !crypto.subtle.timingSafeEqual(supplied, supplied)
  }
  return crypto.subtle.timingSafeEqual(supplied, required)
}

export class AuthCpuProbe extends DurableObject {
  async measureBcrypt() {
    const password = `Catevia-probe-${crypto.randomUUID()}`
    const hash = await bcrypt.hash(password, 12)
    const matched = await bcrypt.compare(password, hash)
    // Production Worker clocks do not advance during pure CPU work. Read CPU
    // time from Cloudflare analytics, not performance.now() in this response.
    return { matched, bcryptCost: bcrypt.getRounds(hash), diagnosticRevision: 2 }
  }

  async scheduleAlarm() {
    const scheduledAt = Date.now() + 1000
    await this.ctx.storage.put('alarmResult', { scheduledAt, firedAt: null })
    await this.ctx.storage.setAlarm(scheduledAt)
    return { scheduledAt }
  }

  async alarm() {
    const result = await this.ctx.storage.get('alarmResult')
    if (result?.scheduledAt) {
      await this.ctx.storage.put('alarmResult', { ...result, firedAt: Date.now() })
    }
  }

  async readAlarm() {
    return (await this.ctx.storage.get('alarmResult')) ?? null
  }
}

async function probeBcrypt(env, shard) {
  try {
    return Response.json(await measureBcryptWithRetry(env.AUTH_CPU, shard))
  } catch (error) {
    // This probe handles only synthetic passwords. Keep diagnostic responses
    // bounded and avoid serializing arbitrary provider errors or credentials.
    const code = error instanceof Error && error.message === 'Durable Object reset because its code was updated.'
      ? 'DO_CODE_UPDATE_RESET'
      : 'DO_RPC_FAILURE'
    console.error('AuthCpuProbe RPC failed', code, error instanceof Error ? error.name : 'UnknownError')
    return Response.json({ error: code }, { status: 503 })
  }
}

async function probeCateviaPasswordAdapter(env) {
  let rpcCalls = 0
  const namespace = { getByName(name) {
    rpcCalls++
    return env.PASSWORD_CPU.getByName(name)
  } }
  const result = await withPasswordCpuNamespace(namespace, async () => {
    const password = 'Synthetic-Worker-Only@123'
    const hash = await hashPassword(password, 12)
    return {
      rounds: bcrypt.getRounds(hash),
      matched: await comparePassword(password, hash),
      rejected: await comparePassword('Wrong-Synthetic@123', hash),
    }
  })
  const valid = result.rounds === 12 && result.matched && !result.rejected && rpcCalls === 3
  return Response.json({ valid, rpcCalls }, { status: valid ? 200 : 500 })
}

async function probePdf(env) {
  // No user content or Catevia data enters this browser. The empty allowlist
  // blocks all external HTTP(S), even if request interception misses a URL.
  const browser = await puppeteer.launch(env.BROWSER, {
    guardrails: { allowedDomains: [] },
  })
  try {
    const guardPage = await browser.newPage()
    const blocked = await guardPage.goto('https://example.org').catch(() => null)
    const guardrailsBlocked = blocked?.status() === 403 &&
      blocked.headers()['cf-mitigated'] === 'guardrails'
    await guardPage.close()

    const page = await browser.newPage()
    try {
      await page.setJavaScriptEnabled(false)
      await page.setRequestInterception(true)
      page.on('request', request => {
        const url = request.url()
        if (url.startsWith('data:') || url === 'about:blank') request.continue()
        else request.abort('accessdenied')
      })
      await page.setContent('<!doctype html><html lang="vi"><meta charset="utf-8"><style>body{font-family:sans-serif}</style><h1>Catevia PDF probe</h1><p>Thử nghiệm Workers Free</p><script>window.__probeScriptRan=true</script><img src="https://example.org/blocked.png"></html>', { waitUntil: 'load', timeout: 30000 })
      const scriptRan = await page.evaluate(() => window.__probeScriptRan === true)
      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
      const pdfValid = new TextDecoder().decode(pdf.slice(0, 5)) === '%PDF-'
      return Response.json({ pdfValid, bytes: pdf.byteLength, scriptRan, guardrailsBlocked },
        { status: pdfValid && !scriptRan && guardrailsBlocked ? 200 : 500 })
    } finally {
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function probePbkdf2() {
  const password = `Catevia-probe-${crypto.randomUUID()}`
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const params = { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 }
  const expected = new Uint8Array(await crypto.subtle.deriveBits(params, key, 256))
  const actual = new Uint8Array(await crypto.subtle.deriveBits(params, key, 256))
  let diff = expected.length ^ actual.length
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i]
  return Response.json({ verified: diff === 0, iterations: params.iterations })
}

async function probeApnsTransport() {
  // An intentionally invalid bearer and all-zero sandbox device token ensure
  // APNs can only reject this request; it cannot deliver a notification.
  const response = await fetch(`https://api.sandbox.push.apple.com/3/device/${'0'.repeat(64)}`, {
    method: 'POST',
    headers: {
      authorization: 'bearer invalid-probe-token',
      'apns-topic': 'vn.tnttvn.probe',
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    },
    body: '{}',
  })
  const responseText = (await response.text()).slice(0, 256)
  let reason = null
  try { reason = JSON.parse(responseText)?.reason ?? null } catch {}
  return Response.json({ reachedApns: true, status: response.status, reason })
}

async function probeTursoRead(env) {
  if (!env.PROBE_TURSO_URL || !env.PROBE_TURSO_AUTH_TOKEN) {
    return Response.json({ error: 'Probe database is not configured' }, { status: 412 })
  }
  const client = createClient({ url: env.PROBE_TURSO_URL, authToken: env.PROBE_TURSO_AUTH_TOKEN })
  try {
    const result = await client.execute('SELECT 1 AS alive')
    const connected = Number(result.rows[0]?.alive) === 1
    return Response.json({ connected }, { status: connected ? 200 : 500 })
  } finally {
    client.close()
  }
}

async function probeTursoTransaction(env) {
  // This endpoint is restricted to a disposable probe database. The guard is
  // deliberately independent from the authentication token.
  let hostname = ''
  try { hostname = new URL(env.PROBE_TURSO_URL).hostname.toLowerCase() } catch {}
  if (env.PROBE_DISPOSABLE_DB !== 'yes' ||
      !hostname.startsWith('catevia-cloudflare-probe-') ||
      !hostname.endsWith('.turso.io') ||
      !env.PROBE_TURSO_AUTH_TOKEN) {
    return Response.json({ error: 'Disposable probe database is required' }, { status: 412 })
  }
  const client = createClient({ url: env.PROBE_TURSO_URL, authToken: env.PROBE_TURSO_AUTH_TOKEN })
  try {
    await client.execute('CREATE TABLE IF NOT EXISTS __catevia_cf_probe (id TEXT PRIMARY KEY)')
    const id = crypto.randomUUID()
    const tx = await client.transaction('write')
    try {
      await tx.execute({ sql: 'INSERT INTO __catevia_cf_probe (id) VALUES (?)', args: [id] })
      const inTransaction = await tx.execute({ sql: 'SELECT id FROM __catevia_cf_probe WHERE id = ?', args: [id] })
      if (inTransaction.rows.length !== 1) throw new Error('Transactional read did not see inserted row')
    } finally {
      await tx.rollback()
    }
    const afterRollback = await client.execute({ sql: 'SELECT id FROM __catevia_cf_probe WHERE id = ?', args: [id] })
    const rollbackPreserved = afterRollback.rows.length === 0
    return Response.json({ rollbackPreserved }, { status: rollbackPreserved ? 200 : 500 })
  } finally {
    client.close()
  }
}

async function probeR2RoundTrip(env) {
  if (!env.BACKUP_PROBE) return Response.json({ error: 'R2 binding unavailable' }, { status: 503 })
  const plaintext = new TextEncoder().encode('Catevia isolated Worker R2 encrypted round-trip fixture')
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext))
  const objectKey = `probe/worker-roundtrip-${crypto.randomUUID()}.enc`
  let stored = false
  try {
    await env.BACKUP_PROBE.put(objectKey, ciphertext, {
      httpMetadata: { contentType: 'application/octet-stream' },
    })
    stored = true
    const object = await env.BACKUP_PROBE.get(objectKey)
    if (!object) throw new Error('R2 object not found after put')
    const downloaded = new Uint8Array(await object.arrayBuffer())
    const bytesMatch = downloaded.length === ciphertext.length
      && downloaded.every((byte, index) => byte === ciphertext[index])
    const restored = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, downloaded))
    const plaintextMatch = restored.length === plaintext.length
      && restored.every((byte, index) => byte === plaintext[index])
    if (!bytesMatch || !plaintextMatch) throw new Error('R2 encrypted fixture verification failed')
    return Response.json({ verified: true, deleted: true, encryptedBytes: downloaded.length })
  } finally {
    if (stored) await env.BACKUP_PROBE.delete(objectKey)
  }
}

export default {
  async fetch(request, env) {
    if (!authorized(request, env)) return new Response('Forbidden', { status: 403 })
    const path = new URL(request.url).pathname
    try {
      if (request.method === 'GET' && path === '/probe/ping') {
        return Response.json({ alive: true })
      }
      if (request.method === 'POST' && path === '/probe/bcrypt') {
        return await probeBcrypt(env, 'bcrypt-probe')
      }
      if (request.method === 'POST' && path === '/probe/catevia-password-adapter') {
        return await probeCateviaPasswordAdapter(env)
      }
      if (request.method === 'POST' && path === '/probe/bcrypt-sharded') {
        // Synthetic identifiers only: never send Catevia account names to this probe.
        const shard = request.headers.get('X-Probe-Shard') ?? ''
        if (!/^load-user-[0-9]{1,2}$/.test(shard)) {
          return Response.json({ error: 'Synthetic probe shard required' }, { status: 400 })
        }
        return await probeBcrypt(env, shard)
      }
      if (request.method === 'POST' && path === '/probe/pbkdf2') {
        try {
          return await probePbkdf2()
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message.slice(0, 160) : 'Unknown failure',
          }, { status: 500 })
        }
      }
      if (request.method === 'POST' && path === '/probe/apns-transport') {
        return await probeApnsTransport()
      }
      if (request.method === 'POST' && path === '/probe/pdf') {
        return await probePdf(env)
      }
      if (request.method === 'POST' && path === '/probe/alarm') {
        return Response.json(await env.AUTH_CPU.getByName('alarm-probe').scheduleAlarm())
      }
      if (request.method === 'GET' && path === '/probe/alarm') {
        return Response.json(await env.AUTH_CPU.getByName('alarm-probe').readAlarm())
      }
      if (request.method === 'GET' && path === '/probe/turso-read') {
        return await probeTursoRead(env)
      }
      if (request.method === 'POST' && path === '/probe/turso-transaction') {
        return await probeTursoTransaction(env)
      }
      if (request.method === 'POST' && path === '/probe/r2-roundtrip') {
        return await probeR2RoundTrip(env)
      }
      return new Response('Not found', { status: 404 })
    } catch (error) {
      console.error('Cloudflare feasibility probe failed', error instanceof Error ? error.name : 'UnknownError')
      return Response.json({ error: 'Probe failed' }, { status: 500 })
    }
  },
}
