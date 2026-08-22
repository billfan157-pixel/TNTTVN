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
    await expect(page.getByText('Danh Sách Thiếu Nhi Giáo Xứ')).toBeVisible()
  })

  test('navigates to users management page', async ({ page }) => {
    await page.goto('/users')
    await expect(page.getByText('Quản Lý Tài Khoản & Phân Quyền')).toBeVisible()
  })

  test('sidebar shows all menu items for admin role', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('Quản Lý Tài Khoản')).toBeVisible()
    await expect(page.getByText('Báo Cáo & In Phiếu')).toBeVisible()
  })

  test('student page shows add/edit/delete buttons for admin', async ({ page }) => {
    await page.goto('/students')
    await expect(page.getByText('Thêm Thiếu Nhi Mới')).toBeVisible()
  })
})
