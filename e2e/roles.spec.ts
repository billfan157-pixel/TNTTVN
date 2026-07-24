import { test, expect } from '@playwright/test'

test.describe('E2E Role-Scoped Access & Navigation Flow', () => {
  test('phuhuynh role sees limited sidebar items', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('parish_access_token', 'test-token')
      localStorage.setItem('parish_refresh_token', 'test-refresh')
      localStorage.setItem('parish_current_user', JSON.stringify({
        id: '4', username: 'phuhuynh', fullName: 'Phụ Huynh Test', role: 'phuhuynh'
      }))
    })
    await page.goto('/dashboard')
    await expect(page.getByText('Tổng Quan Giáo Xứ')).toBeVisible()
    await expect(page.getByText('Danh Sách Thiếu Nhi')).toBeVisible()
    await expect(page.getByText('Nhập Điểm Hàng Loạt')).not.toBeVisible()
    await expect(page.getByText('Báo Cáo & In Phiếu')).not.toBeVisible()
    await expect(page.getByText('Quản Lý Tài Khoản')).not.toBeVisible()
  })

  test('chunhiem role does not see Users menu', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('parish_access_token', 'test-token')
      localStorage.setItem('parish_refresh_token', 'test-refresh')
      localStorage.setItem('parish_current_user', JSON.stringify({
        id: '2', username: 'chunhiem', fullName: 'Chủ Nhiệm Test', role: 'chunhiem'
      }))
    })
    await page.goto('/dashboard')
    await expect(page.getByText('Báo Cáo & In Phiếu')).toBeVisible()
    await expect(page.getByText('Quản Lý Tài Khoản')).not.toBeVisible()
  })

  test('phuta role does not see Reports or Users menu', async ({ page }) => {
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('parish_access_token', 'test-token')
      localStorage.setItem('parish_refresh_token', 'test-refresh')
      localStorage.setItem('parish_current_user', JSON.stringify({
        id: '3', username: 'phuta', fullName: 'Phụ Tá Test', role: 'phuta'
      }))
    })
    await page.goto('/dashboard')
    await expect(page.getByText('Nhập Điểm Hàng Loạt')).toBeVisible()
    await expect(page.getByText('Báo Cáo & In Phiếu')).not.toBeVisible()
    await expect(page.getByText('Quản Lý Tài Khoản')).not.toBeVisible()
  })

  test('admin can access /users but non-admin gets redirected', async ({ page }) => {
    // Set chunhiem role
    await page.goto('/login')
    await page.evaluate(() => {
      localStorage.setItem('parish_access_token', 'test-token')
      localStorage.setItem('parish_refresh_token', 'test-refresh')
      localStorage.setItem('parish_current_user', JSON.stringify({
        id: '2', username: 'chunhiem', fullName: 'Chủ Nhiệm Test', role: 'chunhiem'
      }))
    })
    await page.goto('/users')
    await expect(page).toHaveURL(/\/dashboard/)
  })
})
