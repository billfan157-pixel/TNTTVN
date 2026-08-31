import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('E2E Student Roster & User Admin CRUD Flow', () => {
  test.beforeEach(async ({ page }) => {
    // TQ-F2: đăng nhập THẬT qua /api/auth/login (bill / SEED_ADMIN_PASSWORD) —
    // fake-token cũ bị backend 401 → redirect login trước khi assert.
    await loginAsAdmin(page)
  })

  test('navigates to students page and sees student list', async ({ page }) => {
    await page.goto('/students')
    await expect(page.getByRole('heading', { name: 'Danh Sách Thiếu Nhi' })).toBeVisible()
    await expect(page.getByText('Thiếu Nhi E2E')).toBeVisible()
  })

  test('navigates to users management page', async ({ page }) => {
    await page.goto('/users')
    await expect(page.getByText('Quản Lý Tài Khoản & Phân Quyền')).toBeVisible()
  })

  test('sidebar shows all menu items for admin role', async ({ page }) => {
    await page.goto('/dashboard')
    const navigation = page.getByRole('navigation', { name: 'Điều hướng quản lý' })
    await expect(navigation.getByRole('button', { name: 'Báo Cáo', exact: true })).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Quản lý hệ thống', exact: true })).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Quỹ & thu chi', exact: true })).not.toBeVisible()

    await page.getByRole('group', { name: 'Chuyển không gian làm việc' })
      .getByRole('button', { name: 'Xứ đoàn & Giáo xứ', exact: true })
      .click()
    await expect(page).toHaveURL(/\/parish$/)
    await expect(navigation.getByRole('button', { name: 'Quỹ & thu chi', exact: true })).toBeVisible()
    await expect(page.getByText('BỘ LỌC PHÂN NGÀNH & LỚP')).not.toBeVisible()
  })

  test('student page shows import and create actions for admin', async ({ page }) => {
    await page.goto('/students')
    await expect(page.getByRole('button', { name: 'Import Excel' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thêm Mới' })).toBeVisible()
  })
})
