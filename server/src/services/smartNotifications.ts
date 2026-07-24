import { enqueueNotification } from './notificationQueue.js'
import { NOTIFICATION_TEMPLATES, buildContext, type TemplateContext } from './templateEngine.js'

export function notifyAbsence(
  studentName: string,
  holyName: string,
  className: string,
  date: string,
  status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused',
  parentName: string,
  parentPhone: string,
  note?: string
): void {
  const ctx = buildContext({ studentName, holyName, className, date, parentName, parentPhone, note })

  if (status === 'AbsentUnexcused') {
    enqueueNotification('telegram', 'absence', NOTIFICATION_TEMPLATES.absenceUnexcused, ctx)
  } else if (status === 'AbsentExcused') {
    enqueueNotification('telegram', 'absence', NOTIFICATION_TEMPLATES.absenceExcused, ctx)
  }
}

export function notifyReportCard(
  studentName: string,
  holyName: string,
  className: string,
  score: number | string,
  rank: string,
  attendanceRate: number | string,
  attendancePresent: number | string,
  attendanceTotal: number | string
): void {
  const ctx = buildContext({
    studentName, holyName, className,
    score, rank,
    attendanceRate, attendancePresent, attendanceTotal,
  })

  enqueueNotification('telegram', 'report', NOTIFICATION_TEMPLATES.reportCard, ctx)
}

export function notifyBatchReportCards(
  students: Array<{
    studentName: string
    holyName: string
    className: string
    score: number | string
    rank: string
    attendanceRate: number | string
    attendancePresent: number | string
    attendanceTotal: number | string
  }>
): number {
  let sent = 0
  for (const s of students) {
    try {
      notifyReportCard(
        s.studentName, s.holyName, s.className,
        s.score, s.rank,
        s.attendanceRate, s.attendancePresent, s.attendanceTotal
      )
      sent++
    } catch {
      // Skip failed sends, continue with rest
    }
  }
  return sent
}

export function notifySundayMassReminder(): void {
  const ctx = buildContext()
  enqueueNotification('telegram', 'reminder', NOTIFICATION_TEMPLATES.sundayMassReminder, ctx)
}

export function notifyClassReminder(className: string, date: string): void {
  const ctx = buildContext({ className, date })
  enqueueNotification('telegram', 'reminder', NOTIFICATION_TEMPLATES.classReminder, ctx)
}

export function notifyBatchAbsenceSummary(
  date: string,
  totalAbsent: number,
  totalStudents: number,
  namesList: string
): void {
  const ctx = buildContext({
    date,
    attendancePresent: totalAbsent,
    attendanceTotal: totalStudents,
    note: namesList,
  })
  enqueueNotification('telegram', 'info', NOTIFICATION_TEMPLATES.batchAbsenceSummary, ctx)
}
