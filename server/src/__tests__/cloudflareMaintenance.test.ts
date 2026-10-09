import { afterEach, describe, expect, it, vi } from 'vitest'
import { client } from '../db/index.js'
import { RECOVERY_QUARANTINE_KEY } from '../db/recoveryQuarantine.js'
import { MaintenanceJob } from '../cloudflare/maintenanceJob.js'

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: unknown
    env: unknown
    constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env }
  },
}))

function coordinator(kind = 'rate-limit-cleanup', owner = 'cloudflare') {
  const values = new Map<string, unknown>([['kind', kind]])
  let alarm: number | null = null
  const storage = {
    get: vi.fn(async (key: string) => values.get(key)),
    put: vi.fn(async (key: string, value: unknown) => { values.set(key, value) }),
    getAlarm: vi.fn(async (): Promise<number | null> => alarm),
    setAlarm: vi.fn(async (at: number) => { alarm = at }),
    deleteAlarm: vi.fn(async () => { alarm = null }),
  }
  const abort = vi.fn((_message?: string, _options?: { retryAlarm?: boolean }): never => {
    throw new Error('Synthetic instance reset')
  })
  const env = { CATEVIA_MAINTENANCE_OWNER: owner, APP_RELEASE_ID: 'a'.repeat(40) }
  return { job: new MaintenanceJob({ storage, abort }, env), storage, values, abort }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await client.execute({ sql: 'DELETE FROM rate_limits WHERE key LIKE ?', args: ['cf-maintenance-test:%'] })
  await client.execute({ sql: 'DELETE FROM system_settings WHERE key = ?', args: [RECOVERY_QUARANTINE_KEY] })
})

