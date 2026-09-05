/** Composite protected identity, shared by HTTP and transaction authorization. */
export function getSuperAdminId(): string {
  const envId = process.env.SUPER_ADMIN_ID?.trim()
  if (envId) return envId
  if (process.env.NODE_ENV === 'production') throw new Error('SUPER_ADMIN_ID must be set in production (no default)')
  return 'USR-001'
}

export function isSuperAdmin(userId: string, parishId: string, role: string): boolean {
  const protectedParishId = getEnforcedDeploymentParishId() ?? (process.env.SUPER_ADMIN_PARISH_ID?.trim() || 'gia-ton')
  return role === 'admin' && userId === getSuperAdminId()
    && parishId === protectedParishId
}
import { getEnforcedDeploymentParishId } from './deploymentParish.js'
