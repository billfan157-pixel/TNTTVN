export interface TemplateContext {
  studentName?: string
  holyName?: string
  className?: string
  branch?: string
  date?: string
  time?: string
  parentName?: string
  parentPhone?: string
  score?: number | string
  rank?: string
  attendanceRate?: number | string
  attendancePresent?: number | string
  attendanceTotal?: number | string
  academicYear?: string
  teacherName?: string
  note?: string
  title?: string
  content?: string
  author?: string
  sundayMassTime?: string
  scoreField?: string
  manualValue?: number | string
  reasonCode?: string
  classId?: string
}

const TEMPLATE_VARIABLES: Record<string, keyof TemplateContext> = {
  studentName: 'studentName',
  holyName: 'holyName',
  className: 'className',
  branch: 'branch',
  date: 'date',
  time: 'time',
  parentName: 'parentName',
  parentPhone: 'parentPhone',
  score: 'score',
  rank: 'rank',
  attendanceRate: 'attendanceRate',
  attendancePresent: 'attendancePresent',
  attendanceTotal: 'attendanceTotal',
  academicYear: 'academicYear',
  teacherName: 'teacherName',
  note: 'note',
  title: 'title',
  content: 'content',
  author: 'author',
  sundayMassTime: 'sundayMassTime',
  scoreField: 'scoreField',
  manualValue: 'manualValue',
  reasonCode: 'reasonCode',
}

export const NOTIFICATION_TEMPLATES = {
  // Absence alerts
  absenceUnexcused: '⚠️ {studentName} ({className}) vắng mặt không phép ngày {date}. Phụ huynh: {parentName} - {parentPhone}.',
  absenceExcused: '📝 {studentName} ({className}) vắng mặt có phép ngày {date}. Lý do: {note}.',

  // Report card
  reportCard: '📋 Phiếu Điểm {academicYear}\n{studentName} ({className})\nĐiểm TB: {score} - {rank}\nChuyên cần: {attendanceRate}% ({attendancePresent}/{attendanceTotal})\n\nXem chi tiết tại ứng dụng.',

  // Reminders (sundayMassTime từ parish settings — không còn hardcode 8h00)
  sundayMassReminder: '⛪ Nhắc nhở: Chúa Nhật này các em đi Lễ đầy đủ nhé! Thánh Lễ Thiếu Nhi lúc {sundayMassTime}.',
  classReminder: '📚 Nhắc nhở: Lớp Giáo Lý hôm nay ({date}) - {className}. Các em đi học đúng giờ!',

  // Sacraments
  sacramentUpcoming: '🙏 Chuẩn bị lãnh nhận Bí Tích {note} cho {studentName} vào {date}.',

  // Batch summary
  batchAbsenceSummary: '📊 Báo Cáo Vắng Học\nNgày: {date}\nTổng số vắng: {attendancePresent}/{attendanceTotal} em\nCác em vắng không phép: {note}',

  // Parish Notice
  parishNotice: '🔔 {title}\n{content}\n\n— {author}',

  // Grade override (Phase 2: thay outbox subscriber — cùng nội dung, qua queue bền vững)
  gradeOverride: '✏️ Điểm thủ công đã lưu\n• Thiếu nhi: {studentName}\n• Cột điểm: {scoreField} = {manualValue}\n• Lý do: {reasonCode}',
  gradeOverrideRemoved: '↩️ Điểm thủ công đã được khôi phục (thiếu nhi {studentName}, cột {scoreField})',
}

export function renderTemplate(template: string, context: TemplateContext): string {
  let result = template
  for (const [key, value] of Object.entries(TEMPLATE_VARIABLES)) {
    const val = context[value]
    if (val !== undefined && val !== null) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val))
    }
  }
  // Remove any remaining unfilled variables
  result = result.replace(/\{[a-zA-Z]+\}/g, '')
  return result
}

export function buildContext(overrides: Partial<TemplateContext> = {}): TemplateContext {
  const now = new Date()
  return {
    date: now.toLocaleDateString('vi-VN'),
    time: now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    academicYear: getAcademicYear(now),
    ...overrides,
  }
}

function getAcademicYear(date: Date): string {
  const startYear = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1
  return `${startYear} - ${startYear + 1}`
}
