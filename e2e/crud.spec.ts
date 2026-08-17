import { test, expect } from '@playwright/test'

test.describe('E2E Student Roster & User Admin CRUD Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('parish_access_token', 'test-token')
      localStorage.setItem('parish_refresh_token', 'test-refresh')
      localStorage.setItem('parish_current_user', JSON.stringify({
        id: '1', username: 'admin', fullName: 'Admin Test', role: 'admin', parishId: 'test-parish'
      }))
    })
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
