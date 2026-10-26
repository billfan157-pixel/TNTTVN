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
    await page.goto('/dashboard')
    await page.getByRole('navigation', { name: 'Điều hướng quản lý' })
      .getByRole('button', { name: 'Thiếu Nhi', exact: true }).click()
    await expect(page).toHaveURL('/students')
  })

  test('navigates to Grades page via sidebar', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('navigation', { name: 'Điều hướng quản lý' })
      .getByRole('button', { name: 'Bảng Điểm', exact: true }).click()
    await expect(page).toHaveURL('/grades')
  })

  test('navigates to Attendance page via sidebar', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('navigation', { name: 'Điều hướng quản lý' })
      .getByRole('button', { name: 'Điểm Danh', exact: true }).click()
    await expect(page).toHaveURL('/attendance')
    await page.getByRole('tab', { name: 'Sổ Điểm Danh' }).click()
    await expect(page.getByText(/Điểm Danh (&|và)? Chuyên Cần/)).toBeVisible()
  })
})

test.describe('Critical Path — Attendance', () => {
  test('change student status and save attendance', async ({ page }, testInfo) => {
    // Browser time is Asia/Ho_Chi_Minh while the server's future-date guard
    // uses UTC. Own a past date for each browser/retry instead of wall-clock Sunday.
    const dateOffset = testInfo.repeatEachIndex * 4 + testInfo.retry * 2
      + (testInfo.project.name === 'webkit' ? 1 : 0)
    const testDate = new Date(Date.UTC(2026, 8, 6 + dateOffset)).toISOString().slice(0, 10)
    const attendanceResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/attendance'
        && new URL(response.url()).searchParams.get('includeScope') === 'true'
        && response.request().method() === 'GET')
    await page.goto('/attendance')
    await page.getByRole('tab', { name: 'Sổ Điểm Danh' }).click()
    await expect(page.getByText(/Điểm Danh (&|và)? Chuyên Cần/)).toBeVisible()
    expect((await attendanceResponse).status()).toBe(200)
    await page.getByLabel('Ngày điểm danh', { exact: true }).fill(testDate)

    const studentRow = page.getByRole('row', { name: /Maria Thiếu Nhi E2E E2E-001/ })
    await expect(studentRow.getByText('Thiếu Nhi E2E', { exact: true })).toBeVisible()
    await studentRow.getByRole('radio', { name: 'Vắng', exact: true }).click()

    const saveResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/attendance/batch'
        && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Lưu Điểm Danh' }).click()
    const saved = await saveResponse
    expect(saved.status()).toBe(200)
    expect(saved.request().postDataJSON()).toMatchObject({ date: testDate })
    expect((await saved.json()).data.results).toContainEqual(expect.objectContaining({
      studentId: 'student-e2e-001', record: expect.objectContaining({ status: 'AbsentUnexcused' }),
    }))
    await expect(page.getByText('Đã Lưu!')).toBeVisible()
  })
})
