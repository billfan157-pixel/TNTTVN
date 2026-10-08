import assert from 'node:assert/strict'
import { test } from 'node:test'
import { waitMaintenanceState } from './wait-maintenance-state.mjs'

const release = 'a'.repeat(40)
const token = 'synthetic-operator-token-'.repeat(2)
const ready = (runtime, enabled, sha = release) =>
  ({ status: 'ready', releaseId: sha, maintenance: { runtime, enabled } })
const jobs = () => Array.from({ length: 10 }, () =>
  ({ releaseId: release, paused: false, nextAlarm: 123, active: false }))
const options = { release, token, attempts: 3, intervalMs: 0, wait: async () => {} }

test('retries a transient resume failure while proving the source paused on every attempt', async () => {
  const calls = []
  let resumes = 0
  const result = await waitMaintenanceState({ ...options, mode: 'resume', fetcher: async (url, init) => {
    calls.push({ url, method: init.method })
    if (url.includes('onrender.com')) return Response.json(ready('node', false))
    return ++resumes === 1 ? new Response('Maintenance control incomplete', { status: 503 })
      : Response.json({ jobs: jobs() })
  } })
  assert.equal(result.attempts, 2)
  assert.deepEqual(calls.map(c => c.method), ['GET', 'POST', 'GET', 'POST'])
})

test('stops without another resume if the source writer becomes enabled', async () => {
  let sources = 0
  let resumes = 0
  await assert.rejects(waitMaintenanceState({ ...options, mode: 'resume', fetcher: async url => {
    if (url.includes('onrender.com')) return Response.json(ready('node', ++sources > 1))
    resumes++
    return new Response('', { status: 503 })
  } }), { code: 'SOURCE_WRITER_ACTIVE' })
  assert.equal(resumes, 1)
})

test('never resumes from an unverified source release', async () => {
  let resumes = 0
  await assert.rejects(waitMaintenanceState({ ...options, mode: 'resume', fetcher: async url => {
    if (url.includes('onrender.com')) return Response.json(ready('node', false, 'b'.repeat(40)))
    resumes++
    return Response.json({ jobs: jobs() })
  } }), { code: 'STATE_NOT_VERIFIED' })
  assert.equal(resumes, 0)
})

test('HTTP 200 never admits missing, paused, stale or unarmed jobs', async () => {
  for (const mutate of [j => j.pop(), j => { j[0].paused = true },
    j => { j[0].releaseId = 'b'.repeat(40) }, j => { delete j[0].nextAlarm }]) {
    const invalid = jobs()
    mutate(invalid)
    await assert.rejects(waitMaintenanceState({ ...options, mode: 'resume', fetcher: async url =>
      Response.json(url.includes('onrender.com') ? ready('node', false) : { jobs: invalid })
    }), { code: 'STATE_NOT_VERIFIED' })
  }
})

test('waits for the exact closed Worker state after a configuration transition', async () => {
  let requests = 0
  const result = await waitMaintenanceState({ ...options, mode: 'closed', fetcher: async () =>
    Response.json(ready('cloudflare-worker', ++requests === 1)) })
  assert.equal(result.attempts, 2)
})

test('a ready response cannot substitute the wrong release, runtime or ownership', async () => {
  for (const body of [ready('cloudflare-worker', true, 'b'.repeat(40)),
    ready('node', true), ready('cloudflare-worker', false),
    { ...ready('cloudflare-worker', true), status: 'not-ready' }]) {
    await assert.rejects(waitMaintenanceState({ ...options, mode: 'open', fetcher: async () =>
      Response.json(body) }), { code: 'STATE_NOT_VERIFIED' })
  }
})

test('credential rejection is fatal and does not become an empty green window', async () => {
  let calls = 0
  await assert.rejects(waitMaintenanceState({ ...options, mode: 'closed', fetcher: async () => {
    calls++
    return new Response('', { status: 403 })
  } }), { code: 'CREDENTIAL_REJECTED' })
  assert.equal(calls, 1)
})

test('accepts the paused Render destination and bounds permanently failing transport', async () => {
  assert.equal((await waitMaintenanceState({ ...options, mode: 'render', fetcher: async () =>
    Response.json(ready('node', false)) })).ok, true)
  let calls = 0
  await assert.rejects(waitMaintenanceState({ ...options, mode: 'closed', fetcher: async () => {
    calls++
    throw new TypeError('Synthetic network outage')
  } }), { code: 'STATE_NOT_VERIFIED' })
  assert.equal(calls, options.attempts)
})
