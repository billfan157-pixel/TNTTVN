import { sendTelegramAlert, sendTelegramInfo } from './telegram.js'
import { renderTemplate, type TemplateContext } from './templateEngine.js'

interface NotificationQueueItem {
  id: string
  channel: 'telegram' | 'webpush'
  type: 'alert' | 'info' | 'absence' | 'report' | 'reminder'
  template: string
  context: TemplateContext
  retryCount: number
  maxRetries: number
  lastError: string | null
  createdAt: string
}

const queue: NotificationQueueItem[] = []
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 5000
let processing = false

export function enqueueNotification(
  channel: NotificationQueueItem['channel'],
  type: NotificationQueueItem['type'],
  template: string,
  context: TemplateContext,
  maxRetries: number = MAX_RETRIES
): string {
  const id = `NQ-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
  queue.push({
    id, channel, type, template, context,
    retryCount: 0, maxRetries, lastError: null,
    createdAt: new Date().toISOString(),
  })
  processQueue().catch(() => {})
  return id
}

export function getQueueLength(): number {
  return queue.length
}

export function getFailedItems(): NotificationQueueItem[] {
  return queue.filter(item => item.retryCount >= item.maxRetries)
}

async function processQueue(): Promise<void> {
  if (processing) return
  processing = true

  while (queue.length > 0) {
    const item = queue[0]
    if (item.retryCount >= item.maxRetries) {
      queue.shift()
      continue
    }

    try {
      const message = renderTemplate(item.template, item.context)

      if (item.channel === 'telegram') {
        if (item.type === 'alert') {
          await sendTelegramAlert(message)
        } else {
          await sendTelegramInfo(message)
        }
      }

      queue.shift()
    } catch (err) {
      item.retryCount++
      item.lastError = String(err)
      if (item.retryCount >= item.maxRetries) {
        queue.shift()
        continue
      }
      const backoff = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, item.retryCount - 1), 60000)
      await new Promise(r => setTimeout(r, backoff))
    }
  }

  processing = false
}
