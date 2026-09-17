const DEV_ACCESS_SECRET = 'default-test-jwt-secret-key-32-chars-long'
const MIN_SECRET_LENGTH = 32

export interface JwtSecrets {
  accessSecret: string
  refreshSecret: string
}

/** Resolve JWT secrets without exposing their values in validation errors. */
export function resolveJwtSecrets(env: NodeJS.ProcessEnv = process.env): JwtSecrets {
  const production = env.NODE_ENV === 'production'
  const accessSecret = env.JWT_SECRET || (!production ? DEV_ACCESS_SECRET : '')
  const refreshSecret = env.JWT_REFRESH_SECRET || (!production ? accessSecret : '')

  if (!accessSecret) throw new Error('JWT_SECRET environment variable is required')
  if (!refreshSecret) throw new Error('JWT_REFRESH_SECRET environment variable is required in production')

  if (production) {
    if (accessSecret.length < MIN_SECRET_LENGTH) {
      throw new Error(`JWT_SECRET must contain at least ${MIN_SECRET_LENGTH} characters in production`)
    }
    if (refreshSecret.length < MIN_SECRET_LENGTH) {
      throw new Error(`JWT_REFRESH_SECRET must contain at least ${MIN_SECRET_LENGTH} characters in production`)
    }
    if (accessSecret === refreshSecret) {
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be distinct in production')
    }
  }

  return { accessSecret, refreshSecret }
}
