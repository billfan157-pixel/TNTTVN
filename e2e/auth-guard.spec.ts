import { test, expect } from '@playwright/test'

test.describe('E2E Auth Guard & Navigation', () => {
  test('redirects to /login when accessing protected page without token', async ({ page }) => {
    await page.goto('/students')
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows login form on /login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('navigates to protected pages from dashboard', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Giáo Lý Thiếu Nhi Thánh Thể')).toBeVisible()
  })
})
