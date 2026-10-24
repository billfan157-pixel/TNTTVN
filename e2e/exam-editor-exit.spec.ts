import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey, waitForBootstrapBaseline } from './helpers'
import { installUiBoot } from './design-system-matrix'

for (const width of [1280, 390, 320]) {
  test(`protects exam edits on close, browser Back and save-and-exit at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 900 })
    await installUiBoot(page)
    const actor = await getAdminSession(page.request)
    const subject = testKey(testInfo, 'ExitEditor')
    const created = await authorizedRequest(page.request, actor, 'POST', '/api/exams', {
      classId: 'CLS-TN-1', subject, scoreType: '15m', maxScore: 10, academicYear: '2026-2027',
      semester: 1, examType: 'multiple_choice', questionCount: 1, answerKey: '{"1":"A"}',
    })
    expect(created.status()).toBe(201)
    const exam = (await created.json()).data as { id: string }
    await injectSession(page, actor)
    await page.goto('/dashboard')
    await waitForBootstrapBaseline(page)
    await page.getByRole('button', { name: 'Bảng Điểm', exact: true }).click()
    await expect(page).toHaveURL(/\/grades/)
    await page.getByRole('tab', { name: width >= 1024 ? /Chấm Bài:/ : 'Chấm bài', exact: width < 1024 }).click()
    await page.getByText(subject, { exact: true }).click()
    await page.getByRole('button', { name: 'Sửa đề thi', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Sửa đề thi', exact: true })
    await expect(editor.getByRole('button', { name: 'Đóng', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(editor).toBeHidden()
    await expect(page.getByRole('dialog', { name: 'Lưu thay đổi trước khi thoát?' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Sửa đề thi', exact: true }).click()
    const subjectInput = editor.getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' })
    await subjectInput.fill(`${subject} không lưu`)
    await editor.getByRole('button', { name: 'Đóng', exact: true }).click()
    const prompt = page.getByRole('dialog', { name: 'Lưu thay đổi trước khi thoát?', exact: true })
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Tiếp tục chỉnh sửa', exact: true }).click()
    await expect(prompt).toBeHidden()
    await expect(subjectInput).toHaveValue(`${subject} không lưu`)
    await page.keyboard.press('Escape')
    await prompt.getByRole('button', { name: 'Không lưu', exact: true }).click()
    await expect(editor).toBeHidden()
    const discarded = await authorizedRequest(page.request, actor, 'GET', `/api/exams/${exam.id}`)
    expect((await discarded.json()).data.subject).toBe(subject)

    await page.getByRole('button', { name: 'Sửa đề thi', exact: true }).click()
    await subjectInput.fill(`${subject} đã lưu`)
    await editor.getByRole('button', { name: 'Câu 1, đáp án C', exact: true }).click()
    if (testInfo.project.name === 'chromium') {
      const browserWarning = page.waitForEvent('dialog')
      const reload = page.reload({ timeout: 5_000 }).catch(() => undefined) // Dismissing beforeunload cancels this navigation.
      const warning = await browserWarning
      expect(warning.type()).toBe('beforeunload')
      await warning.dismiss()
      await reload
      await expect(subjectInput).toHaveValue(`${subject} đã lưu`)
    }
    await page.evaluate(() => window.history.back())
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Tiếp tục chỉnh sửa', exact: true }).click()
    await expect(page).toHaveURL(/\/grades/)
    await expect(subjectInput).toHaveValue(`${subject} đã lưu`)
    await page.evaluate(() => window.history.back())
    await expect(prompt).toBeVisible()
    expect(await prompt.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await expect(prompt.getByRole('button', { name: 'Lưu và thoát', exact: true })).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath(`exam-exit-warning-${width}.png`) })
    const saved = page.waitForResponse(response => response.request().method() === 'PUT'
      && response.url().endsWith(`/api/exams/${exam.id}/definition`))
    await prompt.getByRole('button', { name: 'Lưu và thoát', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await expect(page).toHaveURL(/\/dashboard$/)
    const persisted = await authorizedRequest(page.request, actor, 'GET', `/api/exams/${exam.id}`)
    const current = (await persisted.json()).data
    expect(current.subject).toBe(`${subject} đã lưu`)
    expect(JSON.parse(current.answerKey)).toEqual({ 1: 'C' })
  })
}
