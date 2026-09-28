import assert from 'node:assert/strict'
import test from 'node:test'
import {
  APNS_SECRETS, CORE_SECRETS, FCM_SECRET, WEB_PUSH_SECRETS,
  evaluateProductionSecretInventory, selectProductionSecretUploadKeys,
} from './production-secret-policy.mjs'

const webOnly = [...CORE_SECRETS, ...WEB_PUSH_SECRETS]

test('a web-only deployment does not require unused native push credentials', () => {
  assert.deepEqual(evaluateProductionSecretInventory(webOnly), {
    ok: true, required: webOnly.length, missing: [], incompleteNative: [],
    nativeConfigured: { android: false, ios: false },
  })
  const values = new Map(webOnly.map(key => [key, 'fixture']))
  assert.deepEqual(selectProductionSecretUploadKeys(values, true), WEB_PUSH_SECRETS)
})

test('the Web Push key pair remains mandatory', () => {
  const result = evaluateProductionSecretInventory(webOnly.filter(key => key !== 'VAPID_PRIVATE_KEY'))
  assert.equal(result.ok, false)
  assert.deepEqual(result.missing, ['VAPID_PRIVATE_KEY'])
})

test('a partially configured APNs provider blocks cutover and upload', () => {
  const result = evaluateProductionSecretInventory([...webOnly, APNS_SECRETS[0]])
  assert.equal(result.ok, false)
  assert.deepEqual(result.incompleteNative, APNS_SECRETS.slice(1))
  const values = new Map([...webOnly, APNS_SECRETS[0]].map(key => [key, 'fixture']))
  assert.throws(() => selectProductionSecretUploadKeys(values, true), /Incomplete APNs/)
})

test('complete native providers are selected only when supplied', () => {
  const names = [...webOnly, FCM_SECRET, ...APNS_SECRETS]
  assert.equal(evaluateProductionSecretInventory(names).ok, true)
  assert.deepEqual(evaluateProductionSecretInventory(names).nativeConfigured, { android: true, ios: true })
  const values = new Map(names.map(key => [key, 'fixture']))
  assert.deepEqual(selectProductionSecretUploadKeys(values, true), [...WEB_PUSH_SECRETS, FCM_SECRET, ...APNS_SECRETS])
  values.set(FCM_SECRET, '')
  assert.throws(() => selectProductionSecretUploadKeys(values, true), /Empty optional production secret/)
})
