import { expect, test } from '@playwright/test'
import { getAdminSession, injectSession } from './helpers'
import { installUiBoot } from './design-system-matrix'

test('first load shows feedback while its initial page module is still downloading', async ({ page }) => {
  await installUiBoot(page)
  await injectSession(page, await getAdminSession(page.request))
  let requested = false
  let release!: () => void
  const heldImport = new Promise<void>(resolve => { release = resolve })
  await page.route(/\/src\/pages\/DashboardPage\.tsx(?:\?|$)/, async route => {
    requested = true
    await heldImport
    await route.continue()
  })
  try {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect.poll(() => requested).toBe(true)
    await expect(page.getByRole('status', { name: 'Đang chuẩn bị nội dung', exact: true })).toBeVisible()
    release()
    await expect(page.locator('#main-content .product-view').first()).toBeVisible()
    await expect(page.getByRole('status', { name: 'Đang chuẩn bị nội dung', exact: true })).toHaveCount(0)
  } finally {
    release()
  }
})

test('desktop intent loads the route before click and keeps the current screen during a slow import', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installUiBoot(page)
  await injectSession(page, await getAdminSession(page.request))
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  let requested = false
  let release!: () => void
  const heldImport = new Promise<void>(resolve => { release = resolve })
  await page.route(/\/src\/pages\/GradesPage\.tsx(?:\?|$)/, async route => {
    requested = true
    await heldImport
    await route.continue()
  })

  try {
    await page.goto('/dashboard')
    const main = page.locator('#main-content')
    await expect(main.locator('.product-view').first()).toBeVisible()
    const outgoingFrame = await main.locator('.route-transition-frame').elementHandle()
    const nav = page.getByRole('navigation', { name: 'Điều hướng quản lý' })
    const grades = nav.getByRole('button', { name: 'Bảng Điểm', exact: true })
    const dashboard = nav.getByRole('button', { name: 'Tổng Quan', exact: true })

    await grades.focus()
    await expect.poll(() => requested, { message: 'Keyboard intent must request the page module before navigation', timeout: 5_000 }).toBe(true)
    await grades.click()

    await expect(grades).toHaveAttribute('aria-busy', 'true')
    await expect(dashboard).toHaveAttribute('aria-current', 'page')
    await expect(main.getByText('Đang chuẩn bị nội dung…')).toHaveCount(0)
    await expect(main.locator('.product-view').first()).toBeVisible()
    expect(await outgoingFrame!.evaluate(frame => frame.isConnected)).toBe(true)

    release()
    await expect(page).toHaveURL(/\/grades$/)
    await expect(grades).toHaveAttribute('aria-current', 'page')
    await expect(grades).not.toHaveAttribute('aria-busy')
    await expect(main.getByRole('heading', { name: 'Sổ Điểm & Khảo Thí Giáo Lý' })).toBeVisible()
    expect(await outgoingFrame!.evaluate(frame => frame.isConnected)).toBe(false)

    await dashboard.click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/grades$/)
    await expect(grades).toHaveAttribute('aria-current', 'page')
    expect(errors).toEqual([])
  } finally {
    release()
  }
})

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`mobile rapid taps can return to the current tab while another route import is pending (${reducedMotion})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion })
    await installUiBoot(page)
    await injectSession(page, await getAdminSession(page.request))
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    let requested = false
    let release!: () => void
    const heldImport = new Promise<void>(resolve => { release = resolve })
    await page.route(/\/src\/pages\/AttendancePage\.tsx(?:\?|$)/, async route => {
      requested = true
      await heldImport
      await route.continue()
    })

    try {
      await page.goto('/dashboard')
      const main = page.locator('#main-content')
      await expect(main.locator('.product-view').first()).toBeVisible()
      const nav = page.getByRole('navigation', { name: 'Điều hướng chính' })
      const frame = main.locator('.route-transition-frame')
      await expect(frame).toHaveClass(/route-transition-frame--fallback/)
      await expect(frame).toHaveCSS('animation-name', reducedMotion === 'reduce' ? 'none' : 'routePageEnter')
      const attendance = nav.getByRole('button', { name: 'Điểm Danh', exact: true })
      const home = nav.getByRole('button', { name: 'Trang Chủ', exact: true })

      await attendance.click()
      await expect.poll(() => requested).toBe(true)
      await expect(attendance).toHaveAttribute('aria-busy', 'true')
      await expect(home).toHaveAttribute('aria-current', 'page')
      await expect(main.getByText('Đang chuẩn bị nội dung…')).toHaveCount(0)

      await home.click()
      await expect(attendance).not.toHaveAttribute('aria-busy')
      const importResponse = page.waitForResponse(response => /\/src\/pages\/AttendancePage\.tsx(?:\?|$)/.test(response.url()))
      release()
      await (await importResponse).finished()
      await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }))
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(home).toHaveAttribute('aria-current', 'page')
      // A subsequent real navigation must settle on the latest intent, including
      // after the older, held module finishes and history navigation resumes.
      const reports = nav.getByRole('button', { name: 'Báo Cáo', exact: true })
      await reports.click()
      await expect(page).toHaveURL(/\/reports$/)
      await expect(reports).toHaveAttribute('aria-current', 'page')
      await expect(main.locator('.product-view').first()).toBeVisible()
      await home.click()
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(home).toHaveAttribute('aria-current', 'page')
      await expect(nav.locator('[aria-busy="true"]')).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      release()
    }
  })
}
