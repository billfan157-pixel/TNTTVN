import { test, expect } from '@playwright/test'

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

  test('redirects to dashboard after setting auth token', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('parish_access_token', 'test-token')
      localStorage.setItem('parish_refresh_token', 'test-refresh')
      localStorage.setItem('parish_current_user', JSON.stringify({
        id: '1', username: 'admin', fullName: 'Admin Test', role: 'admin', parishId: 'test-parish'
      }))
    })
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('empty submit on staff portal does not navigate away', async ({ page }) => {
    await page.goto('/login/nhan-su')
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/\/login\/nhan-su/)
  })
})