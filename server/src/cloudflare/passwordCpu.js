import { DurableObject } from 'cloudflare:workers'
import bcrypt from 'bcryptjs'

// Stateless bcrypt compute only. Turso retains every authentication write.
export const PASSWORD_CPU_VERSION = '2026-09-26.1'

export class PasswordCpu extends DurableObject {
  /** Lets a probe prove which object code actually served a request. */
  computeVersion() {
    return PASSWORD_CPU_VERSION
  }

  async hashPassword(password, rounds) {
    if (typeof password !== 'string' || password.length > 256 || !Number.isInteger(rounds) || rounds < 4 || rounds > 12) {
      throw new Error('Invalid password compute input')
    }
    return bcrypt.hash(password, rounds)
  }

  async comparePassword(password, hash) {
    if (typeof password !== 'string' || password.length > 256 || typeof hash !== 'string' || hash.length > 256) {
      throw new Error('Invalid password compute input')
    }
    return bcrypt.compare(password, hash)
  }
}
