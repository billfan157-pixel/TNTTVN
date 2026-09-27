// Shared Wrangler tail window used by the production Worker alert detectors.
//
// wrangler tail is a live stream, not a queryable history: each run only sees the
// window it keeps open. Every detector therefore has to fail loudly when the tail
// itself did not run, because "watched nothing" and "watched nothing because the
// watcher was broken" look identical in the exit code otherwise.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const WRANGLER_ENTRY = './node_modules/wrangler/bin/wrangler.js'
export const DEFAULT_WINDOW_MINUTES = 25

export function assertWindowMinutes(minutes) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 55) {
    throw new Error('Window must be 1-55 whole minutes')
  }
}

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

// Wrangler log.message is commonly an array of the strings passed to console.log.
// Preserve those strings instead of JSON-escaping them a second time.
export function tailRecordText(record) {
  const strings = value => typeof value === 'string' ? [value]
    : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []
  return strings(record).join('\n')
}

/**
 * Tail the production Worker for a bounded window.
 *
 * Returns the parsed records plus whether the watcher itself was healthy, so a
 * detector can never report a clean window it did not actually observe.
 */
export async function tailWorkerWindow({ minutes = DEFAULT_WINDOW_MINUTES, config = 'wrangler-catevia-production.jsonc' } = {}) {
  assertWindowMinutes(minutes)
  const child = spawn(process.execPath, [WRANGLER_ENTRY, 'tail', '--config', config, '--format', 'json'],
    // fileURLToPath, not URL.pathname: the latter yields /C:/... on Windows and spawn
    // fails with a bare ENOENT.
    { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'] })

  const spawnFailure = new Promise((_, reject) => { child.on('error', reject) })
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
  const watched = cleanExit && !/(^|\W)(ERROR|Error:)(\W|$)/.test(diagnostics)

  return {
    watched,
    text: collected,
    records: parseTailRecords(collected),
    diagnostics: diagnostics.trim().slice(0, 400),
    exitCode,
    signal,
    endedBy: terminatedByWindow ? 'window' : 'stream-closed',
    windowMinutes: minutes,
    checkedAt: new Date().toISOString(),
  }
}
