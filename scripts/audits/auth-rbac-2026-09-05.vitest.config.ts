import { defineConfig } from 'vitest/config'
import base from '../../vitest.config'

// Opt-in diagnostic evidence, deliberately excluded from the normal test suite.
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['scripts/audits/auth-rbac-2026-09-05.probe.ts'] },
})
