export function generateId(prefix: string): string {
  const randomHex = crypto.randomUUID().split('-')[0]
  return `${prefix}-${randomHex}`
}
