import { test, expect } from '@playwright/test'

test.describe('E2E Authentication Flow', () => {
  test('displays login form with all required elements', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('Xứ Đoàn Thiếu Nhi Thánh Thể')

    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
    await expect(page.locator('text=admin / admin123')).toBeVisible()
  })
})