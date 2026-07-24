import { test, expect } from '@playwright/test'

test.describe('E2E Authentication Flow', () => {
  test('displays login form with all required elements', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('Xứ Đoàn Thiếu Nhi Thánh Thể')
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
        id: '1', username: 'admin', fullName: 'Admin Test', role: 'admin'
      }))
    })
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('shows validation error on empty submit', async ({ page }) => {
    await page.goto('/login')
    await page.locator('button[type="submit"]').click()
    await expect(page.getByText('Vui lòng nhập đầy đủ')).toBeVisible()
  })
})
