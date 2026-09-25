import bcrypt from 'bcryptjs'
import { comparePassword } from './passwordCompute.js'

// Current password-write policy. Legacy cost-10 hashes upgrade on successful
// login; rejected logins normalize their bcrypt work separately below.
export const BCRYPT_COST = 12

// Random dummy passwords were discarded after these hashes were generated.
// Precomputed hashes keep the existing bcrypt work factor on every request
// without a costly first-request hash in an ephemeral Worker isolate.
const dummyPasswordHash = '$2a$12$hcE04azSpsRauqqqVYl6ZOi.zo.xflIHF8EqZnbWHwoCgLIG5CYXa'
const legacyDummyPasswordHash = '$2a$10$z7zBU3SzHd9.NlSh2EMzw.SL5ZgHjp/RDkq7YCSbTmYt02KBfwQse'

export async function consumeDummyPassword(password: string): Promise<void> {
  await comparePassword(password, dummyPasswordHash)
}

/**
 * Consume the same approximate bcrypt work for every rejected login category.
 * Cost 10 is one work unit and cost 12 is four units, so the target is five:
 * one cost-12 plus one cost-10 comparison. Existing hashes contribute their
 * own work and only the missing budget is added.
 */
async function consumeRejectedLoginRemainder(password: string, actualRounds?: number): Promise<void> {
  if (actualRounds === 12) {
    await comparePassword(password, legacyDummyPasswordHash)
    return
  }
  if (actualRounds === 11) {
    await comparePassword(password, legacyDummyPasswordHash)
    await comparePassword(password, legacyDummyPasswordHash)
    await comparePassword(password, legacyDummyPasswordHash)
    return
  }
  if (actualRounds === 10) {
    await comparePassword(password, dummyPasswordHash)
    return
  }
  // Unknown user/status and unusually cheap legacy/test hashes receive the
  // complete target budget. Hashes above policy are not padded further.
  if (actualRounds === undefined || actualRounds < 10) {
    await comparePassword(password, dummyPasswordHash)
    await comparePassword(password, legacyDummyPasswordHash)
  }
}

export async function consumeRejectedLogin(password: string): Promise<void> {
  await consumeRejectedLoginRemainder(password)
}

export async function verifyLoginPassword(password: string, passwordHash: string): Promise<boolean> {
  const valid = await comparePassword(password, passwordHash)
  if (valid) return true

  let rounds: number | undefined
  try {
    const parsed = bcrypt.getRounds(passwordHash)
    rounds = Number.isFinite(parsed) ? parsed : undefined
  } catch {
    rounds = undefined
  }
  await consumeRejectedLoginRemainder(password, rounds)
  return false
}

export function isLegacyCostHash(hash: string): boolean {
  // Hash cũ ($2a$10$...) được tạo trước A-NEW-19 → rehash-on-login khi user đăng nhập
  // thành công (migrate dần lên cost 12, pattern OWASP Password Storage §Rehashing).
  return hash.startsWith('$2a$10$') || hash.startsWith('$2b$10$') || hash.startsWith('$2y$10$')
}
