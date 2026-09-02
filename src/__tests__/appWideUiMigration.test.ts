import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('App-wide UI System v4.5 migration contract', () => {
  it('covers every desktop workspace with the product-view language', () => {
    const directViews = [
      'components/desktop/DesktopAttendanceGrid.tsx',
      'components/desktop/DesktopAttendanceSummary.tsx',
      'components/desktop/DesktopCalendarView.tsx',
      'components/desktop/DesktopDailyGradeEntry.tsx',
      'components/desktop/DesktopDashboard.tsx',
      'components/desktop/DesktopGradeCards.tsx',
      'components/desktop/DesktopGradeComparison.tsx',
      'components/desktop/DesktopGradeMatrix.tsx',
      'components/desktop/DesktopLeaveRequests.tsx',
      'components/desktop/DesktopNotices.tsx',
      'components/desktop/DesktopReports.tsx',
      'components/desktop/DesktopStudentList.tsx',
    ]

    for (const file of directViews) expect(source(file), file).toContain('product-view')
    expect(source('components/desktop/DesktopAppShell.tsx')).toContain('product-view')
    // Shared management pages now inherit the product-view language from the
    // responsive shell rather than duplicating it on their route component.
    expect(source('components/desktop/DesktopClasses.tsx')).toContain('<DesktopAppShell')
  })

  it('covers every mobile workflow with shared view, header, panel or entity primitives', () => {
    const mobileViews = [
      'components/mobile/MobileAttendanceSummaryView.tsx',
      'components/mobile/MobileAttendanceView.tsx',
      'components/mobile/MobileCalendarView.tsx',
      'components/mobile/MobileDailyGradeEntry.tsx',
      'components/mobile/MobileGradeBoard.tsx',
      'components/mobile/MobileGradeComparison.tsx',
      'components/mobile/MobileGradeMatrix.tsx',
      'components/mobile/MobileGradeView.tsx',
      'components/mobile/MobileHomeView.tsx',
      'components/mobile/MobileLeaveRequests.tsx',
      'components/mobile/MobileNoticesView.tsx',
      'components/mobile/MobileReportsView.tsx',
      'components/mobile/MobileStudentsView.tsx',
    ]

    for (const file of mobileViews) expect(source(file), file).toContain('product-view')
    expect(source('components/mobile/MobileNoticesView.tsx')).toContain('mobile-page-header--brand')
    expect(source('components/mobile/MobileReportsView.tsx')).toContain('mobile-page-header--brand')
    expect(source('components/mobile/MobileAttendanceView.tsx')).toContain('<Tabs')
    expect(source('components/mobile/MobileAttendanceView.tsx')).toContain('<TabPanel')
    expect(source('components/mobile/MobileStudentsView.tsx')).toContain('entity-card')
  })

  it('uses the shared parish identity on login and public verification surfaces', () => {
    expect(source('components/auth/LoginShell.tsx')).toContain('auth-page')
    expect(source('components/auth/LoginShell.tsx')).toContain('auth-hero')
    expect(source('pages/LoginPage.tsx')).toContain('auth-option')
    expect(source('pages/VerificationPage.tsx')).toContain('auth-card')
    expect(source('pages/VerificationPage.tsx')).toContain('<main className="auth-page">')
  })

  it('removes duplicate page hierarchy when management pages are embedded', () => {
    const management = source('pages/ManagementPage.tsx')
    expect(management).toContain('<AcademicYearPage embedded />')
    expect(management).toContain('<UsersPage scope="phuhuynh" embedded />')
    expect(management).not.toContain('<ClassesPage embedded />')
    expect(source('pages/StudentsPage.tsx')).not.toContain("label: 'Lớp Học'")
    expect(source('components/desktop/DesktopStudentList.tsx')).toContain('<DesktopClasses embedded')
    expect(source('components/mobile/MobileStudentsView.tsx')).toContain('<DesktopClasses embedded')
    expect(source('components/mobile/MobileStudentsView.tsx')).not.toContain('value="classes"')
    expect(source('pages/AcademicYearPage.tsx')).toContain('!embedded && <PageHeader')
    expect(source('components/desktop/DesktopClasses.tsx')).toContain('!embedded && <PageHeader')
    expect(source('components/desktop/UserManagementPage.tsx')).toContain('!embedded && <PageHeader')
  })
})
