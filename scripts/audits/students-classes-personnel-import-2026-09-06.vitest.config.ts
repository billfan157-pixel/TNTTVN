import { defineConfig } from 'vitest/config'
import base from '../../vitest.config'

// Opt-in diagnostic evidence. Deliberately excluded from the normal suite
// because these probes assert current defective behavior under audit.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['scripts/audits/students-classes-personnel-import-2026-09-06.probe.ts'],
    fileParallelism: false,
  },
})
