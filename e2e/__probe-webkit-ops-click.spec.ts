import { expect, test } from '@playwright/test'
import { getAdminSession, injectSession } from './helpers'
import {
  installUiBoot,
  openParishRecordEditor,
  openProtectedObservation,
} from './design-system-matrix'

test.describe('PROBE webkit sidebar-click to /operations', () => {
  test.describe.configure({ timeout: 120_000 })

  test('B1 fresh dashboard -> sidebar click Cong Viec', async ({ page }) => {
    page.on('console', msg => console.log(`[B1 console:${msg.type()}] ${msg.text().slice(0, 300)}`))
    page.on('pageerror', err => console.log(`[B1 pageerror] ${String(err).slice(0, 500)}`))
    await installUiBoot(page)
    await injectSession(page, await getAdminSession(page.request))
    await page.goto('/dashboard')
    await openProtectedObservation(page, '/operations', 'desktop', 'probe-b1')
    await expect(page).toHaveURL(/\/operations$/)
    console.log('[B1] reached /operations OK')
  })

  test('B2 parish-profile + record editor -> sidebar click Cong Viec', async ({ page }) => {
    page.on('console', msg => console.log(`[B2 console:${msg.type()}] ${msg.text().slice(0, 300)}`))
    page.on('pageerror', err => console.log(`[B2 pageerror] ${String(err).slice(0, 500)}`))
    page.on('requestfailed', req => console.log(`[B2 requestfailed] ${req.method()} ${req.url().slice(0, 160)} :: ${req.failure()?.errorText}`))
    await installUiBoot(page)
    await injectSession(page, await getAdminSession(page.request))
    await page.goto('/dashboard')
    await openProtectedObservation(page, '/parish-profile', 'desktop', 'probe-b2-profile')
    const dialog = await openParishRecordEditor(page)
    await dialog.getByRole('button', { name: 'Đóng' }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    console.log(`[B2] dialog closed, url=${page.url()}`)
    const navItem = page
      .getByRole('navigation', { name: 'Điều hướng quản lý' })
      .getByRole('button', { name: 'Công Việc', exact: true })
    await expect(navItem).toBeVisible({ timeout: 15_000 })
    await navItem.click({ timeout: 60_000 })
    console.log(`[B2] click returned, url=${page.url()}`)
    await expect(page).toHaveURL(/\/operations$/)
    console.log('[B2] reached /operations OK')
  })
})
