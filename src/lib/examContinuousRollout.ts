import type { TenantScope } from './tenantScope'

export type ContinuousScanCircuitReason =
  | 'durable_write_failure'
  | 'idempotency_conflict'
  | 'result_sync_terminal_failure'

export type ContinuousScanRolloutReason =
  | 'feature_disabled'
  | 'pilot_scope_missing'
  | 'not_allowlisted'
  | 'circuit_storage_unavailable'
  | 'circuit_open'
  | 'enabled'

export interface ContinuousScanRolloutConfig {
  featureFlag?: string
  pilotRequired?: string
  parishAllowlist?: string
  userAllowlist?: string
  revision?: string
}

export interface ContinuousScanRolloutDecision {
  enabled: boolean
  reason: ContinuousScanRolloutReason
  circuitReason?: ContinuousScanCircuitReason
}

interface CircuitRecord {
  version: 1
  revision: string
  reason: ContinuousScanCircuitReason
  openedAt: string
}

const CIRCUIT_PREFIX = 'tntt.omr.continuous-circuit.v1'

function flagEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') return defaultValue
  return !['false', 'off', '0', 'no'].includes(value.trim().toLowerCase())
}

function values(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map(value => value.trim()).filter(Boolean))
}

/** Stable non-cryptographic hash used only to avoid raw tenant/user IDs in localStorage keys. */
function scopeHash(scope: TenantScope): string {
  let hash = 0x811c9dc5
  const input = `${scope.parishId}\u001f${scope.userId}`
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function circuitKey(scope: TenantScope): string {
  return `${CIRCUIT_PREFIX}:${scopeHash(scope)}`
}

function readCircuit(
  scope: TenantScope,
  revision: string,
  storage: Pick<Storage, 'getItem'> | null,
): CircuitRecord | null {
  if (!storage) return null
  const raw = storage.getItem(circuitKey(scope))
  if (!raw) return null
  const parsed = JSON.parse(raw) as Partial<CircuitRecord>
  if (parsed.version !== 1 || parsed.revision !== revision || !parsed.reason) return null
  return parsed as CircuitRecord
}

export function decideContinuousScanRollout(
  scope: TenantScope | null,
  config: ContinuousScanRolloutConfig,
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): ContinuousScanRolloutDecision {
  if (!flagEnabled(config.featureFlag, true)) return { enabled: false, reason: 'feature_disabled' }

  const pilotRequired = flagEnabled(config.pilotRequired, true)
  if (pilotRequired) {
    if (!scope) return { enabled: false, reason: 'pilot_scope_missing' }
    const allowed = values(config.parishAllowlist).has(scope.parishId) || values(config.userAllowlist).has(scope.userId)
    if (!allowed) return { enabled: false, reason: 'not_allowlisted' }
  }

  if (!scope) return { enabled: false, reason: 'pilot_scope_missing' }
  if (!storage) return { enabled: false, reason: 'circuit_storage_unavailable' }
  let circuit: CircuitRecord | null
  try {
    circuit = readCircuit(scope, config.revision?.trim() || '1', storage)
  } catch {
    return { enabled: false, reason: 'circuit_storage_unavailable' }
  }
  if (circuit) return { enabled: false, reason: 'circuit_open', circuitReason: circuit.reason }
  return { enabled: true, reason: 'enabled' }
}

export function getConfiguredContinuousScanRolloutDecision(scope: TenantScope | null): ContinuousScanRolloutDecision {
  return decideContinuousScanRollout(scope, {
    featureFlag: import.meta.env.VITE_CONTINUOUS_SCAN_V2,
    pilotRequired: import.meta.env.VITE_CONTINUOUS_SCAN_PILOT_REQUIRED,
    parishAllowlist: import.meta.env.VITE_CONTINUOUS_SCAN_PILOT_PARISH_IDS,
    userAllowlist: import.meta.env.VITE_CONTINUOUS_SCAN_PILOT_USER_IDS,
    revision: import.meta.env.VITE_CONTINUOUS_SCAN_CIRCUIT_REVISION,
  })
}

export function tripContinuousScanCircuit(
  scope: TenantScope | null,
  reason: ContinuousScanCircuitReason,
  revision = import.meta.env.VITE_CONTINUOUS_SCAN_CIRCUIT_REVISION?.trim() || '1',
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): boolean {
  if (!scope || !storage) return false
  try {
    const record: CircuitRecord = { version: 1, revision, reason, openedAt: new Date().toISOString() }
    storage.setItem(circuitKey(scope), JSON.stringify(record))
    return true
  } catch {
    return false
  }
}
