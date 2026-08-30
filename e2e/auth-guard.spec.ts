import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

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
    await loginAsAdmin(page)
    await page.goto('/dashboard')
    const navigation = page.getByRole('navigation', { name: 'Điều hướng quản lý' })
    await expect(navigation.getByRole('button', { name: 'Tổng Quan', exact: true })).toBeVisible()
    await navigation.getByRole('button', { name: 'Thiếu Nhi', exact: true }).click()
    await expect(page).toHaveURL('/students')
  })
})
