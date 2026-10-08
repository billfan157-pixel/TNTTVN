import { describe, expect, it, vi } from 'vitest'
import worker from '../cloudflare/entry.js'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))
vi.mock('../cloudflare/pdfJob.js', () => ({ PdfJob: class {} }))

// Distinct synthetic credentials exercise the two authority boundaries.
const token = 'o'.repeat(40)
const proxySecret = 'p'.repeat(40)
function environment(traffic = 'yes') {
  const createBackup = vi.fn(async () => ({ objectKey: 'backups/test', rowCount: 7 }))
  const env = {
    TURSO_URL: 'libsql://tnttvn-billfan157-pixel.aws-us-east-1.turso.io', TURSO_AUTH_TOKEN: 'synthetic',
    JWT_SECRET: 'synthetic', JWT_REFRESH_SECRET: 'synthetic', REPORT_HMAC_SECRET: 'synthetic',
    SUPER_ADMIN_ID: 'synthetic', OPS_TOKEN: token, BACKUP_ENCRYPTION_KEY: 'synthetic',
    APP_RELEASE_ID: 'a'.repeat(40), CATEVIA_TRAFFIC_ENABLED: traffic, CATEVIA_PROXY_SHARED_SECRET: proxySecret,
    BACKUP_JOB: { idFromName: vi.fn(() => 'synthetic-id'), get: vi.fn(() => ({ createBackup })) },
  }
  return { env, createBackup }
}

describe('production Worker backup admission', () => {
  it.each(['no', 'yes'])('keeps operator recovery available with traffic=%s', async traffic => {
    const { env, createBackup } = environment(traffic)
    const response = await worker.fetch(new Request('https://worker.example/__ops/precutover-backup', {
      method: 'POST', headers: { 'x-catevia-canary-token': token },
    }), env)
    expect(response.status).toBe(200)
    expect(createBackup).toHaveBeenCalledTimes(1)
  })

  it('does not grant operator backup authority to an authenticated public ingress', async () => {
    const { env, createBackup } = environment()
    const response = await worker.fetch(new Request('https://worker.example/__ops/precutover-backup', {
      method: 'POST', headers: { 'x-catevia-proxy-secret': proxySecret, 'x-catevia-client-ip': '203.0.113.1' },
    }), env)
    expect(response.status).toBe(403)
    expect(createBackup).not.toHaveBeenCalled()
  })

  it('drains every job only through operator authority and reports failures as incomplete', async () => {
    const { env } = environment()
    const pause = vi.fn(async () => {})
    const job = { pause, status: async () => ({ paused: true, active: false, nextAlarm: null }) }
    const boundEnv = { ...env, MAINTENANCE_JOB: { idFromName: (name: string) => name, get: () => job } }
    const url = 'https://worker.example/__ops/maintenance?mode=pause'
    const denied = await worker.fetch(new Request(url, {
      method: 'POST', headers: { 'x-catevia-proxy-secret': proxySecret, 'x-catevia-client-ip': '203.0.113.1' },
    }), boundEnv)
    expect(denied.status).toBe(403)
    expect(pause).not.toHaveBeenCalled()
    const request = () => new Request(url, { method: 'POST', headers: { 'x-catevia-canary-token': token } })
    const result = await worker.fetch(request(), boundEnv)
    expect(result.status).toBe(200)
    const body = await result.json() as { jobs: unknown[] }
    expect(body.jobs).toHaveLength(10)
    expect(pause).toHaveBeenCalledTimes(10)
    pause.mockRejectedValueOnce(new Error('Synthetic drain failure'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try { expect((await worker.fetch(request(), boundEnv)).status).toBe(503) } finally { log.mockRestore() }
  })

  it.each(['pause', 'resume', 'status'])('settles every %s RPC before returning an incomplete response', async mode => {
    const { env } = environment()
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const started: string[] = []
    const action = async (name: string) => {
      started.push(name)
      if (name.endsWith('-notification')) throw new Error('Synthetic first RPC failure')
      if (name.endsWith('-operation-reminders')) await pending
    }
    const boundEnv = { ...env, MAINTENANCE_JOB: {
      idFromName: (name: string) => name,
      get: (name: string) => ({
        pause: () => action(name), resume: () => action(name),
        status: async () => {
          if (mode === 'status') await action(name)
          return { paused: true, active: false, nextAlarm: null }
        },
      }),
    } }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    let returned = false
    const response = worker.fetch(new Request(`https://worker.example/__ops/maintenance?mode=${mode}`, {
      method: 'POST', headers: { 'x-catevia-canary-token': token },
    }), boundEnv).then(result => { returned = true; return result })
    try {
      // One event-loop turn completes the rejected RPC and its promise callbacks.
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(started).toHaveLength(10)
      expect(returned).toBe(false)
    } finally {
      finish()
      expect((await response).status).toBe(503)
      log.mockRestore()
    }
  })
})
