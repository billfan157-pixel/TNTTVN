import { describe, expect, it } from 'vitest'
import { requireSeedAdminPassword } from '../utils/seedAdminPassword.js'

describe('initial admin bootstrap password policy', () => {
  it('fails closed when SEED_ADMIN_PASSWORD is absent', () => {
    expect(() => requireSeedAdminPassword({} as NodeJS.ProcessEnv)).toThrow(/SEED_ADMIN_PASSWORD is required/)
  })

  it('rejects the historical weak default credential', () => {
    expect(() => requireSeedAdminPassword({ SEED_ADMIN_PASSWORD: 'admin123' } as NodeJS.ProcessEnv)).toThrow()
  })

  it('accepts an explicitly provisioned strong password', () => {
    const value = requireSeedAdminPassword({ SEED_ADMIN_PASSWORD: 'Bootstrap@2026' } as NodeJS.ProcessEnv)
    expect(value).toBe('Bootstrap@2026')
  })
})
