import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const bucket = 'catevia-cf-backup-probe-20260924';
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
if (![accountId, accessKeyId, secretAccessKey].every(Boolean)) {
  throw new Error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY in the process environment.');
}

const host = `${accountId}.r2.cloudflarestorage.com`;
const objectKey = `probes/restore-fixture-${new Date().toISOString().slice(0, 10)}-${randomBytes(4).toString('hex')}.enc`;
const url = `https://${host}/${bucket}/${objectKey}`;
const plaintext = Buffer.from(JSON.stringify({
  fixture: 'catevia-r2-restore-probe',
  kind: 'synthetic-only',
  rows: [{ id: 'probe-001', value: 'roundtrip' }],
}));
const key = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const blob = Buffer.concat([Buffer.from('CVR2'), iv, cipher.getAuthTag(), ciphertext]);

function hmac(secret, data, encoding) {
  return createHmac('sha256', secret).update(data).digest(encoding);
}

function signRequest(method, body) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = createHash('sha256').update(body).digest('hex');
  const canonicalHeaders = `content-type:application/octet-stream\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, `/${bucket}/${objectKey}`, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const dateKey = hmac(`AWS4${secretAccessKey}`, date);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  return {
    'content-type': 'application/octet-stream',
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

const put = await fetch(url, { method: 'PUT', headers: signRequest('PUT', blob), body: blob });
if (!put.ok) throw new Error(`R2 PUT failed (${put.status}): ${(await put.text()).slice(0, 300)}`);

const get = await fetch(url, { method: 'GET', headers: signRequest('GET', Buffer.alloc(0)) });
if (!get.ok) throw new Error(`R2 GET failed (${get.status}): ${(await get.text()).slice(0, 300)}`);
const restoredBlob = Buffer.from(await get.arrayBuffer());
if (restoredBlob.length < 32 || restoredBlob.toString('ascii', 0, 4) !== 'CVR2') throw new Error('Downloaded object has an invalid encrypted fixture envelope.');
const restoredIv = restoredBlob.subarray(4, 16);
const restoredTag = restoredBlob.subarray(16, 32);
const decipher = createDecipheriv('aes-256-gcm', key, restoredIv);
decipher.setAuthTag(restoredTag);
const restoredPlaintext = Buffer.concat([decipher.update(restoredBlob.subarray(32)), decipher.final()]);
if (restoredPlaintext.length !== plaintext.length || !timingSafeEqual(restoredPlaintext, plaintext)) {
  throw new Error('R2 restored plaintext does not match the in-memory synthetic fixture.');
}

console.log(JSON.stringify({
  result: 'PASS',
  bucket,
  objectKey,
  storageClass: 'Standard',
  encryption: 'AES-256-GCM, key generated in memory and never uploaded',
  plaintextBytes: plaintext.length,
  storedBytes: blob.length,
  uploadedSha256: createHash('sha256').update(blob).digest('hex'),
  downloadedSha256: createHash('sha256').update(restoredBlob).digest('hex'),
  uploadStatus: put.status,
  downloadStatus: get.status,
  decryptAndCompare: 'PASS',
  objectRetainedForInspection: true,
}));
