import process from 'node:process'
import { removeE2ESandbox } from '../scripts/e2e-sandbox.mjs'

export default class E2ECleanupReporter {
  async onExit() {
    const runId = process.env.E2E_RUN_ID
    if (!runId) return
    if (process.env.E2E_KEEP_TEMP === 'true') {
      console.log(`[e2e-cleanup] Giữ lại sandbox theo E2E_KEEP_TEMP=true (run ${runId}).`)
      return
    }
    try {
      if (removeE2ESandbox(runId)) {
        console.log(`[e2e-cleanup] Đã dọn sandbox của run ${runId}.`)
      }
    } catch (error) {
      console.error('[e2e-cleanup] Không thể dọn sandbox E2E:', error?.message || error)
      process.exitCode = 1
      throw error
    }
  }
}
