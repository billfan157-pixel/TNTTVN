import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import webPush from 'web-push'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import { notifyAbsence, notifyBatchReportCards, notifySundayMassReminder, notifyClassReminder } from '../services/smartNotifications.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@giaoly.com'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

interface SubscriptionData {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

const SUBS_FILE = join(process.cwd(), 'data', 'push-subscriptions.json')

function loadSubscriptions(): SubscriptionData[] {
  try {
    if (existsSync(SUBS_FILE)) {
      return JSON.parse(readFileSync(SUBS_FILE, 'utf-8'))
    }
  } catch {}
  return []
}

function saveSubscriptions(subs: SubscriptionData[]) {
  try {
    writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2))
  } catch (err) {
    console.error('Failed to persist push subscriptions:', err)
  }
}

let subscriptions: SubscriptionData[] = loadSubscriptions()

const notificationsRouter = new Hono()

notificationsRouter.use('*', authMiddleware)
notificationsRouter.use('/smart/*', roleMiddleware('admin', 'chunhiem'))

const subscribeSchema = z.object({
  endpoint: z.string().trim().min(1),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1),
})

const sendNotificationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  url: z.string().trim().optional(),
})

const absenceSchema = z.object({
  studentName: z.string().trim().min(1).max(200),
  holyName: z.string().trim().min(1).max(200),
  className: z.string().trim().min(1).max(100),
  date: z.string(),
  status: z.enum(['Present', 'AbsentExcused', 'AbsentUnexcused']),
  parentName: z.string().trim().min(1).max(200),
  parentPhone: z.string().trim().min(1).max(20),
  note: z.string().trim().max(500).optional(),
})

const reportCardsSchema = z.object({
  students: z.array(z.object({
    studentName: z.string().trim().min(1).max(200),
    holyName: z.string().trim().min(1).max(200),
    className: z.string().trim().min(1).max(100),
    score: z.number().min(0).max(10),
    rank: z.string().trim().min(1).max(50),
    attendanceRate: z.number().min(0).max(100),
    attendancePresent: z.number().min(0),
    attendanceTotal: z.number().min(1),
  })).min(1),
})

const classReminderSchema = z.object({
  className: z.string().trim().min(1).max(100),
  date: z.string(),
})

notificationsRouter.post('/subscribe', zValidator('json', subscribeSchema), async (c) => {
  const body = c.req.valid('json')
  subscriptions = subscriptions.filter(s => s.endpoint !== body.endpoint)
  subscriptions.push(body as SubscriptionData)
  saveSubscriptions(subscriptions)
  return c.json({ ok: true })
})

notificationsRouter.post('/unsubscribe', zValidator('json', unsubscribeSchema), async (c) => {
  const { endpoint } = c.req.valid('json')
  subscriptions = subscriptions.filter(s => s.endpoint !== endpoint)
  saveSubscriptions(subscriptions)
  return c.json({ ok: true })
})

notificationsRouter.post('/send', roleMiddleware('admin', 'chunhiem'), zValidator('json', sendNotificationSchema), async (c) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return c.json({ error: 'VAPID keys not configured' }, 501)
  }
  const { title, body, url } = c.req.valid('json')
  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webPush.sendNotification(sub as webPush.PushSubscription, JSON.stringify({ title, body, url }))
    )
  )
  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length
  if (failed > 0) {
    subscriptions = subscriptions.filter((_, i) => results[i].status === 'fulfilled')
    saveSubscriptions(subscriptions)
  }
  return c.json({ sent, failed, total: subscriptions.length })
})

notificationsRouter.get('/subscriptions', roleMiddleware('admin'), (c) => {
  return c.json({ count: subscriptions.length })
})

// ─── Smart Notifications ───

notificationsRouter.post('/smart/absence', zValidator('json', absenceSchema), async (c) => {
  const body = c.req.valid('json')
  notifyAbsence(
    body.studentName, body.holyName, body.className, body.date,
    body.status as 'Present' | 'AbsentExcused' | 'AbsentUnexcused',
    body.parentName, body.parentPhone, body.note
  )
  return c.json({ ok: true })
})

notificationsRouter.post('/smart/report-cards', zValidator('json', reportCardsSchema), async (c) => {
  const body = c.req.valid('json')
  const sent = notifyBatchReportCards(body.students)
  return c.json({ sent, total: body.students.length })
})

notificationsRouter.post('/smart/reminder/sunday', async (c) => {
  notifySundayMassReminder()
  return c.json({ ok: true })
})

notificationsRouter.post('/smart/reminder/class', zValidator('json', classReminderSchema), async (c) => {
  const { className, date } = c.req.valid('json')
  notifyClassReminder(className, date)
  return c.json({ ok: true })
})

export default notificationsRouter
