import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectPasswordCpuRetries, parseTailRecords, summariseRetries, RETRY_MARKER } from './detect-password-cpu-retries.mjs'

function tailRecord({ scriptName = 'catevia-api', message }) {
  return JSON.stringify({
    scriptName,
    outcome: 'ok',
    logs: [{ message, level: 'log' }],
    message,
  }, null, 2)
}

test('parses the pretty-printed Wrangler stream that line splitting would break', () => {
  const text = `Subscribed to updates\n${tailRecord({ message: 'first' })}\n${tailRecord({ message: 'second' })}\n`
  const records = parseTailRecords(text)
  assert.equal(records.length, 2)
  assert.equal(records[0].message, 'first')
  assert.equal(records[1].message, 'second')
})

test('counts retry events grouped by reason and script', () => {
  const stream = [
    tailRecord({ message: JSON.stringify({ type: 'PASSWORD_CPU_RETRY', reason: 'code-update-reset' }) }),
    tailRecord({ message: JSON.stringify({ type: 'PASSWORD_CPU_RETRY', reason: 'code-update-reset' }) }),
    tailRecord({ message: JSON.stringify({ type: 'PASSWORD_CPU_RETRY', reason: 'retryable-rpc' }) }),
    tailRecord({ message: 'unrelated log line' }),
  ].join('\n')
  const result = detectPasswordCpuRetries({ text: stream })
  assert.equal(result.detected, true)
  assert.equal(result.events, 3)
  assert.deepEqual(result.reasons, { 'code-update-reset': 2, 'retryable-rpc': 1 })
  assert.deepEqual(result.scripts, ['catevia-api'])
})

test('stays silent on a stream with no retry events', () => {
  const result = detectPasswordCpuRetries({ text: tailRecord({ message: 'boot ok' }) })
  assert.equal(result.detected, false)
  assert.equal(result.events, 0)
  assert.deepEqual(result.reasons, {})
})

test('classifies an unparsable retry line instead of dropping it', () => {
  const summary = summariseRetries([{ message: `${RETRY_MARKER} without json`, scriptName: 'catevia-api' }])
  assert.equal(summary.events, 1)
  assert.deepEqual(summary.reasons, { unclassified: 1 })
})

test('does not treat an unrelated Worker script as a Catevia retry', () => {
  const summary = summariseRetries([{ scriptName: 'other-worker', message: `${RETRY_MARKER} reason: retryable-rpc` }])
  assert.equal(summary.events, 1)
  assert.deepEqual(summary.scripts, ['other-worker'])
})
