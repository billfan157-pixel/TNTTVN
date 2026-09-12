import { useRef } from 'react'
import { newIdempotencyKey } from '../lib/api/core'

/**
 * Stable idempotency keys per form. Retrying the same payload reuses the key
 * so the server dedups (replay instead of duplicate); a changed payload or a
 * successful submit releases it for a fresh key. Same pattern as the template
 * panel's keyForPayload, shared so panels and pages behave identically.
 */
export function useStableCommandKey() {
  const keys = useRef(new Map<string, { fingerprint: string; key: string }>())
  const stableKey = (form: string, payload: unknown): string => {
    const fingerprint = JSON.stringify(payload)
    const current = keys.current.get(form)
    if (current && current.fingerprint === fingerprint) return current.key
    const fresh = { fingerprint, key: newIdempotencyKey() }
    keys.current.set(form, fresh)
    return fresh.key
  }
  const releaseKey = (form: string) => {
    keys.current.delete(form)
  }
  return { stableKey, releaseKey }
}
