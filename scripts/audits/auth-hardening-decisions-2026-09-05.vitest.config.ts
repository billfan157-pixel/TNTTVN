import { defineConfig } from 'vitest/config'
import base from '../../vitest.config'

// Diagnostic probes assert observed gaps, NOT acceptance/security-green tests.
export default defineConfig({ ...base, test: {
  ...base.test,
  include: ['scripts/audits/auth-hardening-decisions-2026-09-05.probe.ts'],
} })
