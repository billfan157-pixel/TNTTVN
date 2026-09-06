import { defineConfig } from 'vitest/config'
import base from '../../vitest.config'

// Opt-in diagnostic evidence. This file is deliberately excluded from the
// normal suite because it asserts the current, defective behavior under audit.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['scripts/audits/assessment-question-bank-exam-omr-2026-09-06.probe.ts'],
    fileParallelism: false,
  },
})
