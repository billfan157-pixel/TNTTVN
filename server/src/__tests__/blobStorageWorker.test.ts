import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  deleteObject, getObject, hasDurableBlobStorage, listObjects, putObject,
  withBlobBucket, type BlobBucket,
} from '../services/blobStorage.js'

const originalRuntime = process.env.CATEVIA_RUNTIME

beforeAll(() => {
  process.env.CATEVIA_RUNTIME = 'cloudflare-worker'
  vi.stubGlobal('WebSocketPair', class {})
})

afterAll(() => {
  if (originalRuntime === undefined) delete process.env.CATEVIA_RUNTIME
  else process.env.CATEVIA_RUNTIME = originalRuntime
  vi.unstubAllGlobals()
})

function bucketFixture() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>()
  const bucket: BlobBucket = {
    async put(key, body, options) {
      objects.set(key, { bytes: Uint8Array.from(body), contentType: options.httpMetadata.contentType })
      return { key }
    },
    async get(key) {
      const entry = objects.get(key)
      return entry ? { arrayBuffer: async () => Uint8Array.from(entry.bytes).buffer } : null
    },
    async list({ prefix, cursor }) {
      const keys = [...objects.keys()].filter(key => key.startsWith(prefix)).sort()
      const index = cursor ? Number(cursor) : 0
      const page = keys.slice(index, index + 1)
      return {
        objects: page.map(key => ({ key, size: objects.get(key)!.bytes.length, uploaded: new Date(1_000) })),
        truncated: index + 1 < keys.length,
        cursor: index + 1 < keys.length ? String(index + 1) : undefined,
      }
    },
    async delete(key) { objects.delete(key) },
  }
  return { bucket, objects }
}

describe('Worker R2 blob storage binding', () => {
  it('fails closed without a request-scoped binding', async () => {
    expect(hasDurableBlobStorage()).toBe(false)
    await expect(putObject('safety/test', 'data')).rejects.toThrow('BLOB_BUCKET binding is required')
    await expect(getObject('safety/test')).rejects.toThrow('BLOB_BUCKET binding is required')
    await expect(listObjects('safety/')).rejects.toThrow('BLOB_BUCKET binding is required')
    await expect(deleteObject('safety/test')).rejects.toThrow('BLOB_BUCKET binding is required')
  })

  it('puts, reads, paginates, and deletes through R2', async () => {
    const { bucket, objects } = bucketFixture()
    await withBlobBucket(bucket, async () => {
      expect(hasDurableBlobStorage()).toBe(true)
      await putObject('safety/b', Buffer.from('second'), 'application/json')
      await putObject('safety/a', 'first', 'text/plain')
      expect(objects.get('safety/a')?.contentType).toBe('text/plain')
      expect((await getObject('safety/a'))?.toString()).toBe('first')
      expect((await listObjects('safety/')).map(object => object.key)).toEqual(['safety/a', 'safety/b'])
      expect(await getObject('safety/missing')).toBeNull()
      await deleteObject('safety/a')
      expect(await getObject('safety/a')).toBeNull()
    })
  })

  it('keeps two concurrent request bindings separate', async () => {
    const first = bucketFixture()
    const second = bucketFixture()
    await Promise.all([
      withBlobBucket(first.bucket, async () => { await Promise.resolve(); await putObject('archive/first', 'one') }),
      withBlobBucket(second.bucket, async () => { await Promise.resolve(); await putObject('archive/second', 'two') }),
    ])
    expect([...first.objects.keys()]).toEqual(['archive/first'])
    expect([...second.objects.keys()]).toEqual(['archive/second'])
  })
})
