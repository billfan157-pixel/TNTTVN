import { describe, expect, it } from 'vitest'
import { decideContinuousScanRollout, tripContinuousScanCircuit } from '../examContinuousRollout'

const scope = { parishId: 'PARISH-1', userId: 'USER-1' }

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

describe('continuous scan pilot rollout', () => {
  it('fail closed khi pilot chưa có scope/allowlist', () => {
    expect(decideContinuousScanRollout(null, {}, null).reason).toBe('pilot_scope_missing')
    expect(decideContinuousScanRollout(scope, {}, null).reason).toBe('not_allowlisted')
  })

  it('chỉ bật cho parish hoặc user được allowlist rõ ràng', () => {
    const storage = memoryStorage()
    expect(decideContinuousScanRollout(scope, { parishAllowlist: 'PARISH-1' }, storage)).toEqual({ enabled: true, reason: 'enabled' })
    expect(decideContinuousScanRollout(scope, { userAllowlist: 'USER-1' }, storage)).toEqual({ enabled: true, reason: 'enabled' })
    expect(decideContinuousScanRollout(scope, { parishAllowlist: 'PARISH-1' }, null).reason).toBe('circuit_storage_unavailable')
  })

  it('feature flag và circuit breaker luôn thắng allowlist', () => {
    const storage = memoryStorage()
    expect(decideContinuousScanRollout(scope, { featureFlag: 'off', parishAllowlist: 'PARISH-1' }, storage).reason).toBe('feature_disabled')
    expect(tripContinuousScanCircuit(scope, 'durable_write_failure', '7', storage)).toBe(true)
    expect(decideContinuousScanRollout(scope, { parishAllowlist: 'PARISH-1', revision: '7' }, storage)).toMatchObject({
      enabled: false,
      reason: 'circuit_open',
      circuitReason: 'durable_write_failure',
    })
    expect(decideContinuousScanRollout(scope, { parishAllowlist: 'PARISH-1', revision: '8' }, storage).reason).toBe('enabled')
    expect(JSON.stringify([...storage.values])).not.toContain('PARISH-1')
    expect(JSON.stringify([...storage.values])).not.toContain('USER-1')
  })
})
