import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectWorkerIncidents, summariseIncidents } from './detect-worker-incidents.mjs'
import { parseTailRecords } from './wranglerTailWindow.mjs'

function tailRecord({ scriptName = 'catevia-api', outcome = 'ok', message }) {
  return JSON.stringify({ scriptName, outcome, message, logs: [{ message, level: 'error' }] }, null, 2)
}

test('groups a failed maintenance job by marker and kind', () => {
  const stream = [
    tailRecord({ message: JSON.stringify({ type: 'MAINTENANCE_JOB_FAILED', kind: 'backup', errorClass: 'Error' }) }),
    tailRecord({ message: JSON.stringify({ type: 'MAINTENANCE_JOB_FAILED', kind: 'backup', errorClass: 'Error' }) }),
    tailRecord({ message: JSON.stringify({ type: 'MAINTENANCE_JOB_FAILED', kind: 'notification', errorClass: 'Error' }) }),
  ].join('\n')
  const result = detectWorkerIncidents({ text: stream })
  assert.equal(result.detected, true)
  assert.equal(result.events, 3)
  assert.deepEqual(result.byMarker, { MAINTENANCE_JOB_FAILED: 3 })
  assert.deepEqual(result.maintenanceKinds, { backup: 2, notification: 1 })
})

test('counts backup probe and verify failures', () => {
  const stream = [
    tailRecord({ message: JSON.stringify({ type: 'PRECUTOVER_BACKUP_FAILED', errorClass: 'Error' }) }),
    tailRecord({ message: JSON.stringify({ type: 'PRECUTOVER_BACKUP_VERIFY_FAILED', errorClass: 'Error' }) }),
  ].join('\n')
  const result = detectWorkerIncidents({ text: stream })
  assert.equal(result.detected, true)
  assert.equal(result.events, 2)
  assert.deepEqual(result.byMarker, {
    PRECUTOVER_BACKUP_FAILED: 1,
    PRECUTOVER_BACKUP_VERIFY_FAILED: 1,
  })
})

test('retains failure records containing escaped quotes and JSON braces', () => {
  const message = JSON.stringify({ type: 'MAINTENANCE_JOB_FAILED', kind: 'backup', detail: 'provider said "}" with \\ escapes' })
  const text = JSON.stringify({ scriptName: 'catevia-api', diagnostic: 'provider said "}"', logs: [{ message }] }, null, 2)
  assert.deepEqual(parseTailRecords(text), [JSON.parse(text)])
  const result = detectWorkerIncidents({ text })
  assert.equal(result.events, 1)
  assert.deepEqual(result.maintenanceKinds, { backup: 1 })
})

test('alerts when an operator drain fails before rollback', () => {
  const result = detectWorkerIncidents({ text: tailRecord({ message: JSON.stringify({ type: 'MAINTENANCE_CONTROL_FAILED' }) }) })
  assert.equal(result.detected, true)
  assert.deepEqual(result.byMarker, { MAINTENANCE_CONTROL_FAILED: 1 })
})

test('treats an uncaught Worker exception as an incident even without a marker', () => {
  const result = detectWorkerIncidents({ text: tailRecord({ outcome: 'exception', message: 'internal' }) })
  assert.equal(result.detected, true)
  assert.equal(result.events, 0)
  assert.equal(result.exceptions, 1)
})

test('stays silent on a healthy window', () => {
  const result = detectWorkerIncidents({ text: tailRecord({ message: JSON.stringify({ type: 'MAINTENANCE_JOB_OK', kind: 'backup' }) }) })
  assert.equal(result.detected, false)
  assert.equal(result.events, 0)
  assert.equal(result.exceptions, 0)
})

test('never drops a marker line it cannot classify', () => {
  const summary = summariseIncidents([{ scriptName: 'catevia-api', message: 'MAINTENANCE_JOB_FAILED' }])
  assert.equal(summary.events, 1)
  assert.deepEqual(summary.maintenanceKinds, {})
  assert.deepEqual(summary.scripts, ['catevia-api'])
})
