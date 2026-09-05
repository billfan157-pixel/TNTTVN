const DEFAULT_DEVELOPMENT_PARISH_ID = 'gia-ton'
const PARISH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

function configuredParishId(): string | null {
  const value = process.env.DEPLOYMENT_PARISH_ID?.trim()
  return value || null
}

function validateParishId(value: string): string {
  if (!PARISH_ID_PATTERN.test(value)) {
    throw new Error('DEPLOYMENT_PARISH_ID must be a 1-64 character slug')
  }
  return value
}

/**
 * One deployment serves one parish. Production must choose that identity
 * explicitly; dev/test retain the historical seed fallback for local fixtures.
 */
export function getDeploymentParishId(): string {
  const configured = configuredParishId()
  if (configured) return validateParishId(configured)
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DEPLOYMENT_PARISH_ID is required in production')
  }
  return DEFAULT_DEVELOPMENT_PARISH_ID
}

/** Tests/dev without an explicit deployment scope may still exercise multi-parish isolation. */
export function getEnforcedDeploymentParishId(): string | null {
  if (process.env.NODE_ENV !== 'production' && !configuredParishId()) return null
  return getDeploymentParishId()
}

/**
 * Reject split-brain installation configuration before HTTP/workers start.
 * Legacy variables remain available to old dev/test fixtures, but once the
 * deployment scope is explicit they may not identify another parish.
 */
export function assertDeploymentParishConfiguration(): string {
  const deploymentParishId = getDeploymentParishId()
  if (!getEnforcedDeploymentParishId()) return deploymentParishId

  for (const legacyName of ['PARISH_ID', 'SUPER_ADMIN_PARISH_ID'] as const) {
    const legacyValue = process.env[legacyName]?.trim()
    if (legacyValue && legacyValue !== deploymentParishId) {
      throw new Error(`${legacyName} must match DEPLOYMENT_PARISH_ID when set`)
    }
  }
  return deploymentParishId
}

/** Internal alternate paths must not process another deployment's namespace. */
export function assertDeploymentParishScope(parishId: string): void {
  const enforcedParishId = getEnforcedDeploymentParishId()
  if (enforcedParishId && parishId !== enforcedParishId) {
    throw new Error('Requested parish is outside this deployment scope')
  }
}

/** Public legacy payloads cannot select a tenant once deployment scope is enforced. */
export function resolvePublicParishId(requestedParishId?: string): string {
  return getEnforcedDeploymentParishId()
    ?? (requestedParishId?.trim() ? validateParishId(requestedParishId.trim()) : getDeploymentParishId())
}
