// Detects production Worker incidents that the password retry alert cannot see.
//
// After cutover the Durable Objects own every scheduled writer, so a silent
// maintenance or backup failure is a data-integrity incident, not a noisy log line.
// Each marker below is emitted by the Worker itself:
//
//   MAINTENANCE_JOB_FAILED             server/src/cloudflare/maintenanceJob.js
//   PRECUTOVER_BACKUP_FAILED           server/src/cloudflare/entry.js
//   PRECUTOVER_BACKUP_VERIFY_FAILED    server/src/cloudflare/entry.js
//
// An uncaught Worker exception is counted as well: wrangler tail reports the
// request outcome, so `exception` is the only available proof that a 5xx escaped
// without a structured marker.
//
// Coverage is the same bounded live window as the password alert, and the exit
// codes match it: 0 = watched and clean, 1 = the watcher itself failed, 2 = an
// incident was observed.
import { DEFAULT_WINDOW_MINUTES, assertWindowMinutes, parseTailRecords, tailRecordText, tailWorkerWindow } from './wranglerTailWindow.mjs'

export const INCIDENT_MARKERS = Object.freeze([
  'MAINTENANCE_JOB_FAILED',
  'MAINTENANCE_CONTROL_FAILED',
  'PRECUTOVER_BACKUP_FAILED',
  'PRECUTOVER_BACKUP_VERIFY_FAILED',
])
export const EXCEPTION_OUTCOMES = Object.freeze(['exception'])

/** Group incidents by marker, maintenance kind, and script. Unknown shapes are never dropped. */
export function summariseIncidents(records, { markers = INCIDENT_MARKERS, exceptionOutcomes = EXCEPTION_OUTCOMES } = {}) {
  const byMarker = {}
  const maintenanceKinds = {}
  const scripts = new Set()
  let exceptions = 0
  for (const record of records) {
    if (record?.scriptName) scripts.add(record.scriptName)
    if (exceptionOutcomes.includes(record?.outcome)) exceptions += 1
    // Wrangler nests the Worker's own log line inside `message` and `logs`, where
    // its JSON is already parsed. Re-serialising the whole record would re-escape
    // those quotes and hide the fields this summary has to group by.
    const text = tailRecordText(record)
    for (const marker of markers) {
      if (!text.includes(marker)) continue
      byMarker[marker] = (byMarker[marker] ?? 0) + 1
      const kind = /"kind"\s*:\s*"([a-z-]+)"/.exec(text)?.[1]
      if (kind) maintenanceKinds[kind] = (maintenanceKinds[kind] ?? 0) + 1
    }
  }
  const events = Object.values(byMarker).reduce((total, count) => total + count, 0)
  return { events, byMarker, maintenanceKinds, exceptions, scripts: [...scripts].sort() }
}

export function detectWorkerIncidents({ text, ...options } = {}) {
  const summary = summariseIncidents(parseTailRecords(text ?? ''), options)
  return { ...summary, detected: summary.events > 0 || summary.exceptions > 0 }
}

if (process.argv[1]?.endsWith('detect-worker-incidents.mjs')) {
  const minutes = Number(process.argv[2] ?? DEFAULT_WINDOW_MINUTES)
  assertWindowMinutes(minutes)
  const window = await tailWorkerWindow({ minutes })

  if (!window.watched) {
    process.stderr.write(`${JSON.stringify({
      watched: false, reason: 'tail did not run cleanly', exitCode: window.exitCode,
      signal: window.signal, diagnostics: window.diagnostics,
    })}\n`)
    process.exitCode = 1
  } else {
    const result = detectWorkerIncidents({ text: window.text })
    process.stdout.write(`${JSON.stringify({ ...result, watched: true, windowMinutes: minutes,
      endedBy: window.endedBy, records: window.records.length, checkedAt: window.checkedAt })}\n`)
    if (result.detected) process.exitCode = 2
  }
}
