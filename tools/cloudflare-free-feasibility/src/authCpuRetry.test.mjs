import assert from 'node:assert/strict'
import { test } from 'node:test'
import { measureBcryptWithRetry } from './authCpuRetry.js'

test('recreates the stub once after a code update reset', async () => {
  const stubs = [
    { measureBcrypt: async () => { throw new Error('Durable Object reset because its code was updated.') } },
    { measureBcrypt: async () => ({ matched: true, bcryptCost: 12 }) },
  ]
  let calls = 0
  const namespace = { getByName: name => {
    assert.equal(name, 'synthetic-user')
    return stubs[calls++]
  } }
  let waited = false
  const result = await measureBcryptWithRetry(namespace, 'synthetic-user', async ms => {
    assert.ok(ms >= 50 && ms < 75)
    waited = true
  })
  assert.deepEqual(result, { matched: true, bcryptCost: 12 })
  assert.equal(calls, 2)
  assert.equal(waited, true)
})

test('does not retry overload or arbitrary failures', async () => {
  for (const error of [Object.assign(new Error('busy'), { retryable: true, overloaded: true }), new Error('bad input')]) {
    let calls = 0
    const namespace = { getByName: () => {
      calls++
      return { measureBcrypt: async () => { throw error } }
    } }
    await assert.rejects(measureBcryptWithRetry(namespace, 'synthetic-user', async () => { throw new Error('unexpected wait') }), error)
    assert.equal(calls, 1)
  }
})

test('stops after one retry of a retryable error', async () => {
  let calls = 0
  const error = Object.assign(new Error('transient'), { retryable: true })
  const namespace = { getByName: () => {
    calls++
    return { measureBcrypt: async () => { throw error } }
  } }
  await assert.rejects(measureBcryptWithRetry(namespace, 'synthetic-user', async () => {}), error)
  assert.equal(calls, 2)
})
