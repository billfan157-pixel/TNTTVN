import { defineConfig } from 'vitest/config'
import base from '../../vitest.config'

// Opt-in diagnostic probe for Audit #08 (2026-09-19)
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['scripts/audits/students-classes-personnel-import-2026-09-19.probe.ts'],
    fileParallelism: false,
  },
})
