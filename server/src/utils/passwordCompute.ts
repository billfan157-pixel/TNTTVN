import { AsyncLocalStorage } from 'node:async_hooks'
import bcrypt from 'bcryptjs'
import { isCloudflareWorkerRuntime } from './cloudflareRuntime.js'

export interface PasswordCpuStub {
  hashPassword(password: string, rounds: number): Promise<string>
  comparePassword(password: string, hash: string): Promise<boolean>
}

export interface PasswordCpuNamespace {
  getByName(name: string): PasswordCpuStub
}

const passwordCpuContext = new AsyncLocalStorage<PasswordCpuNamespace | null>()
const CODE_UPDATE_RESET = 'Durable Object reset because its code was updated.'

/** Carry a Cloudflare binding through one Hono request without a mutable global. */
export function withPasswordCpuNamespace<T>(namespace: PasswordCpuNamespace | undefined, run: () => Promise<T>): Promise<T> {
  return passwordCpuContext.run(namespace ?? null, run)
}

function retryableRpcError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const rpcError = error as Error & { retryable?: boolean; overloaded?: boolean }
  return rpcError.overloaded !== true && (rpcError.retryable === true || error.message === CODE_UPDATE_RESET)
}

async function callPasswordCpu<T>(operation: (stub: PasswordCpuStub) => Promise<T>): Promise<T> {
  const namespace = passwordCpuContext.getStore()
  if (!isCloudflareWorkerRuntime()) throw new Error('Password CPU RPC is only available in the Cloudflare Worker runtime')
  if (!namespace) throw new Error('PASSWORD_CPU binding is required in the Cloudflare Worker runtime')

  // This object only computes bcrypt and stores nothing. A random shard avoids
  // exposing account/tenant identifiers in object names and a hot dummy-hash
  // object for unknown accounts. Reuse its name, but recreate the stub on retry.
  const shard = `password-cpu-${Math.floor(Math.random() * 32)}`
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await operation(namespace.getByName(shard))
    } catch (error) {
      if (attempt === 1 || !retryableRpcError(error)) throw error
      await new Promise(resolve => setTimeout(resolve, 50 + Math.floor(Math.random() * 25)))
    }
  }
  throw new Error('Password CPU retry exhausted')
}

export async function hashPassword(password: string, rounds: number): Promise<string> {
  if (!isCloudflareWorkerRuntime()) return bcrypt.hash(password, rounds)
  return callPasswordCpu(stub => stub.hashPassword(password, rounds))
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (!isCloudflareWorkerRuntime()) return bcrypt.compare(password, hash)
  return callPasswordCpu(stub => stub.comparePassword(password, hash))
}
