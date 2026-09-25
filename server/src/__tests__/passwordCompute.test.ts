import { afterEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { comparePassword, hashPassword, withPasswordCpuNamespace, type PasswordCpuNamespace } from '../utils/passwordCompute.js'
import { consumeRejectedLogin, verifyLoginPassword } from '../utils/passwordPolicy.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function workerRuntime() {
  vi.stubEnv('CATEVIA_RUNTIME', 'cloudflare-worker')
  vi.stubGlobal('WebSocketPair', class WebSocketPair {})
}

describe('password compute boundary', () => {
  it('keeps Node bcrypt behavior', async () => {
    const hash = await hashPassword('Node-only@123', 4)
    expect(bcrypt.getRounds(hash)).toBe(4)
    expect(await comparePassword('Node-only@123', hash)).toBe(true)
    expect(await comparePassword('wrong', hash)).toBe(false)
  })

  it('fails closed on Workers when the Durable Object binding is missing', async () => {
    workerRuntime()
    await expect(comparePassword('secret', 'hash')).rejects.toThrow('PASSWORD_CPU binding is required')
  })

  it('recreates a stub once after a code-update reset and preserves the shard', async () => {
    workerRuntime()
    const names: string[] = []
    const namespace: PasswordCpuNamespace = {
      getByName(name) {
        names.push(name)
        return {
          hashPassword: async () => 'unused',
          comparePassword: async () => {
            if (names.length === 1) throw new Error('Durable Object reset because its code was updated.')
            return true
          },
        }
      },
    }
    expect(await withPasswordCpuNamespace(namespace, () => comparePassword('secret', 'hash'))).toBe(true)
    expect(names).toHaveLength(2)
    expect(names[0]).toMatch(/^password-cpu-\d+$/)
    expect(names[1]).toBe(names[0])
  })

  it('does not retry overload and keeps concurrent request bindings separate', async () => {
    workerRuntime()
    const overloaded = Object.assign(new Error('overloaded'), { retryable: true, overloaded: true })
    let overloadedCalls = 0
    const failing: PasswordCpuNamespace = { getByName: () => {
      overloadedCalls++
      return { hashPassword: async () => { throw overloaded }, comparePassword: async () => { throw overloaded } }
    } }
    await expect(withPasswordCpuNamespace(failing, () => comparePassword('secret', 'hash'))).rejects.toBe(overloaded)
    expect(overloadedCalls).toBe(1)

    const namespace = (result: string): PasswordCpuNamespace => ({ getByName: () => ({
      hashPassword: async () => { await Promise.resolve(); return result },
      comparePassword: async () => false,
    }) })
    const outputs = await Promise.all([
      withPasswordCpuNamespace(namespace('first'), () => hashPassword('secret', 12)),
      withPasswordCpuNamespace(namespace('second'), () => hashPassword('secret', 12)),
    ])
    expect(outputs).toEqual(['first', 'second'])
  })

  it('keeps rejected-login bcrypt cost work on the Worker path', async () => {
    workerRuntime()
    const rounds: number[] = []
    const namespace: PasswordCpuNamespace = { getByName: () => ({
      hashPassword: async () => 'unused',
      comparePassword: async (_password, hash) => {
        rounds.push(bcrypt.getRounds(hash))
        return false
      },
    }) }
    const legacyHash = await bcrypt.hash('Synthetic@123', 10)
    const currentHash = await bcrypt.hash('Synthetic@123', 12)
    for (const hash of [undefined, legacyHash, currentHash]) {
      rounds.length = 0
      if (hash) expect(await withPasswordCpuNamespace(namespace, () => verifyLoginPassword('wrong', hash))).toBe(false)
      else await withPasswordCpuNamespace(namespace, () => consumeRejectedLogin('wrong'))
      expect(rounds.sort()).toEqual([10, 12])
    }
  })
})
