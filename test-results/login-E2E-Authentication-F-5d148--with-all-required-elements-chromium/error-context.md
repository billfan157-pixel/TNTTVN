# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.ts >> E2E Authentication Flow >> displays login form with all required elements
- Location: e2e\login.spec.ts:4:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=admin / admin123')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=admin / admin123')

```

```yaml
- heading "Xứ Đoàn Thiếu Nhi Thánh Thể" [level=1]
- paragraph: Đăng nhập Hệ Thống Quản Lý Giáo Lý & Chuyên Cần
- text: Tên Đăng Nhập (Username)
- textbox "Nhập tên đăng nhập..."
- text: Mật Khẩu
- textbox "Nhập mật khẩu..."
- button "Đăng Nhập Ngay"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('E2E Authentication Flow', () => {
  4  |   test('displays login form with all required elements', async ({ page }) => {
  5  |     await page.goto('/login')
  6  |     await expect(page.locator('h1')).toContainText('Xứ Đoàn Thiếu Nhi Thánh Thể')
  7  | 
  8  |     await expect(page.locator('input[type="text"]')).toBeVisible()
  9  |     await expect(page.locator('input[type="password"]')).toBeVisible()
  10 |     await expect(page.locator('button[type="submit"]')).toBeVisible()
> 11 |     await expect(page.locator('text=admin / admin123')).toBeVisible()
     |                                                         ^ Error: expect(locator).toBeVisible() failed
  12 |   })
  13 | })
```