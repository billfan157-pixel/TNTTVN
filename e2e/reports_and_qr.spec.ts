import { test, expect } from '@playwright/test'

test.describe('Brave Davinci E2E - PDF Export and QR Verification', () => {
  test('should render verification page and handle missing parameters', async ({ page }) => {
    await page.goto('/verify')
    await expect(page.locator('h1')).toContainText('Cổng Xác Thực Kết Quả Học Tập')
    await expect(page.getByText('Thiếu tham số quét QR')).toBeVisible()
  })

  test('should display verification result UI on valid scan parameters', async ({ page }) => {
    await page.goto('/verify?studentId=STUDENT-TEST-001&academicYear=2025-2026&certId=REP-STUDENT-TEST-001-2025-2026&sig=validsigmock')

    await expect(page.locator('h2')).toContainText('Kết quả Kiểm tra Nguyên vẹn')
  })

  test('should display verification response error when signature is invalid', async ({ page }) => {
    await page.goto('/verify?studentId=STUDENT-TEST-001&academicYear=2025-2026&certId=REP-STUDENT-TEST-001-2025-2026&sig=invalidsignature123')

    await expect(page.locator('body')).toContainText('Lỗi Hệ thống Xác Thực')
  })
})
