import { test, expect } from '@playwright/test'
import { loginAsRole } from './helpers'

test.describe('E2E Role-Scoped Access & Navigation Flow', () => {
  test('phuhuynh role sees limited sidebar items', async ({ page }) => {
    await loginAsRole(page, 'phuhuynh')
    await page.goto('/dashboard')
    await expect(page.getByText('Tổng Quan Giáo Xứ')).toBeVisible()
    await expect(page.getByText('Danh Sách Thiếu Nhi')).toBeVisible()
    await expect(page.getByText('Nhập Điểm Hàng Loạt')).not.toBeVisible()
    await expect(page.getByText('Báo Cáo & In Phiếu')).not.toBeVisible()
    await expect(page.getByText('Quản Lý Tài Khoản')).not.toBeVisible()
  })

  test('chunhiem role does not see Users menu', async ({ page }) => {
    await loginAsRole(page, 'chunhiem')
    await page.goto('/dashboard')
    await expect(page.getByText('Báo Cáo & In Phiếu')).toBeVisible()
    await expect(page.getByText('Quản Lý Tài Khoản')).not.toBeVisible()
  })

  test('phuta role does not see Reports or Users menu', async ({ page }) => {
    await loginAsRole(page, 'phuta')
    await page.goto('/dashboard')
    await expect(page.getByText('Nhập Điểm Hàng Loạt')).toBeVisible()
    await expect(page.getByText('Báo Cáo & In Phiếu')).not.toBeVisible()
    await expect(page.getByText('Quản Lý Tài Khoản')).not.toBeVisible()
  })

  test('admin can access /users but non-admin gets redirected', async ({ page }) => {
    // Set chunhiem role
    await loginAsRole(page, 'chunhiem')
    await page.goto('/users')
    await expect(page).toHaveURL(/\/dashboard/)
  })
})
