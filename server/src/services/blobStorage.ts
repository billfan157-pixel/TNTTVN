import fs from 'fs'
import path from 'path'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSafetyBackupDir, tryChmod600 } from '../utils/safetyDir.js'

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
 * - `backups/...`  → local: getBackupDir()
 * - khác           → local: BLOB_LOCAL_DIR (mặc định cwd/blobs)
 */

export interface StoredObject {
  key: string
  size?: number
  lastModified?: number
}

let s3: S3Client | null = null
let r2Bucket: string | null = null

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

export async function putObject(
  key: string,
  body: Buffer | string,
  contentType = 'application/octet-stream',
): Promise<void> {
  const buf = typeof body === 'string' ? Buffer.from(body, 'utf-8') : body

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
  fs.writeFileSync(filePath, buf)
  if (key.startsWith('safety/')) tryChmod600(filePath)
}

export async function getObject(key: string): Promise<Buffer | null> {
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
  return fs.readdirSync(dirPrefix).map((name) => {
    const p = path.join(dirPrefix, name)
    const st = fs.statSync(p)
    return { key: `${prefix}${name}`, size: st.size, lastModified: st.mtimeMs }
  })
}

export async function deleteObject(key: string): Promise<void> {
  if (s3 && r2Bucket) {
    await s3.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: key }))
    return
  }
  const filePath = resolveLocalPath(key)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}
