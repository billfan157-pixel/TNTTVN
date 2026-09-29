import { expect, type Page } from '@playwright/test'

export type MatrixTheme = 'light' | 'dark'

export async function settleFiniteAnimations(page: Page) {
  // Loop until quiet. A single pass snapshots `document.getAnimations()` and can do so
  // *before* a viewport- or scroll-triggered entrance starts — the dashboard's
  // `data-scroll-story-state` choreography does exactly that — so axe then samples a
  // half-faded frame and reports a contrast violation that does not exist in the settled
  // UI. Observed as a ~50% flake on `/dashboard` dark compact once `animate-in`/`fade-in`
  // became live classes: `#60A5FA` at partial opacity measured as `#5188ce` on
  // `#1b2537`, 4.21:1, while the settled element is well clear of 4.5:1.
  //
  // The inner list is rebuilt after awaiting `finished`, so a pass also catches
  // animations that were queued behind the first batch.
  for (let pass = 0; pass < 4; pass++) {
    // Best-effort by contract, and a loop multiplies the `page.evaluate` calls — so a
    // dev-server reload between two passes would destroy the context and throw out of a
    // helper whose whole purpose is to be safe to call anywhere. The caller's
    // `runAxeStable` already has the reopen path for a context that really did go away,
    // so stopping here loses nothing and hands the decision to the code that can act on
    // it. Observed as an intermittent "Execution context was destroyed" on the protected
    // route matrix.
    try {
      await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }))
      const stillRunning = await page.evaluate(async () => {
        const isFinite = (animation: Animation) => {
          const timing = animation.effect?.getComputedTiming()
          // Scroll/view-timeline animations are driven by scroll position, never "finish"
          // on a clock, and waiting for them would hang the gate: the landing has
          // storyBeatFocus/branchTrackGrow on a ViewTimeline. Only DocumentTimeline-driven
          // animations are waited on.
          const timeline = (animation as Animation & { timeline?: AnimationTimeline | null }).timeline
          if (timeline && !(timeline instanceof DocumentTimeline)) return false
          return animation.playState === 'running' && timing?.iterations !== Infinity
        }
        const finite = document.getAnimations().filter(isFinite)
        // Safety valve: settle is best-effort and must never hang the gate on an animation
        // that never resolves.
        await Promise.race([
          Promise.allSettled(finite.map(animation => animation.finished)),
          new Promise<void>(resolve => setTimeout(resolve, 4_000)),
        ])
        return document.getAnimations().filter(isFinite).length
      })
      if (stillRunning === 0) return
    } catch {
      return
    }
  }
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))).catch(() => {})
}
export type MatrixViewportName = 'desktop' | 'mobile' | 'compact'

export const matrixViewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
  compact: { width: 320, height: 720 },
} as const

export const representativeProtectedRoutes = [
  '/dashboard',
  '/students',
  '/attendance',
  '/grades',
  '/finances',
  '/parish',
  '/parish-profile',
  '/operations',
] as const

export type RepresentativeProtectedRoute = (typeof representativeProtectedRoutes)[number]

export const publicDesignRoutes = [
  {
    route: '/',
    artifact: 'landing',
    readySelector: '#gioi-thieu-tieu-de',
    mainSelector: 'main:has(#gioi-thieu-tieu-de)',
  },
  { route: '/login', artifact: 'portal-chooser', readySelector: '.auth-option' },
  { route: '/login/nhan-su', artifact: 'staff-login', readySelector: '#staff-username' },
  { route: '/login/phuhuynh', artifact: 'parent-login', readySelector: '#parent-phone' },
  {
    route: '/verify',
    artifact: 'verification',
    readySelector: 'main.auth-page h3',
    readyText: 'Thiếu tham số quét QR',
  },
] as const

export type PublicDesignRoute = (typeof publicDesignRoutes)[number]

const protectedRouteNavigation: Record<RepresentativeProtectedRoute, { label: string; workspace: 'academic' | 'organization' }> = {
  '/dashboard': { label: 'Tổng Quan', workspace: 'academic' },
  '/students': { label: 'Thiếu Nhi', workspace: 'academic' },
  '/attendance': { label: 'Điểm Danh', workspace: 'academic' },
  '/grades': { label: 'Bảng Điểm', workspace: 'academic' },
  '/finances': { label: 'Quỹ & Thu Chi', workspace: 'organization' },
  '/parish': { label: 'Tổng Quan Xứ Đoàn', workspace: 'organization' },
  '/parish-profile': { label: 'Hồ Sơ Xứ Đoàn', workspace: 'organization' },
  '/operations': { label: 'Công Việc', workspace: 'organization' },
}

const workspaceLabels = {
  academic: 'Thiếu Nhi & Học Vụ',
  organization: 'Xứ Đoàn & Giáo Xứ',
} as const

export async function installUiBoot(page: Page, theme: MatrixTheme = 'light') {
  await page.addInitScript(selectedTheme => {
    localStorage.setItem('parish_ui_boot', JSON.stringify({ theme: selectedTheme, viewMode: 'auto' }))
  }, theme)
}

