import assert from 'node:assert/strict'
import { test } from 'node:test'
import { probeProductionBackup } from './probe-production-backup.mjs'

const sha = 'a'.repeat(40)
const token = 'operator-token-with-at-least-32-characters'
const key = 'backups/v2/set-2026-09-25T00-00-00-000Z-abc123/manifest.json'
function fakeFetch({ publicStatus = 503, workerRelease = sha, verifiedRows = 7 } = {}) {
  const calls = []
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('workers.dev') && url.endsWith('/api/auth/me')) {
      return new Response('Backend cutover pending', { status: publicStatus })
    }
    if (url.includes('vercel.app') && url.endsWith('/api/auth/me')) {
      return new Response('', { status: 401, headers: { 'x-render-origin-server': 'Render' } })
    }
    if (url.endsWith('/health')) return Response.json({
      releaseId: url.includes('workers.dev') ? workerRelease : sha,
      database: 'connected',
    }, { headers: url.includes('vercel.app') ? { 'x-render-origin-server': 'Render' } : {} })
    if (url.endsWith('/verify')) return Response.json({ objectKey: key, rowCount: verifiedRows,
      tableCount: 78, encryptedBytes: 4096, manifestBytes: 512,
      archiveObjectCount: 2, format: 'tnttvn-backup-set-v2', checksum: 'f'.repeat(64) })
    return Response.json({ objectKey: key, rowCount: 7 })
  }
  return { fetcher, calls }
}

test('verifies a closed exact release before creating and checking its backup', async () => {
  const { fetcher, calls } = fakeFetch()
  const result = await probeProductionBackup({ expectedWorkerRelease: sha,
    expectedRenderRelease: sha, token, fetcher })
  assert.equal(result.ok, true)
   assert.equal(result.isolatedRestoreVerified, false)
   assert.equal(result.format, 'tnttvn-backup-set-v2')
   assert.equal(result.archiveObjectCount, 2)

  assert.deepEqual(calls.map(call => call.options.method || 'GET'),
    ['GET', 'GET', 'GET', 'GET', 'GET', 'POST', 'POST'])
  assert.equal(calls[5].options.headers['x-catevia-canary-token'], token)
  assert.equal(calls[6].options.headers['x-catevia-backup-key'], key)
})

test('refuses a public Worker, wrong release, or backup mismatch before claiming success', async () => {
  for (const options of [{ publicStatus: 401 }, { workerRelease: 'b'.repeat(40) },
    { verifiedRows: 8 }]) {
    const { fetcher, calls } = fakeFetch(options)
    await assert.rejects(probeProductionBackup({ expectedWorkerRelease: sha,
      expectedRenderRelease: sha, token, fetcher }))
    if (options.publicStatus || options.workerRelease) assert.equal(calls.some(call => call.options.method === 'POST'), false)
  }
})
