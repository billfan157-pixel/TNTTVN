import { test, expect } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey } from './helpers'

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
test(`creates and edits an ungraded exam with a visible footer at ${viewport.width}px`, async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const actor = await getAdminSession(page.request)
  const subject = testKey(testInfo, 'Editor')
  await authorizedRequest(page.request, actor, 'POST', '/api/semester-locks', {
    academicYear: '2026-2027', semester: 1, isLocked: false, unlockReason: 'Exam editor E2E isolation',
  })
  await injectSession(page, actor)
  await page.setViewportSize(viewport)
  await page.goto('/grades')
  await page.getByRole('tab', { name: viewport.width >= 1024 ? /Chấm Bài:/ : 'Chấm bài', exact: viewport.width < 1024 }).click()
  await page.getByRole('button', { name: viewport.width >= 1024 ? 'Tạo Phiên Chấm' : 'Tạo Phiên', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Tạo Phiên Chấm' })
  await dialog.getByRole('combobox', { name: 'Lớp học cho phiên chấm' }).selectOption('CLS-TN-1')
  await dialog.getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' }).fill(subject)
  await dialog.getByRole('button', { name: /Trắc nghiệm/ }).click()
  await dialog.getByRole('spinbutton', { name: 'Số câu hỏi trắc nghiệm' }).fill('50')
  await dialog.getByRole('button', { name: 'Toàn A', exact: true }).click()
  const create = dialog.getByRole('button', { name: 'Tạo Phiên', exact: true })
  await expect(create).toBeEnabled()
    await expect(dialog).toBeVisible()
    await dialog.locator('.modal-content__body').evaluate(el => { el.scrollTop = el.scrollHeight })
    await expect(create).toBeInViewport()
    expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    const name = `exam-create-${viewport.width}-${testInfo.project.name}.png`
    await dialog.locator('.modal-content__body').evaluate(el => { el.scrollTop = 0 })
    await page.screenshot({ path: testInfo.outputPath(name), fullPage: false })
  await dialog.getByRole('spinbutton', { name: 'Số câu hỏi trắc nghiệm' }).fill('2')
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/exams'))
  await create.click()
  const created = await response
  expect(created.status()).toBe(201)
  const exam = (await created.json()).data
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Sửa đề thi', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Sửa đề thi' })
  await expect(editor.getByRole('combobox', { name: 'Lớp học cho phiên chấm' })).toBeDisabled()
  await editor.getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' }).fill(`${subject} đã sửa`)
  await editor.getByRole('button', { name: 'Câu 1, đáp án C', exact: true }).click()
  const update = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith(`/api/exams/${exam.id}/definition`))
  await editor.getByRole('button', { name: 'Lưu đề thi', exact: true }).click()
  expect((await update).status()).toBe(200)
  const persisted = await authorizedRequest(page.request, actor, 'GET', `/api/exams/${exam.id}`)
  const current = (await persisted.json()).data
  expect(current.id).toBe(exam.id)
  expect(current.subject).toBe(`${subject} đã sửa`)
  expect(JSON.parse(current.answerKey)).toEqual({ 1: 'C', 2: 'A' })
  const stale = await authorizedRequest(page.request, actor, 'POST', `/api/exams/${exam.id}/results`, {
    results: [{ studentId: 'student-e2e-001', score: 7, source: 'quick_entry' }],
  })
  expect(stale.status()).toBe(409)
})
}