export async function setThemeThroughHeader(page: Page, theme: MatrixTheme) {
  await page.setViewportSize(matrixViewports.desktop)
  const toggle = page.getByRole('button', { name: 'Đổi giao diện sáng/tối' })
  await expect(toggle).toBeVisible({ timeout: 15_000 })
  const desiredPressed = String(theme === 'dark')
  if (await toggle.getAttribute('aria-pressed') !== desiredPressed) {
    await toggle.click()
  }
  await expect(toggle).toHaveAttribute('aria-pressed', desiredPressed)
  await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/)
  await settleFiniteAnimations(page)
}

/**
 * Navigate through the real desktop sidebar, then resize for the observation.
 * Keeping one SPA document avoids manufacturing refresh-token rotation races by
 * reloading the authenticated app twenty times inside a single matrix.
 */
export async function openProtectedObservation(
  page: Page,
  route: RepresentativeProtectedRoute,
  viewportName: MatrixViewportName,
  observationName: string,
) {
  await page.setViewportSize(matrixViewports.desktop)
  const navigation = protectedRouteNavigation[route]
  const workspaceGroup = page.getByRole('group', { name: 'Chuyển không gian làm việc' })
  const workspaceButton = workspaceGroup.getByRole('button', { name: workspaceLabels[navigation.workspace], exact: true })
  if (await workspaceButton.getAttribute('aria-pressed') !== 'true') {
    await workspaceButton.click()
    await expect(workspaceButton).toHaveAttribute('aria-pressed', 'true')
  }

  const navItem = page
    .getByRole('navigation', { name: 'Điều hướng quản lý' })
    .getByRole('button', { name: navigation.label, exact: true })
  if (new URL(page.url()).pathname !== route) {
    await expect(navItem, `${route} must be reachable from the admin sidebar`).toBeVisible({ timeout: 15_000 })
    await navItem.click()
  }
  await expect(page, `${route} must resolve to its canonical route`).toHaveURL(new RegExp(`${route}$`))
  await expect(navItem, `${route} must be the active desktop destination`).toHaveAttribute('aria-current', 'page')

  await page.setViewportSize(matrixViewports[viewportName])
  const main = page.locator('#main-content')
  await expect(main, `${route} must expose the shared main landmark for ${observationName}`).toBeVisible({ timeout: 15_000 })
  await expect(main).toHaveClass(viewportName === 'desktop' ? /app-main-content/ : /mobile-app-main/)
  await expect(
    main.locator('.product-view').first(),
    `${route} must finish its lazy route render before ${observationName}`,
  ).toBeVisible({ timeout: 15_000 })
  await expect(
    main.locator('[role="status"][aria-label^="Đang tải"]'),
    `${route} must finish loading its primary data before ${observationName}`,
  ).toHaveCount(0, { timeout: 15_000 })
  await settleFiniteAnimations(page)
  return main
}

export async function openParishRecordEditor(page: Page) {
  await page.getByRole('button', { name: 'Thêm bản ghi', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /(Bản ghi Xứ đoàn|Thêm Cột Mốc Lịch Sử Mới|Cột mốc lịch sử)/i })
  await expect(dialog).toBeVisible()
  await settleFiniteAnimations(page)
  return dialog
}

export async function assertParishRecordEditorLayout(page: Page) {
  const dialog = page.getByRole('dialog', { name: /(Bản ghi Xứ đoàn|Thêm Cột Mốc Lịch Sử Mới|Cột mốc lịch sử)/i })
  const layout = await dialog.evaluate(element => {
    const content = element.querySelector<HTMLElement>('.modal-content')
    const groups = Array.from(element.querySelectorAll<HTMLElement>('.form-group'))
    const controls = Array.from(element.querySelectorAll<HTMLElement>('.form-group > input, .form-group > select, .form-group > textarea'))
    const noLabelOverlap = groups.every(group => {
      const label = group.querySelector<HTMLElement>('.form-label')
      const control = group.querySelector<HTMLElement>('input, select, textarea')
      if (!label || !control) return true
      return control.getBoundingClientRect().top >= label.getBoundingClientRect().bottom - 1
    })
    const controlsContained = controls.every(control => {
      const group = control.parentElement?.getBoundingClientRect()
      const box = control.getBoundingClientRect()
      return !!group && box.left >= group.left - 1 && box.right <= group.right + 1
    })
    return {
      groupCount: groups.length,
      allGroupsVertical: groups.every(group => getComputedStyle(group).display === 'flex' && getComputedStyle(group).flexDirection === 'column'),
      noLabelOverlap,
      controlsContained,
      contentOverflow: content ? content.scrollWidth <= content.clientWidth + 1 : false,
    }
  })

  expect(layout.groupCount).toBeGreaterThan(0)
  expect(layout.allGroupsVertical).toBe(true)
  expect(layout.noLabelOverlap).toBe(true)
  expect(layout.controlsContained).toBe(true)
  expect(layout.contentOverflow).toBe(true)
}

export async function openPublicObservation(
  page: Page,
  observation: PublicDesignRoute,
  observationName: string,
) {
  await page.goto(observation.route)
  const mainSelector = 'mainSelector' in observation ? observation.mainSelector : 'main.auth-page'
  const main = page.locator(mainSelector)
  await expect(main, `${observation.route} must render the public auth shell for ${observationName}`).toBeVisible({ timeout: 15_000 })
  const ready = page.locator(observation.readySelector).first()
  await expect(ready, `${observation.route} must finish rendering for ${observationName}`).toBeVisible({ timeout: 15_000 })
  if ('readyText' in observation) {
    await expect(ready).toHaveText(observation.readyText)
  }
  return main
}
