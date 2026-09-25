import { DurableObject } from 'cloudflare:workers'
import { runNotificationDeliveryCycle, getQueueLength } from '../services/notificationQueue.ts'
import { processDueOperationReminders } from '../services/operationsReminderService.ts'
import { processDueOperationEventTransitions } from '../services/operationsEventLifecycleService.ts'
import { processDueOperationTaskDispatches } from '../services/operationsTaskDispatchService.ts'
import { processDueManagerPrepReminders } from '../services/operationsManagerReminderService.ts'
import { runSundayReminderCheck } from '../services/sundayReminderScheduler.ts'
import { runImportMaintenanceCycle } from '../services/importService.ts'
import { runOperationsReceiptMaintenance } from '../services/operationsReceiptMaintenance.ts'
import { runAutoBackupCheck } from '../services/backupScheduler.ts'
import { withBlobBucket } from '../services/blobStorage.ts'
import { client } from '../db/connection.ts'
import { RECOVERY_QUARANTINE_KEY } from '../db/recoveryQuarantine.ts'

// Each job uses a distinct Durable Object ID. The five-minute Cron repairs
// missing alarms; each alarm supplies the shorter cadence used by Node timers.
export const MAINTENANCE_INTERVALS_MS = Object.freeze({
  notification: 30_000,
  'operation-reminders': 30_000,
  'operation-lifecycle': 30_000,
  'operation-dispatch': 30_000,
  'manager-reminders': 15 * 60_000,
  'sunday-reminders': 60_000,
  'import-maintenance': 60 * 60_000,
  'receipt-maintenance': 24 * 60 * 60_000,
  backup: 60_000,
})

export class MaintenanceJob extends DurableObject {
  async ensureScheduled(kind) {
    if (!(kind in MAINTENANCE_INTERVALS_MS)) throw new Error('Unknown maintenance job')
    if (this.env.CATEVIA_MAINTENANCE_OWNER !== 'cloudflare') {
      await this.ctx.storage.deleteAlarm()
      return { enabled: false }
    }
    const currentKind = await this.ctx.storage.get('kind')
    if (currentKind && currentKind !== kind) throw new Error('Maintenance job identity changed')
    if (!currentKind) await this.ctx.storage.put('kind', kind)
    if (await this.ctx.storage.getAlarm() === null) {
      await this.ctx.storage.put('lastEnsureAt', new Date().toISOString())
      await this.ctx.storage.setAlarm(Date.now() + 1_000)
    }
    return { enabled: true, kind, nextAlarm: await this.ctx.storage.getAlarm() }
  }

  async alarm() {
    const kind = await this.ctx.storage.get('kind')
    if (!(kind in MAINTENANCE_INTERVALS_MS)) throw new Error('Unknown maintenance job')
    if (this.env.CATEVIA_MAINTENANCE_OWNER !== 'cloudflare') return
    const startedAt = Date.now()
    try {
      const marker = await client.execute({
        sql: 'SELECT key FROM system_settings WHERE key = ? LIMIT 1',
        args: [RECOVERY_QUARANTINE_KEY],
      })
      if (marker.rows.length > 0) throw new Error('RECOVERY_QUARANTINED')
      await this.run(kind)
      await this.ctx.storage.put('lastSuccessAt', new Date().toISOString())
    } catch (error) {
      await this.ctx.storage.put('lastFailureAt', new Date().toISOString())
      console.error(JSON.stringify({ type: 'MAINTENANCE_JOB_FAILED', kind,
        errorClass: error?.name || 'UnknownError' }))
    } finally {
      // Schedule even after a downstream outage; Cron also repairs a missing
      // alarm if an isolate dies between the job and this write.
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1_000,
        startedAt + MAINTENANCE_INTERVALS_MS[kind]))
    }
  }

  async status() {
    return {
      kind: await this.ctx.storage.get('kind') || null,
      nextAlarm: await this.ctx.storage.getAlarm(),
      lastEnsureAt: await this.ctx.storage.get('lastEnsureAt') || null,
      lastSuccessAt: await this.ctx.storage.get('lastSuccessAt') || null,
      lastFailureAt: await this.ctx.storage.get('lastFailureAt') || null,
    }
  }

  async run(kind) {
    switch (kind) {
      case 'notification':
        await runNotificationDeliveryCycle()
        return { queueLength: getQueueLength() }
      case 'operation-reminders':
        return processDueOperationReminders()
      case 'operation-lifecycle':
        return processDueOperationEventTransitions()
      case 'operation-dispatch':
        return processDueOperationTaskDispatches()
      case 'manager-reminders':
        return processDueManagerPrepReminders()
      case 'sunday-reminders':
        return runSundayReminderCheck()
      case 'import-maintenance':
        await runImportMaintenanceCycle()
        return { completed: true }
      case 'receipt-maintenance':
        return { compacted: await runOperationsReceiptMaintenance() }
      case 'backup':
        return { completed: await withBlobBucket(this.env.BLOB_BUCKET, () => runAutoBackupCheck()) }
      default:
        throw new Error('Unknown maintenance job')
    }
  }
}
