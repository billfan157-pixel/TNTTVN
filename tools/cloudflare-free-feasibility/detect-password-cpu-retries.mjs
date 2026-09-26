// Detects PASSWORD_CPU_RETRY events in the production Worker log stream.
//
// Why this exists: the Durable Object code-update reset behind the 2026-09-24
// intermittent HTTP 500 cannot be reproduced on demand, so the only way to capture
// proof that the bounded retry fired is to watch the stream the retry logs into.
// server/src/utils/passwordCompute.ts emits one PASSWORD_CPU_RETRY line per retry.
//
// Coverage: wrangler tail is a live stream, so this sees the window it runs in, not
// history. The alert workflow runs it on a schedule to bound the gap. The Cloudflare
// Observability query API would remove the gap but its request body could not be
// verified here, because the production CLOUDFLARE_API_TOKEN value is not readable
// from a workstation.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const RETRY_MARKER = 'PASSWORD_CPU_RETRY'
const WRANGLER_ENTRY = './node_modules/wrangler/bin/wrangler.js'

/** Parse Wrangler's JSON event stream, which is pretty-printed rather than line-delimited. */
export function parseTailRecords(text) {
  const records = []
  let depth = 0
  let buffer = ''
  let inString = false
  let escaped = false
  for (const char of text) {
    if (depth === 0) {
      if (char === '{') { depth = 1; buffer = '{'; inString = false; escaped = false }
      continue
    }
    buffer += char
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try { records.push(JSON.parse(buffer)) } catch { /* Wrangler prints non-JSON status lines too */ }
      }
    }
  }
  return records
}

/** Summarise retry events. Unknown shapes are counted, never trusted silently. */
export function summariseRetries(records, marker = RETRY_MARKER) {
  const reasons = {}
  const scripts = new Set()
  let events = 0
  for (const record of records) {
    const line = JSON.stringify(record)
    if (!line.includes(marker)) continue
    events += 1
    if (record?.scriptName) scripts.add(record.scriptName)
    const text = (record?.message ?? record?.source ?? line)
    const reason = /"reason"\s*:\s*"([a-z-]+)"/.exec(typeof text === 'string' ? text : line)?.[1] ?? 'unclassified'
    reasons[reason] = (reasons[reason] ?? 0) + 1
  }
  return { events, reasons, scripts: [...scripts].sort() }
}

export function detectPasswordCpuRetries({ text, marker } = {}) {
  const records = parseTailRecords(text ?? '')
  const summary = summariseRetries(records, marker)
  return { ...summary, detected: summary.events > 0 }
}

if (process.argv[1]?.endsWith('detect-password-cpu-retries.mjs')) {
  const minutes = Number(process.argv[2] ?? 25)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 55) {
    throw new Error('Window must be 1-55 whole minutes')
  }
  const child = spawn(process.execPath, [WRANGLER_ENTRY, 'tail', '--config',
    'wrangler-catevia-production.jsonc', '--format', 'json'],
  // fileURLToPath, not URL.pathname: the latter yields /C:/... on Windows and spawn
  // fails with a bare ENOENT.
  { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'] })

  const spawnFailure = new Promise((_, reject) => {
    child.on('error', reject)
  })
  let collected = ''
  let diagnostics = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => { collected += chunk })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => { diagnostics += chunk })

  const stop = setTimeout(() => child.kill('SIGTERM'), minutes * 60_000)
  const closed = new Promise(resolve => child.on('close', (code, signal) => resolve({ code, signal })))
  const { code: exitCode, signal } = await Promise.race([closed, spawnFailure])
  clearTimeout(stop)

  // A windowed tail ends by being terminated, so a SIGTERM with no exit code is the
  // expected ending rather than a failure.
  const terminatedByWindow = exitCode === null && signal === 'SIGTERM'
  const cleanExit = exitCode === 0 || terminatedByWindow

  // Silence must mean "watched and saw nothing". A watcher that failed to start would
  // otherwise report no retries, which is exactly the false negative an alert needs to
  // avoid.
  if (!cleanExit || /(^|\W)(ERROR|Error:)(\W|$)/.test(diagnostics)) {
    process.stderr.write(`${JSON.stringify({
      watched: false, reason: 'tail did not run cleanly', exitCode, signal,
      diagnostics: diagnostics.trim().slice(0, 400),
    })}\n`)
    process.exitCode = 1
  } else {
    const result = detectPasswordCpuRetries({ text: collected })
    process.stdout.write(`${JSON.stringify({ ...result, watched: true, windowMinutes: minutes,
      endedBy: terminatedByWindow ? 'window' : 'stream-closed',
      records: parseTailRecords(collected).length, checkedAt: new Date().toISOString() })}\n`)
    if (result.detected) process.exitCode = 2
  }
}
