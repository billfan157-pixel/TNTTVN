import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSafetyBackupDir, tryChmod600 } from '../utils/safetyDir.js'
import { isCloudflareWorkerRuntime } from '../utils/cloudflareRuntime.js'

/**
 * ADR-041 (2026-08-15): abstraction lưu trữ blob (backup + safety snapshot).
 *
 * Backend được chọn bởi env:
 * - Nếu `R2_ENDPOINT` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` + `R2_BUCKET`
 *   đầy đủ → backend Cloudflare R2 (S3-compatible).
 * - Ngược lại → backend local filesystem (giữ nguyên behavior cũ, đảm bảo test xanh).
 *
 * Quy ước key prefix:
 * - `safety/...`   → local: getSafetyBackupDir()  (chứa PII → chmod 0600)
 * - `backups/...`  → local: getBackupDir()        (full DB, chứa PII → chmod 0600,
 *                                                   NEW-F-02 AUDIT04-unknowns closure)
 * - khác           → local: BLOB_LOCAL_DIR (mặc định cwd/blobs)
 */

export interface StoredObject {
  key: string
  size?: number
  lastModified?: number
}

/** The R2 methods used by Catevia; the binding itself is supplied per request. */
export interface BlobBucket {
  put(key: string, body: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown | null>
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string; size: number; uploaded: Date }[]
    truncated: boolean
    cursor?: string
  }>
  delete(key: string): Promise<void>
}

const blobBucketContext = new AsyncLocalStorage<BlobBucket | null>()

export function withBlobBucket<T>(bucket: BlobBucket | undefined, run: () => Promise<T>): Promise<T> {
  return blobBucketContext.run(bucket ?? null, run)
}

function workerBucket(): BlobBucket {
  const bucket = blobBucketContext.getStore()
  if (!bucket) throw new Error('BLOB_BUCKET binding is required in the Cloudflare Worker runtime')
  return bucket
}

export function hasDurableBlobStorage(): boolean {
  return isCloudflareWorkerRuntime() ? Boolean(blobBucketContext.getStore()) : isR2Enabled
}

let s3: S3Client | null = null
let r2Bucket: string | null = null

/**
 * Objects that hold full parish PII at rest. On local filesystems both the temp
 * write and the final file get mode 0600 (no-op on platforms without POSIX modes).
 */
function isPrivatePiiKey(key: string): boolean {
  return key.startsWith('safety/') || key.startsWith('backups/')
}

function getBackupDir(): string {
  return process.env.BACKUP_DIR || path.join(process.cwd(), 'backups')
}

function resolveLocalPath(key: string): string {
  if (key.startsWith('safety/')) {
    return path.join(getSafetyBackupDir(), key.slice('safety/'.length))
  }
  if (key.startsWith('backups/')) {
    return path.join(getBackupDir(), key.slice('backups/'.length))
  }
  return path.join(process.env.BLOB_LOCAL_DIR || path.join(process.cwd(), 'blobs'), key)
}

function initR2(): boolean {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (endpoint && accessKeyId && secretAccessKey && bucket) {
    s3 = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    })
    r2Bucket = bucket
    return true
  }
  return false
}

export const isR2Enabled = initR2()

/** Windows can transiently EPERM/EBUSY a rename while AV/indexer still holds the fresh file. */
async function renameWithRetry(from: string, to: string, attempts = 4): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to)
      return
    } catch (err: any) {
      const transient = err?.code === 'EPERM' || err?.code === 'EBUSY' || err?.code === 'EACCES'
      if (!transient || attempt >= attempts - 1) throw err
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt))
    }
  }
}

