const SPECIAL_CHARACTER = /[!@#$%^&*()_+\-=[\]{};:'",.<>?/\\|`~]/

export function requireSeedAdminPassword(env: NodeJS.ProcessEnv = process.env): string {
  const password = env.SEED_ADMIN_PASSWORD?.trim()
  if (!password) {
    throw new Error(
      'SEED_ADMIN_PASSWORD is required when initializing an empty database; no default admin password is permitted',
    )
  }
  if (password.length < 8 || password.length > 128) {
    throw new Error('SEED_ADMIN_PASSWORD must be between 8 and 128 characters')
  }
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password) || !SPECIAL_CHARACTER.test(password)) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must contain at least one uppercase letter, one digit, and one special character',
    )
  }
  return password
}
