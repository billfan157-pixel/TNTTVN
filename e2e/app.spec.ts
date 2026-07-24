import { test, expect } from '@playwright/test'

test.describe('Smoke Tests', () => {
  test('loads dashboard with header and student count', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('Giáo Lý Thiếu Nhi Thánh Thể')).toBeVisible()
    await expect(page.getByText(/Sổ Điểm/)).toBeVisible()
  })

  test('navigates to Students page via sidebar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Danh Sách Thiếu Nhi' }).click()
    await expect(page).toHaveURL('/students')
  })

  test('navigates to Grades page via sidebar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Nhập Điểm Hàng Loạt' }).click()
    await expect(page).toHaveURL('/grades')
  })

  test('navigates to Attendance page via sidebar', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Điểm Danh Chuyên Cần' }).click()
    await expect(page).toHaveURL('/attendance')
    await expect(page.getByText('Điểm Danh Chuyên Cần')).toBeVisible()
  })
})

test.describe('Critical Path — Attendance', () => {
  test('change student status and save attendance', async ({ page }) => {
    await page.goto('/attendance')
    await expect(page.getByText('Điểm Danh Chuyên Cần')).toBeVisible()

    await page.waitForTimeout(500)

    const vangBtns = page.getByRole('button', { name: 'Vắng' })
    const count = await vangBtns.count()
    if (count > 0) {
      await vangBtns.first().click()
    }

    await page.getByRole('button', { name: 'Lưu Điểm Danh' }).click()
    await expect(page.getByText('Đã Lưu!')).toBeVisible({ timeout: 3000 })
  })
})
