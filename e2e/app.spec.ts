import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page)
})

test.describe('Smoke Tests', () => {
  test('loads dashboard with header and student count', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('Tổng thiếu nhi', { exact: true })).toBeVisible()
  })

  test('navigates to Students page via sidebar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Điều hướng quản lý' })
      .getByRole('button', { name: 'Thiếu Nhi', exact: true }).click()
    await expect(page).toHaveURL('/students')
  })

  test('navigates to Grades page via sidebar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Điều hướng quản lý' })
      .getByRole('button', { name: 'Bảng Điểm', exact: true }).click()
    await expect(page).toHaveURL('/grades')
  })

  test('navigates to Attendance page via sidebar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Điều hướng quản lý' })
      .getByRole('button', { name: 'Điểm Danh', exact: true }).click()
    await expect(page).toHaveURL('/attendance')
    await page.getByRole('tab', { name: 'Sổ Điểm Danh' }).click()
    await expect(page.getByText('Điểm Danh Chuyên Cần')).toBeVisible()
  })
})

test.describe('Critical Path — Attendance', () => {
  test('change student status and save attendance', async ({ page }) => {
    await page.goto('/attendance')
    await page.getByRole('tab', { name: 'Sổ Điểm Danh' }).click()
    await expect(page.getByText('Điểm Danh Chuyên Cần')).toBeVisible()

    await expect(page.getByText('Thiếu Nhi E2E')).toBeVisible()
    await page.getByRole('radio', { name: 'Vắng', exact: true }).click()

    await page.getByRole('button', { name: 'Lưu Điểm Danh' }).click()
    await expect(page.getByText('Đã Lưu!')).toBeVisible({ timeout: 5000 })
  })
})