export async function putObject(
  key: string,
  body: Buffer | string,
  contentType = 'application/octet-stream',
): Promise<void> {
  const buf = typeof body === 'string' ? Buffer.from(body, 'utf-8') : body

  if (isCloudflareWorkerRuntime()) {
    const stored = await workerBucket().put(key, buf, { httpMetadata: { contentType } })
    if (!stored) throw new Error('R2 refused to store object')
    return
  }

  if (s3 && r2Bucket) {
    await s3.send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: key,
        Body: buf,
        ContentType: contentType,
      }),
    )
    return
  }

  const filePath = resolveLocalPath(key)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  // DR-P2-002: a failed or interrupted write must never leave corrupted bytes
  // under the final key. Write to a unique temp file in the same directory and
  // rename onto the final name; readers only ever see a complete object.
  const tempPath = `${filePath}.tmp-${randomUUID()}`
  try {
    fs.writeFileSync(tempPath, buf, isPrivatePiiKey(key) ? { mode: 0o600 } : undefined)
    if (isPrivatePiiKey(key)) tryChmod600(tempPath)
    await renameWithRetry(tempPath, filePath)
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    } catch (cleanupErr) {
      console.warn(`[BLOB WARNING] Failed to remove incomplete object ${tempPath}:`, cleanupErr)
    }
    throw err
  }
  if (isPrivatePiiKey(key)) tryChmod600(filePath)
}

export async function getObject(key: string): Promise<Buffer | null> {
  if (isCloudflareWorkerRuntime()) {
    const object = await workerBucket().get(key)
    return object ? Buffer.from(await object.arrayBuffer()) : null
  }
  if (s3 && r2Bucket) {
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: r2Bucket, Key: key }))
      if (!res.Body) return null
      const bytes = await res.Body.transformToByteArray()
      return Buffer.from(bytes)
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null
      throw err
    }
  }

  const filePath = resolveLocalPath(key)
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath)
}

export async function listObjects(prefix: string): Promise<StoredObject[]> {
  if (isCloudflareWorkerRuntime()) {
    const bucket = workerBucket()
    const objects: StoredObject[] = []
    const seenCursors = new Set<string>()
    let cursor: string | undefined
    for (;;) {
      const page = await bucket.list({ prefix, ...(cursor ? { cursor } : {}) })
      objects.push(...page.objects.map(object => ({
        key: object.key,
        size: object.size,
        lastModified: object.uploaded.getTime(),
      })))
      if (!page.truncated) return objects
      if (!page.cursor || seenCursors.has(page.cursor)) throw new Error('R2 listing returned an invalid cursor')
      seenCursors.add(page.cursor)
      cursor = page.cursor
    }
  }
  if (s3 && r2Bucket) {
    const out: StoredObject[] = []
    let continuation: string | undefined
    do {
      const res = await s3.send(
        new ListObjectsV2Command({
          Bucket: r2Bucket,
          Prefix: prefix,
          ContinuationToken: continuation,
        }),
      )
      for (const obj of res.Contents ?? []) {
        out.push({
          key: obj.Key!,
          size: obj.Size,
          lastModified: obj.LastModified ? obj.LastModified.getTime() : undefined,
        })
      }
      continuation = res.IsTruncated ? res.NextContinuationToken : undefined
    } while (continuation)
    return out
  }

  const dirPrefix = prefix.startsWith('safety/')
    ? getSafetyBackupDir()
    : prefix.startsWith('backups/')
      ? getBackupDir()
      : process.env.BLOB_LOCAL_DIR || path.join(process.cwd(), 'blobs')
  if (!fs.existsSync(dirPrefix)) return []
  const objects: StoredObject[] = []
  const walk = (directory: string, relative: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.includes('.tmp-') || entry.name.includes('.partial-')) continue
      const absolute = path.join(directory, entry.name)
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(absolute, childRelative)
        continue
      }
      if (!entry.isFile()) continue
      const stat = fs.statSync(absolute)
      objects.push({ key: `${prefix}${childRelative}`, size: stat.size, lastModified: stat.mtimeMs })
    }
  }
  walk(dirPrefix, '')
  return objects
}

export async function deleteObject(key: string): Promise<void> {
  if (isCloudflareWorkerRuntime()) {
    await workerBucket().delete(key)
    return
  }
  if (s3 && r2Bucket) {
    await s3.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: key }))
    return
  }
  const filePath = resolveLocalPath(key)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}
