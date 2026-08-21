export function isSqliteBusyError(error: unknown): boolean {
  let current: unknown = error
  const visited = new Set<unknown>()

  for (let depth = 0; depth < 8 && current && typeof current === 'object' && !visited.has(current); depth++) {
    visited.add(current)
    const candidate = current as { code?: unknown; extendedCode?: unknown; cause?: unknown }
    if (
      (typeof candidate.code === 'string' && candidate.code.startsWith('SQLITE_BUSY'))
      || (typeof candidate.extendedCode === 'string' && candidate.extendedCode.startsWith('SQLITE_BUSY'))
    ) {
      return true
    }
    current = candidate.cause
  }

  return false
}
