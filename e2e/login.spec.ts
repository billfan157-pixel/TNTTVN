import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('E2E Authentication Flow', () => {
  test('displays portal chooser on /login with both portals', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('Xứ Đoàn Thiếu Nhi Thánh Thể')
    await expect(page.getByText('Cổng Phụ Huynh')).toBeVisible()
    await expect(page.getByText('Giáo Lý Viên / Nhân Sự')).toBeVisible()
  })

  test('parent portal shows phone login form', async ({ page }) => {
    await page.goto('/login/phuhuynh')
    await expect(page.getByText('Cổng Phụ Huynh')).toBeVisible()
    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('staff portal shows username login form', async ({ page }) => {
    await page.goto('/login/nhan-su')
    await expect(page.getByText('Giáo Lý Viên / Nhân Sự')).toBeVisible()
    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('redirects to dashboard after real seeded-admin login', async ({ page }) => {
    // TQ-F2: đăng nhập thật thay cho fake token — backend live sẽ 401 token giả
    await loginAsAdmin(page)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('empty submit on staff portal does not navigate away', async ({ page }) => {
    await page.goto('/login/nhan-su')
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/\/login\/nhan-su/)
  })
})