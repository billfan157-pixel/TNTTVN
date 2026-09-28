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
import { DEFAULT_WINDOW_MINUTES, assertWindowMinutes, parseTailRecords, tailRecordText, tailWorkerWindow } from './wranglerTailWindow.mjs'

export const RETRY_MARKER = 'PASSWORD_CPU_RETRY'

export { parseTailRecords }

/** Summarise retry events. Unknown shapes are counted, never trusted silently. */
export function summariseRetries(records, marker = RETRY_MARKER) {
  const reasons = {}
  const scripts = new Set()
  let events = 0
  for (const record of records) {
    const line = tailRecordText(record)
    if (!line.includes(marker)) continue
    events += 1
    if (record?.scriptName) scripts.add(record.scriptName)
    const reason = /"reason"\s*:\s*"([a-z-]+)"/.exec(line)?.[1] ?? 'unclassified'
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
    const result = detectPasswordCpuRetries({ text: window.text })
    process.stdout.write(`${JSON.stringify({ ...result, watched: true, windowMinutes: minutes,
      endedBy: window.endedBy, records: window.records.length, checkedAt: window.checkedAt })}\n`)
    if (result.detected) process.exitCode = 2
  }
}
