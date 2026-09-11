/**
 * Parish-scoped admin authority, approved for all environments.
 * Legacy environment flags no longer restrict this account capability.
 */
export function isOperationsAdminMutationOverrideEnabled(
  _environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return true
}
