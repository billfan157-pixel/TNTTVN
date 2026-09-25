import { HeadBucketCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { getDbConfig } from '../db/dbConfig.js'

const config = getDbConfig()
if (!config.isRemote) throw new Error('Remote backup preflight requires TURSO_URL')

const required = ['BACKUP_ENCRYPTION_KEY', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
const missing = required.filter(key => !process.env[key]?.trim())
if (missing.length > 0) throw new Error(`Missing remote backup configuration: ${missing.join(',')}`)

const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY!
if (!/^[a-f0-9]{64}$/i.test(encryptionKey)
  && !/^[A-Za-z0-9+/_-]{43}=?$/.test(encryptionKey)) {
  throw new Error('Invalid BACKUP_ENCRYPTION_KEY')
}

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})
const bucket = process.env.R2_BUCKET!
const checks: string[] = []
try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }))
  checks.push('r2-head-bucket')
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'backups/v2/', MaxKeys: 1 }))
  checks.push('r2-list-backups')
  process.stdout.write(`${JSON.stringify({ ok: true, checks, backupObjectsVisible: (listed.Contents ?? []).length })}\n`)
} catch (error: any) {
  process.stderr.write(`${JSON.stringify({ ok: false, checks, errorClass: error?.name || 'UnknownError',
    statusCode: error?.$metadata?.httpStatusCode ?? null })}\n`)
  process.exitCode = 1
}
