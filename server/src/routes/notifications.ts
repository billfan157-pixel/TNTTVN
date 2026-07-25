import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import webPush from 'web-push'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'
import type { JwtPayload } from '../middleware/auth.js'
import { notifyAbsence, notifyBatchReportCards, notifySundayMassReminder, notifyClassReminder } from '../services/smartNotifications.js'
import { db } from '../db/index.js'
import { pushSubscriptions } from '../db/schema.js'
import { and, eq, sql } from 'drizzle-orm'
import { generateId } from '../utils/id.js'

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@giaoly.com'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

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
  const user = c.get('user') as JwtPayload
  const body = c.req.valid('json')
  const existing = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint)).limit(1)
  if (existing.length === 0) {
    await db.insert(pushSubscriptions).values({
      id: generateId('NOT'),
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userId: user.userId,
      parishId: user.parishId,
    })
  }
  return c.json({ ok: true })
})

notificationsRouter.post('/unsubscribe', zValidator('json', unsubscribeSchema), async (c) => {
  const user = c.get('user') as JwtPayload
  const { endpoint } = c.req.valid('json')
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.parishId, user.parishId)))
  return c.json({ ok: true })
})

notificationsRouter.post('/send', roleMiddleware('admin', 'chunhiem'), zValidator('json', sendNotificationSchema), async (c) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return c.json({ error: 'VAPID keys not configured' }, 501)
  }
  const user = c.get('user') as JwtPayload
  const { title, body, url } = c.req.valid('json')
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.parishId, user.parishId))
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as webPush.PushSubscription,
        JSON.stringify({ title, body, url })
      )
    )
  )
  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed: number[] = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') failed.push(i)
  })
  if (failed.length > 0) {
    const failedEndpoints = failed.map(i => subs[i].endpoint)
    for (const ep of failedEndpoints) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, ep))
    }
  }
  return c.json({ sent, failed: failed.length, total: subs.length })
})

notificationsRouter.get('/subscriptions', roleMiddleware('admin'), async (c) => {
  const user = c.get('user') as JwtPayload
  const count = await db.select({ count: sql`count(*)` }).from(pushSubscriptions).where(eq(pushSubscriptions.parishId, user.parishId))
  return c.json({ count: count[0]?.count || 0 })
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
