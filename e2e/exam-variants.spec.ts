import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey } from './helpers'
import { installUiBoot } from './design-system-matrix'

for (const width of [1280, 320]) {
  test(`creates distinct exam codes and reopens their saved mapping at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 900 })
    await installUiBoot(page)
    const actor = await getAdminSession(page.request)
    await authorizedRequest(page.request, actor, 'POST', '/api/semester-locks', {
      academicYear: '2026-2027', semester: 1, isLocked: false, unlockReason: 'Exam variant E2E isolation',
    })
    const subject = testKey(testInfo, 'Variants')
    const questions = [1, 2].map(index => ({ index, type: 'multiple_choice', question: `Nội dung câu ${index}`,
      options: { A: `Một ${index}`, B: `Hai ${index}`, C: `Ba ${index}`, D: `Bốn ${index}` }, correctOption: index === 1 ? 'B' : 'D' }))
    const created = await authorizedRequest(page.request, actor, 'POST', '/api/exams', {
      classId: 'CLS-TN-1', subject, scoreType: '15m', semester: 1, academicYear: '2026-2027', maxScore: 10,
      examType: 'multiple_choice', questionCount: 2, questions: JSON.stringify(questions), answerKey: JSON.stringify({ 1: 'B', 2: 'D' }),
    })
    expect(created.status()).toBe(201)
    const session = (await created.json()).data
    await injectSession(page, actor)
    await page.goto('/grades')
    await page.getByRole('tab', { name: width >= 1024 ? /Chấm Bài:/ : 'Chấm bài', exact: width < 1024 }).click()
    await page.getByRole('button', { name: new RegExp(`^${subject} —`) }).click()
    const open = page.getByRole('button', { name: /Mã Đề \(/ })
    // WebKit does not focus buttons on pointer clicks; establish a keyboard origin.
    await open.focus()
    await expect(open).toBeFocused()
    await open.press('Enter')
    const modal = page.getByRole('dialog', { name: 'Đáp án theo mã đề' })
    await modal.getByRole('combobox', { name: 'Kiểu trộn' }).selectOption('questions_only')
    await expect(modal.getByRole('combobox', { name: 'Số mã' })).toHaveValue('2')
    expect(await modal.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    const generate = modal.getByRole('button', { name: 'Tạo và khóa' })
    if (width === 320) {
      const target = await generate.boundingBox()
      expect(target!.height).toBeGreaterThanOrEqual(44)
    }
    const generated = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/api/exams/${session.id}/variant-manifests`))
    await generate.click()
    expect((await generated).status()).toBe(200)
    await modal.getByRole('button', { name: 'Mã B (102)', exact: true }).click()
    const mapping = modal.getByRole('region', { name: 'Đối chiếu mã B' })
    await expect(mapping.getByRole('row').nth(1)).toContainText('D')
    expect(await mapping.getByRole('row').nth(1).getByRole('cell').allTextContents()).toEqual(['2', 'A·B·C·D', 'D'])
    await expect(mapping.getByRole('row').nth(1).getByRole('cell').last()).toBeInViewport()
    expect(await modal.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`exam-variants-${width}.png`) })
    await modal.getByRole('button', { name: 'Đóng', exact: true }).click()
    await expect(open).toBeFocused()
    await open.click()
    await expect(modal.getByRole('button', { name: 'Tạo và khóa' })).toHaveCount(0)
    await modal.getByRole('button', { name: 'Mã B (102)', exact: true }).click()
    await expect(mapping).toBeVisible()
    const persisted = await authorizedRequest(page.request, actor, 'GET', `/api/exams/${session.id}`)
    expect(persisted.status()).toBe(200)
    const manifest = JSON.parse((await persisted.json()).data.variantManifests)
    expect(manifest.shuffleMode).toBe('questions_only')
    expect(manifest.variants.B.sourceQuestionOrder).toEqual([2, 1])
    expect(manifest.variants.B.answerKey).toEqual({ 1: 'D', 2: 'B' })
    expect(manifest.variants.A.contentHash).not.toBe(manifest.variants.B.contentHash)
  })
}
