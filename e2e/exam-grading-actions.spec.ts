import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey } from './helpers'
import { installUiBoot } from './design-system-matrix'

for (const width of [1280, 390, 320]) {
  test(`grouped grading options and answer-key access at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 900 })
    await installUiBoot(page)
    const actor = await getAdminSession(page.request)
    await authorizedRequest(page.request, actor, 'POST', '/api/semester-locks', {
      academicYear: '2026-2027', semester: 1, isLocked: false, unlockReason: 'Exam action menu E2E isolation',
    })
    await injectSession(page, actor)
    await page.goto('/grades')
    await page.getByRole('tab', { name: width >= 1024 ? /Chấm Bài:/ : 'Chấm bài', exact: width < 1024 }).click()
    await page.getByRole('button', { name: width >= 1024 ? 'Tạo Phiên Chấm' : 'Tạo Phiên', exact: true }).click()
    const create = page.getByRole('dialog', { name: 'Tạo Phiên Chấm' })
    await create.getByRole('combobox', { name: 'Lớp học cho phiên chấm' }).selectOption('CLS-TN-1')
    await create.getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' }).fill(testKey(testInfo, 'Actions'))
    await create.getByRole('button', { name: /Trắc nghiệm/ }).click()
    await create.getByRole('spinbutton', { name: 'Số câu hỏi trắc nghiệm' }).fill('2')
    await create.getByRole('button', { name: 'Câu 1, đáp án A', exact: true }).click()
    await create.getByRole('button', { name: 'Câu 2, đáp án D', exact: true }).click()
    const created = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/exams'))
    await create.getByRole('button', { name: 'Tạo Phiên', exact: true }).click()
    expect((await created).status()).toBe(201)
    await expect(create).toBeHidden()

    const grading = page.getByRole('button', { name: 'Quét / Chấm bài', exact: true })
    await expect(grading).toHaveCount(1)
    await expect(page.getByRole('button', { name: /Chấm Ổn Định|Quét QR \+ OMR|Chấm Nhiều Ảnh/ })).toHaveCount(0)
    await grading.click()
    const options = page.getByRole('dialog', { name: 'Chọn cách chấm bài' })
    await expect(options.getByRole('button', { name: /Chấm Ổn Định/ })).toBeEnabled()
    await expect(options.getByRole('button', { name: /Quét QR/ })).toBeEnabled()
    await expect(options.getByRole('button', { name: /Chấm Nhiều Ảnh/ })).toBeEnabled()
    for (const label of [/Chấm Ổn Định/, /Quét QR/, /Chấm Nhiều Ảnh/]) {
      expect(await options.getByRole('button', { name: label }).evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    }
    expect(await options.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`grading-options-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(options).toBeHidden()
    await expect(grading).toBeFocused()

    await grading.click()
    await options.getByRole('button', { name: /Chấm Ổn Định/ }).click()
    const guided = page.getByRole('dialog', { name: 'Chấm ổn định theo danh sách lớp' })
    await expect(guided).toBeVisible()
    await expect(options).toBeHidden()
    await guided.getByRole('button', { name: 'Đóng', exact: true }).click()
    await grading.click()
    await options.getByRole('button', { name: /Chấm Nhiều Ảnh/ }).click()
    const batch = page.getByRole('dialog', { name: 'Chấm hàng loạt từ ảnh' })
    await expect(batch.getByRole('button', { name: 'Chọn nhiều ảnh' })).toBeEnabled()
    await batch.getByRole('button', { name: 'Đóng', exact: true }).click()

    if (width < 1024) {
      await expect(page.getByRole('button', { name: 'Đáp Án', exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: 'Xem Đề Thi', exact: true }).click()
      const paper = page.getByRole('dialog', { name: 'Xem Đề Thi & Tài Liệu' })
      await paper.getByRole('button', { name: 'Đáp án', exact: true }).click()
      await expect(paper.getByRole('heading', { name: 'Đáp án chuẩn', exact: true })).toBeVisible()
      await expect(paper.getByText('Câu 1:', { exact: true }).locator('..')).toContainText('A')
      await expect(paper.getByText('Câu 2:', { exact: true }).locator('..')).toContainText('D')
      expect(await paper.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath(`mobile-answer-key-${width}.png`) })
      await paper.getByRole('button', { name: 'Chấm Lại Điểm' }).click()
      const confirmation = page.getByRole('alertdialog', { name: 'Chấm lại điểm?' })
      await expect(confirmation).toBeVisible()
      await confirmation.getByRole('button', { name: 'Hủy' }).click()
      await expect(confirmation).toBeHidden()
      await paper.getByRole('button', { name: 'Đọc Đề', exact: true }).click()
      await expect(paper.getByRole('heading', { name: 'Đáp án chuẩn', exact: true })).toBeHidden()
      await paper.getByRole('button', { name: 'Đóng cửa sổ' }).click()
    } else {
      await page.getByRole('button', { name: 'Đáp Án', exact: true }).click()
      const answers = page.getByRole('dialog', { name: /Đáp Án Chuẩn —/ })
      await expect(answers.getByText('Câu 2:', { exact: true }).locator('..')).toContainText('D')
      await answers.getByRole('button', { name: 'Đóng', exact: true }).click()
    }
  })
}
