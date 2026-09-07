import { defineConfig } from 'vitest/config'
import base from '../../vitest.config'

// Diagnostic-only audit probes. Global setup provisions an OS-temp SQLite DB.
// Empty cloud credentials guarantee the probe cannot select a remote database.
process.env.TURSO_URL = ''
process.env.TURSO_AUTH_TOKEN = ''
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    env: { ...base.test?.env, TURSO_URL: '', TURSO_AUTH_TOKEN: '' },
    include: ['scripts/audits/cross-domain-invariants-2026-09-07.probe.ts'],
    fileParallelism: false,
  },
})
