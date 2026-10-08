import { expect, test, type Page } from '@playwright/test'
import {
  authorizedRequest,
  getAdminSession,
  injectSession,
  testKey,
} from './helpers'

// The Smart Exam case boots the app twice (goto /grades, then reload) and drives
// roughly fifteen interactions plus four network round trips; the others unlock
// or lock a semester and then drive a full journey. The 30s suite default is not
// enough on a loaded CI runner — it is the same shape as the grade-entry journey
// that timed out at 30000ms in run 37732578231.
test.describe.configure({ timeout: 60_000 })

async function countPendingAttendanceOps(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const openRequest = indexedDB.open('ParishDB')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result)
      openRequest.onerror = () => reject(openRequest.error)
    })
    const transaction = database.transaction('syncQueue', 'readonly')
    const getAllRequest = transaction.objectStore('syncQueue').getAll()
    const rows = await new Promise<Array<{ entity?: string; status?: string }>>((resolve, reject) => {
      getAllRequest.onsuccess = () => resolve(getAllRequest.result)
      getAllRequest.onerror = () => reject(getAllRequest.error)
    })
    database.close()
    return rows.filter(row => row.entity === 'attendance' && ['pending', 'retrying', 'processing'].includes(row.status || '')).length
  })
}

test.describe('Critical offline, lifecycle and Smart Exam journeys', () => {
  test('@critical @mobile offline attendance queues locally then syncs exactly after reconnect', async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const session = await getAdminSession(page.request)
    await injectSession(page, session)
    await page.goto('/attendance')

    await expect(page.getByRole('tab', { name: 'Điểm Danh' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: /Chọn lớp Thiếu Nhi 1/ }).click()
    const dateInput = page.locator('input[type="date"]').first()
    // Projects, retries and repeat-each attempts share one server database.
    // Reusing a saved Absent date leaves no draft change, so Save correctly
    // disables itself. Each attempt must own a fresh attendance natural key.
    const dateOffset = testInfo.repeatEachIndex * 4 + testInfo.retry * 2
      + (testInfo.project.name === 'webkit' ? 1 : 0)
    const testDate = new Date(Date.UTC(2026, 7, 23 + dateOffset)).toISOString().slice(0, 10)
    await dateInput.fill(testDate)

    await context.setOffline(true)
    const studentStatus = page.getByRole('group', { name: 'Trạng thái của Maria Thiếu Nhi E2E' })
    await studentStatus.getByRole('button', { name: 'Vắng không phép: Maria Thiếu Nhi E2E' }).click()
    await page.getByRole('button', { name: 'Lưu điểm danh' }).click()
    await expect.poll(() => countPendingAttendanceOps(page)).toBeGreaterThan(0)

    const syncResponse = page.waitForResponse(response => (
      response.url().endsWith('/api/attendance/batch')
      && response.request().method() === 'POST'
    ))
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    const synced = await syncResponse
    expect(synced.status()).toBe(200)
    const syncResult = (await synced.json()).data as {
      results: Array<{ studentId: string; status: string; record?: { status: string } }>
    }
    expect(syncResult.results).toContainEqual(expect.objectContaining({
      studentId: 'student-e2e-001',
      status: 'saved',
      record: expect.objectContaining({ status: 'AbsentUnexcused' }),
    }))

    await expect.poll(async () => {
      const response = await authorizedRequest(
        page.request,
        session,
        'GET',
        `/api/attendance?studentId=student-e2e-001&date=${testDate}&type=SundayMass`,
      )
      if (!response.ok()) return null
      const rows = (await response.json()).data as Array<{ status: string }>
      return rows[0]?.status ?? null
    }).toBe('AbsentUnexcused')
    await expect.poll(() => countPendingAttendanceOps(page)).toBe(0)
  })

  test('@critical semester lock from UI blocks grade writes and premature promotion', async ({ page }) => {
    const session = await getAdminSession(page.request)
    const academicYear = '2026-2027'
    const setupYear = await authorizedRequest(page.request, session, 'POST', '/api/classes/academic-years', { id: academicYear })
    expect([200, 201]).toContain(setupYear.status())

    await injectSession(page, session)
    await page.goto('/academic-years')
    const yearCard = page.getByTestId(`academic-year-${academicYear}`)
    await expect(yearCard).toBeVisible()
    const openLock = yearCard.getByRole('button', { name: 'HK1: Mở' })
    if (await openLock.count()) {
      const lockResponse = page.waitForResponse(response => (
        response.url().endsWith('/api/semester-locks')
        && response.request().method() === 'POST'
      ))
      await openLock.click()
      expect((await lockResponse).status()).toBe(200)
    }
    await expect(yearCard.getByRole('button', { name: 'HK1: Đã Khóa' })).toBeVisible()

    const gradeWrite = await authorizedRequest(page.request, session, 'POST', '/api/grades', {
      studentId: 'student-e2e-001', academicYear, semester: 1, scoreOral: 9,
    })
    expect(gradeWrite.status()).toBe(403)

    const evaluationResponse = await authorizedRequest(
      page.request,
      session,
      'GET',
      `/api/promotion/evaluate/student-e2e-001?academicYear=${academicYear}`,
    )
    expect(evaluationResponse.status()).toBe(200)
    const evaluation = (await evaluationResponse.json()).data as { gpa: number; attendanceRate: number }

    const prematurePromotion = await authorizedRequest(page.request, session, 'POST', '/api/promotion/approve', {
      studentId: 'student-e2e-001',
      academicYear,
      targetClassId: 'CLS-TN-1',
      gpa: evaluation.gpa,
      attendanceRate: evaluation.attendanceRate,
    })
    expect(prematurePromotion.status()).toBe(403)
  })

  test('@critical Smart Exam uses server-authoritative MC scoring and finalizes into grades', async ({ page }, testInfo) => {
    const session = await getAdminSession(page.request)
    const subject = `OMR ${testKey(testInfo, 'E2E')}`
    // This journey owns its lifecycle precondition. A previous lock-focused
    // test intentionally closes HK1 in the shared E2E sandbox.
    const unlocked = await authorizedRequest(page.request, session, 'POST', '/api/semester-locks', {
      academicYear: '2026-2027',
      semester: 1,
      isLocked: false,
      unlockReason: 'E2E Smart Exam isolation',
    })
    expect(unlocked.status()).toBe(200)
    await injectSession(page, session)
    await page.goto('/grades')
    await expect(page.getByRole('combobox', { name: 'Chọn lớp cho ma trận điểm' })).toBeVisible()
    await page.getByRole('tab', { name: /Chấm Bài:/ }).click()
    await page.getByRole('button', { name: 'Tạo Phiên Chấm', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Tạo Phiên Chấm' })
    await dialog.getByRole('combobox', { name: 'Lớp học cho phiên chấm' }).selectOption('CLS-TN-1')
    await dialog.getByRole('button', { name: /Trắc nghiệm/ }).click()
    await dialog.getByRole('button', { name: /Giữa Kỳ/ }).click()
    await dialog.getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' }).fill(subject)
    await dialog.getByRole('spinbutton', { name: 'Số câu hỏi trắc nghiệm' }).fill('5')
    await dialog.getByRole('button', { name: 'Toàn A' }).click()

    const createResponsePromise = page.waitForResponse(response => (
      response.url().endsWith('/api/exams')
      && response.request().method() === 'POST'
    ))
    await dialog.getByRole('button', { name: 'Tạo Phiên', exact: true }).click()
    const createResponse = await createResponsePromise
    expect(createResponse.status()).toBe(201)
    const exam = (await createResponse.json()).data as { id: string }

    const answers = JSON.stringify({ 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A' })
    const scored = await authorizedRequest(page.request, session, 'POST', `/api/exams/${exam.id}/results`, {
      results: [{
        studentId: 'student-e2e-001',
        score: 0,
        source: 'omr',
        answers,
        examVersion: 'A',
        scanMetadata: JSON.stringify({
          detectionStatus: 'accepted',
          engineVersion: 'e2e-fixture',
          examVersion: 'A',
          questionCount: 5,
        }),
        clientMutationId: `${testKey(testInfo, 'mutation')}-0001`,
      }],
    })
    expect(scored.status()).toBe(200)

    const resultReadBack = await authorizedRequest(page.request, session, 'GET', `/api/exams/${exam.id}/results`)
    const storedResults = (await resultReadBack.json()).data.results as Array<{ studentId: string; score: number }>
    expect(storedResults).toContainEqual(expect.objectContaining({ studentId: 'student-e2e-001', score: 10 }))

    await page.reload()
    await page.getByRole('tab', { name: /Chấm Bài:/ }).click()
    // Reload restores the persisted selected session. Prove its identity,
    // rather than looking for a list-row button that is absent in that view.
    await expect(page.getByRole('combobox', { name: 'Chọn phiên chấm hiện tại' })).toHaveValue(exam.id)
    // The OMR fixture wrote results through the backend, outside this browser's
    // old result cache. Reopen the restored session through the real UI to pull
    // those server-authoritative results, as the original list journey did.
    await page.getByRole('button', { name: 'Danh sách phiên', exact: true }).click()
    const resultsResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/exams/${exam.id}/results`
        && response.request().method() === 'GET')
    await page.getByRole('button', { name: subject, exact: false }).click()
    expect((await resultsResponse).status()).toBe(200)
    await expect(page.getByText('Kết quả đã lưu (1)')).toBeVisible()
    const completeResponsePromise = page.waitForResponse(response => (
      response.url().endsWith(`/api/exams/${exam.id}/complete`)
      && response.request().method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Hoàn Tất Phiên Chấm' }).click()
    expect((await completeResponsePromise).status()).toBe(200)
    await expect(page.getByText(/Hoàn tất phiên chấm thành công/)).toBeVisible()

    const [completedExam, gradesResponse] = await Promise.all([
      authorizedRequest(page.request, session, 'GET', `/api/exams/${exam.id}`),
      authorizedRequest(page.request, session, 'GET', '/api/grades'),
    ])
    expect((await completedExam.json()).data.status).toBe('completed')
    const grades = (await gradesResponse.json()).data as Array<Record<string, unknown>>
    expect(grades).toContainEqual(expect.objectContaining({
      studentId: 'student-e2e-001', academicYear: '2026-2027', semester: 1, scoreMidterm: 10,
    }))

    const mutateCompleted = await authorizedRequest(page.request, session, 'POST', `/api/exams/${exam.id}/results`, {
      results: [{ studentId: 'student-e2e-001', score: 5, source: 'quick_entry' }],
    })
    expect(mutateCompleted.status()).toBe(409)
  })
})
