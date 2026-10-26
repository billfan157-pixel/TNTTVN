import { test, expect } from '@playwright/test'
import { authorizedRequest, getRoleSession, injectSession } from './helpers'

// CI-root-cause (2026-09-04): file này từng dùng devices['iPhone 13'] (cần
// engine webkit) trong khi CI chỉ cài chromium → browserType.launch fail.
// Mục đích test là viewport/touch mobile, không phải engine Safari — emulate
// mobile trên chromium (390x844 + touch), giữ nguyên hành vi cần kiểm.
test.use({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
})

test.describe('Mobile QR Attendance & Attendance Flow E2E', () => {
  test('Catechist can log in, navigate to attendance, and mark mobile attendance', async ({ page }, testInfo) => {
    // Keep the success path in the seeded academic year and independent of
    // Vietnam/UTC midnight. Use a different date from the desktop journey.
    const dateOffset = testInfo.repeatEachIndex * 4 + testInfo.retry * 2
      + (testInfo.project.name === 'webkit' ? 1 : 0)
    const testDate = new Date(Date.UTC(2026, 8, 13 + dateOffset)).toISOString().slice(0, 10)
    const session = await getRoleSession(page.request, 'chunhiem')
    await injectSession(page, session)
    const attendanceResponsePromise = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/attendance'
      && new URL(response.url()).searchParams.get('includeScope') === 'true'
      && response.request().method() === 'GET')
    await page.goto('/attendance')

    const attendanceTab = page.getByRole('tab', { name: 'Điểm Danh' })
    await expect(attendanceTab).toBeVisible({ timeout: 15_000 })
    await expect(attendanceTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Thiếu Nhi E2E', { exact: true })).toBeVisible()
    // Toggle status to guarantee a state change regardless of pre-existing state in shared test DB
    const studentStatus = page.getByRole('group', { name: 'Trạng thái của Maria Thiếu Nhi E2E', exact: true })
    // The roster can paint before attendance finishes hydrating. Wait for the
    // real row for this fixture/date/session before choosing a different status.
    const attendanceResponse = await attendanceResponsePromise
    expect(attendanceResponse.status()).toBe(200)
    const serverRows = (await attendanceResponse.json()).data.records as Array<{
      studentId: string; date: string; type: string;
      status: 'Present' | 'AbsentExcused' | 'AbsentUnexcused';
    }>
    expect(Array.isArray(serverRows)).toBe(true)
    await page.getByLabel('Ngày', { exact: true }).fill(testDate)
    const date = await page.getByLabel('Ngày', { exact: true }).inputValue()
    expect(date).toBe(testDate)
    const type = await page.getByLabel('Buổi sinh hoạt').inputValue()
    const persisted = serverRows.find(row => row.studentId === 'student-e2e-001' && row.date === date && row.type === type)
    const statusNames = { Present: /^Có mặt:/, AbsentExcused: /^Vắng có phép:/, AbsentUnexcused: /^Vắng không phép:/ }
    await expect(studentStatus.getByRole('button', { name: statusNames[persisted?.status || 'Present'] }))
      .toHaveAttribute('aria-pressed', 'true')
    const presentBtn = studentStatus.getByRole('button', { name: /Có mặt:/ })
    const isPresent = (await presentBtn.getAttribute('aria-pressed')) === 'true'
    const expectedStatus = isPresent ? 'AbsentExcused' : 'Present'
    if (isPresent) {
      await studentStatus.getByRole('button', { name: /Vắng có phép:/ }).click()
    } else {
      await presentBtn.click()
    }
    await expect(page.getByRole('button', { name: 'Lưu điểm danh' })).toBeEnabled()
    const savedResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/attendance/batch'
      && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Lưu điểm danh' }).click()
    const saved = await savedResponse
    expect(saved.status()).toBe(200)
    expect(saved.request().postDataJSON()).toMatchObject({ date: testDate })
    const receipt = (await saved.json()).data
    expect(receipt).toMatchObject({ errorCount: 0, conflictCount: 0 })
    expect(receipt.results).toContainEqual(expect.objectContaining({ studentId: 'student-e2e-001', status: 'saved' }))
    // Other journeys may add classmates; the receipt covers the whole roster.
    await expect(page.getByText(`Đã lưu điểm danh cho ${receipt.successCount} thiếu nhi.`)).toBeVisible()
    const readBack = await authorizedRequest(page.request, session, 'GET',
      `/api/attendance?studentId=student-e2e-001&date=${date}&type=${type}`)
    expect(readBack.status()).toBe(200)
    expect((await readBack.json()).data).toContainEqual(expect.objectContaining({
      studentId: 'student-e2e-001', date, type, status: expectedStatus,
    }))
  })
})
