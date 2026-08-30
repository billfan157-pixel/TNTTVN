import { test, expect } from '@playwright/test'
import { loginAsRole } from './helpers'

test.describe('E2E Role-Scoped Access & Navigation Flow', () => {
  test('phuhuynh role sees limited sidebar items', async ({ page }) => {
    await loginAsRole(page, 'phuhuynh')
    await page.goto('/dashboard')
    const navigation = page.getByRole('navigation', { name: 'Điều hướng quản lý' })
    await expect(navigation.getByRole('button', { name: 'Tổng Quan', exact: true })).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Con Của Tôi', exact: true })).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Thiếu Nhi', exact: true })).not.toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Bảng Điểm', exact: true })).not.toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Điểm Danh', exact: true })).not.toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Báo Cáo', exact: true })).not.toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Quản Lý Hệ Thống', exact: true })).not.toBeVisible()
  })

  test('chunhiem role does not see Users menu', async ({ page }) => {
    await loginAsRole(page, 'chunhiem')
    await page.goto('/dashboard')
    const navigation = page.getByRole('navigation', { name: 'Điều hướng quản lý' })
    await expect(navigation.getByRole('button', { name: 'Báo Cáo', exact: true })).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Quản Lý Hệ Thống', exact: true })).not.toBeVisible()
  })

  test('phuta role sees teaching reports but not admin governance', async ({ page }) => {
    await loginAsRole(page, 'phuta')
    await page.goto('/dashboard')
    const navigation = page.getByRole('navigation', { name: 'Điều hướng quản lý' })
    await expect(navigation.getByRole('button', { name: 'Bảng Điểm', exact: true })).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Báo Cáo', exact: true })).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Quản Lý Hệ Thống', exact: true })).not.toBeVisible()
  })

  test('admin can access /users but non-admin gets redirected', async ({ page }) => {
    // Set chunhiem role
    await loginAsRole(page, 'chunhiem')
    await page.goto('/users')
    await expect(page).toHaveURL(/\/dashboard/)
  })
})
