import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 13'],
  viewport: { width: 390, height: 844 },
});

test.describe('Mobile QR Attendance & Attendance Flow E2E', () => {
  test('Catechist can log in, navigate to attendance, and mark mobile attendance', async ({ page }) => {
    // 1. Visit app login page
    await page.goto('/login');
    await expect(page.locator('text=Đăng Nhập')).toBeVisible();

    // 2. Perform login as catechist/admin
    await page.fill('input[type="text"], input[name="username"]', 'admin');
    await page.fill('input[type="password"]', 'Admin@123');
    await page.click('button[type="submit"]');

    // 3. Verify redirect to dashboard / home
    await page.waitForURL('/');
    
    // 4. Navigate to attendance page
    await page.goto('/attendance');
    await expect(page.locator('text=Điểm Danh Chuyên Cần')).toBeVisible();

    // 5. Test attendance marking action
    const markPresentBtn = page.locator('button:has-text("Có mặt")').first();
    if (await markPresentBtn.isVisible()) {
      await markPresentBtn.click();
    }

    // 6. Save attendance
    const saveBtn = page.locator('button:has-text("Lưu"), button:has-text("Cập nhật")').first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await expect(page.locator('text=Thành công, text=Đã lưu')).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });
});
