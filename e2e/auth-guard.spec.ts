import { test, expect } from '@playwright/test'

test.describe('E2E Auth Guard & Navigation', () => {
  test('redirects to /login when accessing protected page without token', async ({ page }) => {
    await page.goto('/students')
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows portal chooser on /login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('Cổng Phụ Huynh')).toBeVisible()
    await expect(page.getByText('Giáo Lý Viên / Nhân Sự')).toBeVisible()
  })

  test('navigates to protected pages from dashboard', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Giáo Lý Thiếu Nhi Thánh Thể')).toBeVisible()
  })
})