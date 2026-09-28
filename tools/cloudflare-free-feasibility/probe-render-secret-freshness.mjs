// Read-only comparison of an older ignored local OPS token with live Render.
// A match does not establish that the other Render secrets are still current.
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../.render-env-paste.txt', import.meta.url), 'utf8').replace(/^\uFEFF/, '')
const values = new Map(source.split(/\r?\n/).map(line => {
  const separator = line.indexOf('=')
  return separator > 0 ? [line.slice(0, separator), line.slice(separator + 1)] : null
}).filter(Boolean))
if (!values.get('OPS_TOKEN') || values.get('OPS_TOKEN').length < 32) throw new Error('Old local OPS token unavailable')
const response = await fetch('https://tnttvn.onrender.com/ready', {
  headers: { authorization: `Bearer ${values.get('OPS_TOKEN')}` }, signal: AbortSignal.timeout(60_000),
})
process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(),
  oldLocalOpsTokenAccepted: response.status === 200, httpStatus: response.status })}\n`)
