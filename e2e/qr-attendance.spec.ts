import { test, expect, devices } from '@playwright/test'
import { loginAsRole } from './helpers'

test.use({
  ...devices['iPhone 13'],
  viewport: { width: 390, height: 844 },
})

test.describe('Mobile QR Attendance & Attendance Flow E2E', () => {
  test('Catechist can log in, navigate to attendance, and mark mobile attendance', async ({ page }) => {
    await loginAsRole(page, 'chunhiem')
    await page.goto('/attendance')

    await expect(page.getByRole('tab', { name: 'Điểm Danh' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Thiếu Nhi E2E')).toBeVisible()
    // Fresh sandbox records are unsaved; a previous attendance spec may have
    // persisted a non-present state. This action is deterministic in both cases.
    await page.getByRole('button', { name: 'Có mặt tất cả' }).click()
    await expect(page.getByRole('button', { name: 'Lưu điểm danh' })).toBeEnabled()
    await page.getByRole('button', { name: 'Lưu điểm danh' }).click()
    await expect(page.getByText('Đã lưu điểm danh cho 1 thiếu nhi.')).toBeVisible({ timeout: 5000 })
  })
})
