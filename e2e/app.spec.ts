import { test, expect } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, loginAsAdmin, testKey, waitForBootstrapBaseline } from './helpers'

test.describe('Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

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
    // This journey includes two authenticated boots, a save and API read-back.
    test.setTimeout(90_000)
    const session = await getAdminSession(page.request)
    const key = `${testKey(testInfo, 'ATT')}-${testInfo.repeatEachIndex}`
    const createdClass = await authorizedRequest(page.request, session, 'POST', '/api/classes', {
      code: key, name: `Lớp ${key}`, branchId: 'ThieuNhi', academicYearId: '2026-2027',
    })
    expect(createdClass.status()).toBe(201)
    const { id: classId } = (await createdClass.json()).data as { id: string }
    const classmates: Array<{ id: string; fullName: string }> = []
    for (const label of ['Vắng', 'Có mặt']) {
      const fullName = `${key} ${label}`
      const created = await authorizedRequest(page.request, session, 'POST', '/api/students', {
        fullName, holyName: 'Maria', gender: 'Nữ', dateOfBirth: '2015-01-01', branch: 'ThieuNhi', classId,
      })
      expect(created.status()).toBe(201)
      const { id } = (await created.json()).data as { id: string }
      classmates.push({ id, fullName })
    }
    const [target, control] = classmates

    // Browser time is Asia/Ho_Chi_Minh while the server's future-date guard
    // uses UTC. Own a past date for each browser/retry instead of wall-clock Sunday.
    const dateOffset = testInfo.repeatEachIndex * 4 + testInfo.retry * 2
      + (testInfo.project.name === 'webkit' ? 1 : 0)
    const testDate = new Date(Date.UTC(2026, 8, 6 + dateOffset)).toISOString().slice(0, 10)
    const attendanceResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/attendance'
        && new URL(response.url()).searchParams.get('includeScope') === 'true'
        && response.request().method() === 'GET')
    await injectSession(page, session)
    // Saving "all classes" made this single-student case write every fixture
    // left by earlier specs (72 rows in CI). Own a fixed two-student roster.
    await page.goto(`/attendance?tab=attendance&classId=${classId}&date=${testDate}`)
    await waitForBootstrapBaseline(page, 45_000)
    await expect(page.getByText(/Điểm Danh (&|và)? Chuyên Cần/)).toBeVisible()
    expect((await attendanceResponse).status()).toBe(200)
    await expect(page.getByRole('combobox', { name: 'Chọn lớp điểm danh', exact: true })).toHaveValue(classId)
    await expect(page.getByLabel('Ngày điểm danh', { exact: true })).toHaveValue(testDate)

    // Row text also contains the class name and every status label. The exact
    // labelled group identifies one student even when their name contains one.
    const studentStatus = page.getByRole('radiogroup', { name: `Điểm danh ${target.fullName}`, exact: true })
    const controlStatus = page.getByRole('radiogroup', { name: `Điểm danh ${control.fullName}`, exact: true })
    await expect(studentStatus).toHaveCount(1)
    await expect(controlStatus).toHaveCount(1)
    await expect(studentStatus.getByRole('radio', { name: 'Có mặt', exact: true })).toHaveAttribute('aria-checked', 'true')
    await studentStatus.getByRole('radio', { name: 'Vắng', exact: true }).click()
    await expect(studentStatus.getByRole('radio', { name: 'Vắng', exact: true })).toHaveAttribute('aria-checked', 'true')

    const saveResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/attendance/batch'
        && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Lưu Điểm Danh' }).click()
    const saved = await saveResponse
    expect(saved.status()).toBe(200)
    const expectedRecords = [
      { studentId: target.id, status: 'AbsentUnexcused' },
      { studentId: control.id, status: 'Present' },
    ]
    const payload = saved.request().postDataJSON()
    expect(payload).toMatchObject({ date: testDate, type: 'SundayMass' })
    expect(payload.records).toHaveLength(2)
    expect(payload.records).toEqual(expect.arrayContaining(expectedRecords.map(record => expect.objectContaining(record))))
    const receipt = (await saved.json()).data
    expect(receipt).toMatchObject({ total: 2, successCount: 2, conflictCount: 0, errorCount: 0 })
    expect(receipt.results).toHaveLength(2)
    for (const record of expectedRecords) {
      expect(receipt.results).toContainEqual(expect.objectContaining({
        studentId: record.studentId, status: 'saved',
        record: expect.objectContaining({ ...record, date: testDate, type: 'SundayMass' }),
      }))
    }
    await expect(page.getByText('Đã Lưu!')).toBeVisible()

    for (const record of expectedRecords) {
      const readBack = await authorizedRequest(page.request, session, 'GET',
        `/api/attendance?studentId=${record.studentId}&date=${testDate}&type=SundayMass`)
      expect(readBack.status()).toBe(200)
      expect((await readBack.json()).data).toEqual([
        expect.objectContaining({ ...record, date: testDate, type: 'SundayMass' }),
      ])
    }
    await page.reload()
    await expect(studentStatus.getByRole('radio', { name: 'Vắng', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(controlStatus.getByRole('radio', { name: 'Có mặt', exact: true })).toHaveAttribute('aria-checked', 'true')
  })
})
