import crypto from 'node:crypto'

export type IdPrefix = 'ST' | 'GR' | 'AT' | 'NC' | 'USR' | 'AUD' | 'NOT' | 'CLS' | 'ASG'

/**
 * Generates a normalized, collision-resistant domain ID (e.g. ST-4f8a12b9)
 */
export function generateId(prefix: IdPrefix): string {
  const randomHex = crypto.randomUUID().split('-')[0]
  return `${prefix}-${randomHex}`
}
