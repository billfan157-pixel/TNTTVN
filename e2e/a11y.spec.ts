import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

/**
 * Phase 0 — Calm 2026: axe-playwright scaffold.
 * Sprint 0 chỉ kiểm tra hạt nhân WCAG 2.2 AA không cần @axe-core (giữ R1).
 * Sprint 2 sẽ thay bằng `AxeBuilder` full (npm i -D @axe-core/playwright) khi CI ổn.
 */

test.describe('A11y — Phase 0 Gate (WCAG 2.2 AA scaffold)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('skip link & focus ring tồn tại', async ({ page }) => {
    await page.goto('/dashboard')
    // skip link is hidden until focus — check DOM
    const skip = page.locator('a.skip-link')
    await expect(skip).toHaveCount(1)
    await expect(skip).toHaveAttribute('href', '#main-content')
    // main has id
    const main = page.locator('#main-content')
    await expect(main).toHaveCount(1)
  })

  test('tables có scope="col" (data-dense readability)', async ({ page }) => {
    await page.goto('/students')
    await page.waitForTimeout(800)
    const ths = page.locator('th[scope="col"]')
    // Students, Grades, Finance, Audit đều phải có
    await expect(ths.first()).toBeVisible({ timeout: 5000 })
  })

  test('mobile bottom nav đủ 44px hit & aria-current', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/dashboard')
    const nav = page.locator('.mobile-bottom-nav')
    // may be hidden on desktop preview, but check existence
    await expect(nav).toBeVisible()
    const active = nav.locator('.mobile-bottom-nav__item.is-active')
    await expect(active.first()).toBeVisible()
    await expect(active.first()).toHaveAttribute('aria-current', 'page')
    // touch target 44px
    const box = await active.first().boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
    expect(box?.width).toBeGreaterThanOrEqual(44)
  })

  test('search input không làm mất focus khi gõ (deferred)', async ({ page }) => {
    await page.goto('/students')
    await page.waitForTimeout(800)
    const input = page.getByPlaceholder('Tìm theo tên, mã thiếu nhi...')
    await input.click()
    await input.pressSequentially('Nguyen', { delay: 50 })
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('Nguyen')
  })

  test('html scroll-padding cho Focus Not Obscured 2.4.11', async ({ page }) => {
    await page.goto('/students')
    const padding = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop)
    // should be calc(var(--app-bar-height)+16px) => ~84px
    expect(padding).not.toBe('0px')
  })
})
