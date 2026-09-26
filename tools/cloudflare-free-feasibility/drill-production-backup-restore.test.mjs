import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateRestoreInputs } from './drill-production-backup-restore.mjs'

const valid = {
  R2_ENDPOINT: 'https://abc123.r2.cloudflarestorage.com/',
  R2_BUCKET: 'catevia-production-blobs', R2_ACCESS_KEY_ID: 'test-id',
  R2_SECRET_ACCESS_KEY: 'test-secret', BACKUP_ENCRYPTION_KEY: 'test-key',
  BACKUP_OBJECT_KEY: 'backups/v2/set-2026-09-25T08-04-45-388Z-abc123/manifest.json',
  EXPECTED_SNAPSHOT_CHECKSUM: 'a'.repeat(64), EXPECTED_ROW_COUNT: '5000',
  EXPECTED_ENCRYPTED_BYTES: '268090',
}

test('accepts only an exact production bucket and previously verified object', () => {
  const input = validateRestoreInputs(valid)
  assert.equal(input.rowCount, 5000)
  assert.equal(input.format, 'v2')
  for (const change of [
    { R2_ENDPOINT: 'https://example.com/' }, { R2_BUCKET: 'other-bucket' },
    { BACKUP_OBJECT_KEY: '../other' }, { EXPECTED_SNAPSHOT_CHECKSUM: 'bad' },
    { EXPECTED_ENCRYPTED_BYTES: '999999999' },
  ]) assert.throws(() => validateRestoreInputs({ ...valid, ...change }))
})
