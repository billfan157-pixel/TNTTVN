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
    // StudentsPage consolidated (một mục Danh Sách & Lớp): roster theo lớp,
    // phải drill-down vào lớp của học sinh seed (CLS-TN-1 = Thiếu Nhi 1).
    await page.getByRole('button', { name: 'Xem danh sách lớp Thiếu Nhi 1' }).click()
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
    await expect(navigation.getByRole('button', { name: 'Quản Lý Hệ Thống', exact: true })).toBeVisible()
    await expect(navigation.getByRole('button', { name: 'Quỹ & Thu Chi', exact: true })).not.toBeVisible()

    await page.getByRole('group', { name: 'Chuyển không gian làm việc' })
      .getByRole('button', { name: 'Xứ Đoàn & Giáo Xứ', exact: true })
      .click()
    await expect(page).toHaveURL(/\/parish$/)
    await expect(navigation.getByRole('button', { name: 'Quỹ & Thu Chi', exact: true })).toBeVisible()
    await expect(page.getByText('BỘ LỌC PHÂN NGÀNH & LỚP')).not.toBeVisible()
  })

  test('student page shows import and create actions for admin', async ({ page }) => {
    // This case starts with an injected marker, not an activated browser session.
    // Auth and roster hydration are separate stages of the cold browser boot.
    // Wait for real responses before measuring the availability of admin actions.
    const bootstrap = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/auth/me' && response.request().method() === 'GET',
    )
    const roster = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/students' && response.request().method() === 'GET',
    )
    await page.goto('/students')
    expect((await bootstrap).status()).toBe(200)
    expect((await roster).status()).toBe(200)
    // Data hydration can finish before the lazy route module. Readiness belongs
    // to browser setup; keep the action assertions and the 30s case budget intact.
    await page.locator('#main-content .product-view').first().waitFor({ state: 'visible' })
    await expect(page.getByRole('heading', { name: 'Danh Sách Thiếu Nhi' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import Excel' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thêm Mới' })).toBeVisible()
  })
})
