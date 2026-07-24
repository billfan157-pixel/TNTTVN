import { test, expect } from '@playwright/test'

test.describe('E2E Authentication Flow', () => {
  test('displays login form and allows user login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('Xứ Đoàn Thiếu Nhi Thánh Thể')

    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button[type="submit"]')

    // Successful login redirects to dashboard
    await expect(page).toHaveURL(/\/dashboard|\/$/)
  })
})
