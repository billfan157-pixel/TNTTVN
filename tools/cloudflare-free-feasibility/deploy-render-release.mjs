// Transitional rollback/ownership adapter. Never used by Worker-only releases.
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function deployRenderRelease({ release, enabled, token, serviceId, opsToken, fetcher = fetch, wait = delay }) {
  if (!/^[a-f0-9]{40}$/.test(release || '') || typeof enabled !== 'boolean'
    || !token || !/^srv-[a-z0-9]+$/.test(serviceId || '') || !opsToken) {
    throw new Error('Exact release, maintenance state, and Render/ops credentials required')
  }
  const api = `https://api.render.com/v1/services/${serviceId}/deploys`
  async function request(url, init = {}) {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Render deployment control failed (HTTP ${response.status})`)
    return response.json()
  }
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const created = await request(api, { method: 'POST', headers, body: JSON.stringify({ commitId: release }) })
  if (!/^dep-[a-z0-9]+$/.test(created.id || '')) throw new Error('Render deployment ID missing or invalid')
  for (let attempt = 0; attempt < 90; attempt++) {
    const deployment = await request(`${api}/${created.id}`, { headers })
    if (['build_failed', 'update_failed', 'canceled', 'deactivated'].includes(deployment.status)) {
      throw new Error(`Render deployment ended in ${deployment.status}`)
    }
    if (deployment.status === 'live') {
      const ready = await request('https://tnttvn.onrender.com/ready', {
        headers: { authorization: `Bearer ${opsToken}`, 'cache-control': 'no-store' },
      })
      if (ready.status !== 'ready' || ready.releaseId !== release
        || ready.maintenance?.runtime !== 'node' || ready.maintenance.enabled !== enabled) {
        throw new Error('Serving Render release or maintenance ownership differs from the requested state')
      }
      return { ok: true, release, maintenanceEnabled: enabled }
    }
    if (attempt < 89) await wait(10_000)
  }
  throw new Error('Timed out waiting for the Render deployment')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const state = process.argv[3]
  if (!['enabled', 'disabled'].includes(state)) throw new Error('Use enabled or disabled')
  const result = await deployRenderRelease({ release: process.argv[2], enabled: state === 'enabled',
    token: process.env.RENDER_API_KEY, serviceId: process.env.RENDER_SERVICE_ID, opsToken: process.env.OPS_TOKEN })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
