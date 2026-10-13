import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { getAdminSession, injectSession } from './helpers'
import {
  installUiBoot,
  openParishRecordEditor,
  openProtectedObservation,
  representativeProtectedRoutes,
} from './design-system-matrix'

test.describe('PROBE-C webkit matrix-prefix + axe then ops click', () => {
  test.describe.configure({ timeout: 180_000 })

  test('C1 navigations only, no axe', async ({ page }) => {
    page.on('pageerror', err => console.log(`[C1 pageerror] ${String(err).slice(0, 400)}`))
    await installUiBoot(page)
    await injectSession(page, await getAdminSession(page.request))
    await page.goto('/dashboard')
    for (const route of representativeProtectedRoutes) {
      if (route === '/operations') break
      await openProtectedObservation(page, route, 'desktop', 'probe-c1')
      if (route === '/parish-profile') {
        const dialog = await openParishRecordEditor(page)
        await dialog.getByRole('button', { name: 'Đóng' }).click()
        await expect(dialog).toBeHidden({ timeout: 15_000 })
      }
    }
    const navItem = page
      .getByRole('navigation', { name: 'Điều hướng quản lý' })
      .getByRole('button', { name: 'Công Việc', exact: true })
    await navItem.click({ timeout: 60_000 })
    await expect(page).toHaveURL(/\/operations$/)
    console.log('[C1] reached /operations OK (no axe)')
  })

  test('C2 navigations WITH axe scan each stop', async ({ page }) => {
    page.on('pageerror', err => console.log(`[C2 pageerror] ${String(err).slice(0, 400)}`))
    await installUiBoot(page)
    await injectSession(page, await getAdminSession(page.request))
    await page.goto('/dashboard')
    for (const route of representativeProtectedRoutes) {
      if (route === '/operations') break
      await openProtectedObservation(page, route, 'desktop', 'probe-c2')
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      console.log(`[C2] axe ${route}: violations=${results.violations.length}`)
      if (route === '/parish-profile') {
        const dialog = await openParishRecordEditor(page)
        await dialog.getByRole('button', { name: 'Đóng' }).click()
        await expect(dialog).toBeHidden({ timeout: 15_000 })
      }
    }
    const navItem = page
      .getByRole('navigation', { name: 'Điều hướng quản lý' })
      .getByRole('button', { name: 'Công Việc', exact: true })
    await navItem.click({ timeout: 60_000 })
    console.log(`[C2] click returned, url=${page.url()}`)
    await expect(page).toHaveURL(/\/operations$/)
    console.log('[C2] reached /operations OK (with axe)')
  })
})