describe('Cloudflare maintenance lifecycle', () => {
  it('continues a notification backlog promptly and returns to polling after it drains', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.now())
    const { job, storage } = coordinator('notification')
    vi.spyOn(job, 'run').mockResolvedValueOnce({ queueLength: 1 }).mockResolvedValueOnce({ queueLength: 0 })
    const start = Date.now()
    await job.alarm()
    expect(storage.setAlarm.mock.calls[0][0] - start).toBeLessThan(5_000)
    const drainedAt = Date.now()
    await job.alarm()
    expect(storage.setAlarm.mock.calls[1][0] - drainedAt).toBeGreaterThanOrEqual(30_000)
  })

  it('pauses durably and drains a running job before acknowledging rollback', async () => {
    const { job, storage, values } = coordinator('notification')
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const run = vi.spyOn(job, 'run').mockImplementation(() => pending)
    const alarm = job.alarm()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    let drained = false
    const pause = job.pause().then(() => { drained = true })
    await vi.waitFor(() => expect(values.get('paused')).toBe(true))
    expect(drained).toBe(false)
    finish()
    await Promise.all([alarm, pause])
    expect(drained).toBe(true)
    expect(storage.setAlarm).not.toHaveBeenCalled()
    await job.alarm()
    await expect(job.ensureScheduled('notification')).resolves.toEqual({ enabled: false })
    expect(run).toHaveBeenCalledTimes(1)
    await job.resume('notification')
    expect(values.get('paused')).toBe(false)
    expect(storage.setAlarm).toHaveBeenCalledTimes(1)
  })

  it('retains an operator pause after an isolate restart', async () => {
    const { job, values } = coordinator('notification')
    values.set('paused', true)
    const run = vi.spyOn(job, 'run')
    await job.alarm()
    expect(run).not.toHaveBeenCalled()
    await expect(job.status()).resolves.toMatchObject({ paused: true, active: false })
  })

  it('cleans expired rate limits while retaining active login and API limits', async () => {
    const now = Date.now()
    await client.batch([
      { sql: 'INSERT INTO rate_limits (key, count, reset_at) VALUES (?, ?, ?)', args: ['cf-maintenance-test:expired', 10, now - 1] },
      { sql: 'INSERT INTO rate_limits (key, count, reset_at) VALUES (?, ?, ?)', args: ['cf-maintenance-test:active', 7, now + 60_000] },
    ], 'write')
    const { job, storage, values } = coordinator()
    await job.alarm()
    const rows = await client.execute({ sql: 'SELECT key, count FROM rate_limits WHERE key LIKE ?', args: ['cf-maintenance-test:%'] })
    expect(rows.rows).toEqual([expect.objectContaining({ key: 'cf-maintenance-test:active', count: 7 })])
    expect(values.get('lastSuccessAt')).toEqual(expect.any(String))
    expect(storage.setAlarm).toHaveBeenCalledWith(expect.any(Number))
  })

  it('does not execute or rearm a writer after ownership has moved away', async () => {
    const { job, storage } = coordinator('notification', 'render')
    const run = vi.spyOn(job, 'run')
    await job.alarm()
    expect(run).not.toHaveBeenCalled()
    expect(storage.setAlarm).not.toHaveBeenCalled()
    await expect(job.ensureScheduled('notification')).resolves.toEqual({ enabled: false })
    expect(storage.deleteAlarm).toHaveBeenCalledTimes(1)
  })

  it('restarts a paused idle instance with stale ownership without changing persisted state', async () => {
    const { job, storage, values, abort } = coordinator('notification', 'render')
    values.set('paused', true)
    const before = new Map(values)
    await expect(job.resume('notification', { releaseId: 'a'.repeat(40), maintenanceOwner: 'cloudflare' }))
      .rejects.toThrow('Synthetic instance reset')
    expect(abort).toHaveBeenCalledWith('MAINTENANCE_ENVIRONMENT_RELOAD', { retryAlarm: false })
    expect(values).toEqual(before)
    expect(storage.put).not.toHaveBeenCalled()
    expect(storage.setAlarm).not.toHaveBeenCalled()
  })

  it.each(['unpaused', 'armed'])('does not restart a stale instance while %s', async state => {
    const { job, storage, values, abort } = coordinator('notification', 'render')
    values.set('paused', state !== 'unpaused')
    if (state === 'armed') storage.getAlarm.mockResolvedValue(123)
    await expect(job.resume('notification', { releaseId: 'a'.repeat(40), maintenanceOwner: 'cloudflare' }))
      .rejects.toThrow('Maintenance configuration differs from controller')
    expect(abort).not.toHaveBeenCalled()
    expect(storage.put).not.toHaveBeenCalled()
    expect(storage.setAlarm).not.toHaveBeenCalled()
  })

  it('preserves a running alarm while a newer controller waits for configuration', async () => {
    const { job, storage, values, abort } = coordinator('notification')
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    const run = vi.spyOn(job, 'run').mockImplementation(() => pending)
    const active = job.alarm()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    values.set('paused', true)
    try {
      await expect(job.resume('notification', { releaseId: 'b'.repeat(40), maintenanceOwner: 'cloudflare' }))
        .rejects.toThrow('Maintenance configuration differs from controller')
      expect(abort).not.toHaveBeenCalled()
      expect(values.get('paused')).toBe(true)
      expect(storage.put).not.toHaveBeenCalledWith('paused', false)
    } finally { finish(); await active }
    expect(storage.setAlarm).not.toHaveBeenCalled()
  })

  it('arms a refreshed instance only after its own configuration matches the controller', async () => {
    const { job, storage, values, abort } = coordinator('notification')
    values.set('paused', true)
    await job.resume('notification', { releaseId: 'a'.repeat(40), maintenanceOwner: 'cloudflare' })
    expect(values.get('paused')).toBe(false)
    expect(storage.setAlarm).toHaveBeenCalledTimes(1)
    expect(abort).not.toHaveBeenCalled()
    await expect(job.status()).resolves.toMatchObject({ maintenanceOwner: 'cloudflare' })
  })

  it('blocks every job under recovery quarantine and rearms for recovery', async () => {
    await client.execute({ sql: 'INSERT INTO system_settings (key, value) VALUES (?, ?)', args: [RECOVERY_QUARANTINE_KEY, '{}'] })
    const { job, storage, values } = coordinator('notification')
    const run = vi.spyOn(job, 'run')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await job.alarm()
    expect(run).not.toHaveBeenCalled()
    expect(values.has('lastSuccessAt')).toBe(false)
    expect(values.get('lastFailureAt')).toEqual(expect.any(String))
    expect(storage.setAlarm).toHaveBeenCalledWith(expect.any(Number))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('MAINTENANCE_JOB_FAILED'))
  })

  it('records a failed invocation and succeeds when the next alarm retries', async () => {
    const { job, storage, values } = coordinator('notification')
    vi.spyOn(job, 'run').mockRejectedValueOnce(new Error('Synthetic provider outage')).mockResolvedValueOnce({ queueLength: 0 })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await job.alarm()
    expect(values.has('lastSuccessAt')).toBe(false)
    expect(values.get('lastFailureAt')).toEqual(expect.any(String))
    await job.alarm()
    expect(values.get('lastSuccessAt')).toEqual(expect.any(String))
    expect(storage.setAlarm).toHaveBeenCalledTimes(2)
  })
})
