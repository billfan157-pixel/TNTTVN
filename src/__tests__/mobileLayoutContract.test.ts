import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readCssGraph } from './helpers/cssGraph'

const root = path.resolve(__dirname, '..')
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const cssSource = () => readCssGraph(path.join(root, 'index.css'))

describe('App-wide mobile layout contract', () => {
  it('keeps shared pages in the explicit responsive shell instead of a mobile-only desktop cap', () => {
    const shell = source('components/desktop/DesktopAppShell.tsx')
    const css = cssSource()

    expect(shell).toContain('responsive-page-shell')
    expect(shell).toContain('embedded-page-section')
    expect(shell).not.toContain('mobile-screen')
    expect(css).toContain('.responsive-page-shell--wide { max-width: 80rem; }')
    expect(css).toContain('.responsive-page-shell--narrow { max-width: 48rem; }')
    expect(css).toContain('@media (min-width: 1024px)')
  })

  it('defines one mobile safe-area and touch-target contract for shells and portaled dialogs', () => {
    const css = cssSource()

    expect(css).toContain('--mobile-action-bar-height: 68px')
    expect(css).toContain('--mobile-topbar-clearance')
    expect(css).toContain('.app-modal-layer input')
    expect(css).toContain("font-size: 16px")
    expect(css).toContain("min-height: 44px")
    expect(css).toContain('.app-confirm-layer')
    expect(css).toMatch(/\.mobile-control-tile\s*\{[\s\S]*?min-height:\s*52px;/)
    expect(css).toMatch(/\.mobile-workspace-item\s*\{[\s\S]*?min-height:\s*40px;/)
    expect(css).toMatch(/\.mobile-semester-control button\s*\{\s*min-height: 44px;/)
    expect(css).toMatch(/\.mobile-bottom-nav__item\s*\{[\s\S]*?color:\s*var\(--color-text-secondary\);/)
    expect(css).toMatch(/\.auth-page \.btn\s*\{\s*min-height: 44px;/)
    expect(css).not.toMatch(/\.mobile-semester-control button\s*\{\s*min-height: (?:3[0-9]|4[0-3])px;/)
  })

  it('portals each route-owned fixed dialog above the route-transition stacking context', () => {
    const dialogs = [
      'components/mobile/MobileCalendarView.tsx',
      'components/mobile/MobileLeaveRequests.tsx',
      'components/exam/ExamSessionView.tsx',
      'components/exam/ExamResultsTable.tsx',
      'components/exam/ExamImportModal.tsx',
      'components/desktop/SystemDiagnosticsModal.tsx',
      'components/desktop/ConflictInboxModal.tsx',
    ]

    for (const file of dialogs) expect(source(file), file).toContain('ModalPortal')
    expect(source('components/exam/ExamImportModal.tsx')).toContain('app-modal-layer--nested')
    expect(source('components/exam/ExamPaperModal.tsx')).toContain('createPortal')
    expect(source('components/exam/ExamPaperModal.tsx')).toContain('app-modal-layer')
    expect(source('components/mobile/MobileTopBar.tsx')).toContain('ModalPortal')
    expect(source('components/mobile/MobileTopBar.tsx')).toContain('useAccessibleDialog')
    expect(source('components/mobile/MobileTopBar.tsx')).toContain('app-modal-layer mobile-control-sheet-layer')
    expect(cssSource()).toContain('.mobile-control-sheet-layer')
  })

  it('aligns the shared pages and public surfaces with the mobile route contract', () => {
    expect(source('pages/LeaveRequestsPage.tsx')).toContain('className="mobile-screen"')
    expect(source('pages/FinancePage.tsx')).toContain('table-scroll hidden md:block')
    expect(source('pages/FinancePage.tsx')).toContain('md:hidden')
    expect(source('pages/LoginPage.tsx')).toContain('<main className="auth-page">')
    expect(source('components/mobile/MobileCalendarView.tsx')).toContain('mobile-calendar-header')
    expect(source('components/mobile/MobileCalendarView.tsx')).toContain('data-compact-touch')
    expect(source('components/mobile/MobileStudentsView.tsx')).toContain('min-h-[44px] px-2 rounded-lg bg-parish-primary-light/50')
  })
})
