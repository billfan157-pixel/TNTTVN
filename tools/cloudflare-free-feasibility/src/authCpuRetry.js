const CODE_UPDATE_RESET = 'Durable Object reset because its code was updated.'

export function retryableAuthCpuError(error) {
  if (!(error instanceof Error) || error.overloaded === true) return false
  return error.retryable === true || error.message === CODE_UPDATE_RESET
}

export async function measureBcryptWithRetry(namespace, shard, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // A failed RPC can poison its stub. Resolve the same object again.
      return await namespace.getByName(shard).measureBcrypt()
    } catch (error) {
      if (attempt === 1 || !retryableAuthCpuError(error)) throw error
      await wait(50 + Math.floor(Math.random() * 25))
    }
  }
  throw new Error('Auth CPU retry exhausted')
}
