// Deployment convergence never relaxes the release or single-writer predicates.
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKER = 'https://catevia-api.billfan157.workers.dev'
const RENDER = 'https://tnttvn.onrender.com'

function ready(body, release, runtime, enabled) {
  return body?.status === 'ready' && body.releaseId === release
    && body.maintenance?.runtime === runtime && body.maintenance.enabled === enabled
}

export async function waitMaintenanceState({ mode, release, renderRelease = release, token,
  // Worker and Durable Object updates propagate independently. Keep a bounded
  // five-minute deployment window while rechecking ownership on every retry.
  fetcher = fetch, wait = delay, attempts = 60, intervalMs = 5000, deadlineMs = 300000 }) {
  if (!['resume', 'open', 'closed', 'render'].includes(mode)
    || !/^[a-f0-9]{40}$/.test(release || '') || !/^[a-f0-9]{40}$/.test(renderRelease || '')
    || typeof token !== 'string' || token.length < 32
    || !Number.isInteger(attempts) || attempts < 1 || intervalMs < 0 || deadlineMs <= 0) {
    throw new Error('Invalid maintenance verification inputs')
  }
  const startedAt = Date.now()
  const headers = { authorization: `Bearer ${token}`, 'x-catevia-canary-token': token }
  let reason = 'STATE_NOT_VERIFIED'
  async function request(url, method = 'GET') {
    const remaining = deadlineMs - (Date.now() - startedAt)
    if (remaining <= 0) return null
    try {
      const response = await fetcher(url, { method, headers,
        signal: AbortSignal.timeout(Math.min(30000, remaining)) })
      if (response.status === 401 || response.status === 403) {
        throw Object.assign(new Error('Operator credential rejected'), { code: 'CREDENTIAL_REJECTED' })
      }
      const body = await response.json().catch(() => null)
      if (response.status !== 200) { reason = `HTTP_${response.status}`; return null }
      return body
    } catch (error) {
      if (error?.code === 'CREDENTIAL_REJECTED') throw error
      reason = 'TRANSPORT_OR_BODY_UNAVAILABLE'
      return null
    }
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let verified = false
    if (mode === 'resume') {
      // Recheck the source on every retry. Never re-enable a competing writer.
      const source = await request(`${RENDER}/ready`)
      if (source?.maintenance?.enabled === true) {
        throw Object.assign(new Error('Render maintenance remains enabled'), { code: 'SOURCE_WRITER_ACTIVE' })
      }
      if (ready(source, renderRelease, 'node', false)) {
        const result = await request(`${WORKER}/__ops/maintenance?mode=resume`, 'POST')
        verified = Array.isArray(result?.jobs) && result.jobs.length === 10 && result.jobs.every(job =>
          job.releaseId === release && job.paused === false
          && (job.nextAlarm != null || job.active === true))
      }
    } else {
      const isRender = mode === 'render'
      const body = await request(`${isRender ? RENDER : WORKER}/ready`)
      verified = ready(body, release, isRender ? 'node' : 'cloudflare-worker', mode === 'open')
    }
    if (verified) return { ok: true, mode, release, attempts: attempt,
      elapsedMs: Date.now() - startedAt, checkedAt: new Date().toISOString() }
    if (attempt < attempts && Date.now() - startedAt < deadlineMs) {
      await wait(Math.min(intervalMs, deadlineMs - (Date.now() - startedAt)))
    } else break
  }
  throw Object.assign(new Error('Maintenance state did not converge'), { code: 'STATE_NOT_VERIFIED', reason })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await waitMaintenanceState({ mode: process.argv[2],
      release: process.argv[3], renderRelease: process.argv[4], token: process.env.OPS_TOKEN })))
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error?.code || 'INVALID_INPUT', reason: error?.reason }))
    process.exitCode = 1
  }
}
