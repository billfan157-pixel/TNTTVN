import { test, expect } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey } from './helpers'

for (const width of [1280, 320]) {
  test(`captures new questions once and preserves essay spacing through create, edit and print at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const actor = await getAdminSession(page.request)
    const subject = testKey(testInfo, 'Structured')
    await authorizedRequest(page.request, actor, 'POST', '/api/semester-locks', { academicYear: '2026-2027', semester: 1, isLocked: false, unlockReason: 'Structured exam E2E isolation' })
    await injectSession(page, actor)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/grades')
    await page.getByRole('tab', { name: width >= 1024 ? /Chấm Bài:/ : 'Chấm bài', exact: width < 1024 }).click()
    await page.getByRole('button', { name: width >= 1024 ? 'Tạo Phiên Chấm' : 'Tạo Phiên', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Tạo Phiên Chấm', exact: true })
    await dialog.getByRole('combobox', { name: 'Lớp học cho phiên chấm' }).selectOption('CLS-TN-1')
    await dialog.getByRole('textbox', { name: 'Môn hoặc nội dung kiểm tra' }).fill(subject)
    await dialog.getByRole('button', { name: 'Nhập toàn bộ đề kiểm tra', exact: true }).click()
    const importer = page.getByRole('dialog', { name: 'Import Đề Thi Thông Minh', exact: true })
    await importer.getByRole('textbox', { name: 'Nội dung đề thi', exact: true }).fill(`PHẦN I. TRẮC NGHIỆM (2 điểm)
Câu 1: Chọn số hai. ${subject}
A. Một
B. Hai
C. Ba
D. Bốn
Đáp án: B
PHẦN II. ĐIỀN KHUYẾT (2 điểm)
Câu 2: Điền từ: Em biết {{1}}. ${subject}
Đáp án: chia sẻ
PHẦN III. NỐI CỘT (2 điểm)
Câu 3: Nối nội dung hai cột. ${subject}
Cột A | Cột B
1. Mục thứ nhất | A. Ý thứ hai
2. Mục thứ hai | B. Ý thứ nhất
Đáp án: 1-B; 2-A
PHẦN IV. TỰ LUẬN (4 điểm)
Câu 4 (4 điểm): Trình bày: ${subject}
a) Nêu ý nghĩa. (2 điểm)
b) Liên hệ. (2 điểm)`)
    await expect(importer.getByRole('columnheader', { name: 'Cột A', exact: true })).toBeVisible()
    expect(await importer.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`structured-import-${width}.png`), fullPage: false })
    await importer.getByRole('button', { name: 'Áp Dụng Vào Phiên Chấm', exact: true }).click()
    await expect(importer).toBeHidden()
    const essayDetails = dialog.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Câu 4 · Trình bày:' }) })
    await essayDetails.locator('summary').click()
    await essayDetails.getByRole('spinbutton', { name: 'Số dòng trả lời · Câu 4', exact: true }).fill('14')
    const create = dialog.getByRole('button', { name: 'Tạo Phiên', exact: true })
    await expect(create).toBeEnabled()
    const createdResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/api/exams'))
    await create.click()
    const created = await createdResponse
    expect(created.status()).toBe(201)
    const session = (await created.json()).data
    expect(session).toMatchObject({ examType: 'mixed', questionCount: 1, subject })
    expect(JSON.parse(session.answerKey)).toEqual({ 1: 'B' })
    expect(JSON.parse(session.questions)[3].answerLineCount).toBe(14)
    const bankPath = `/api/question-bank/questions?limit=100&search=${encodeURIComponent(subject)}`
    const capturedResponse = await authorizedRequest(page.request, actor, 'GET', bankPath)
    expect(capturedResponse.status()).toBe(200)
    const captured = (await capturedResponse.json()).data.items
    expect(captured).toHaveLength(4)
    expect(captured.every((item: any) => item.status === 'draft' && item.provenance === 'import' && item.source === `Đề thi: ${subject}`)).toBe(true)
    expect(captured.find((item: any) => item.current.questionType === 'essay').current.answerData.answerLineCount).toBe(14)
    const repeat = await authorizedRequest(page.request, actor, 'POST', '/api/exams', {
      classId: session.classId, subject: `${subject} (lặp)`, scoreType: session.scoreType, semester: session.semester,
      academicYear: session.academicYear, maxScore: session.maxScore, examType: session.examType,
      questionCount: session.questionCount, answerKey: session.answerKey, questions: session.questions,
      idempotencyKey: `${session.id}-repeat`,
    })
    expect(repeat.status()).toBe(201)
    const afterRepeat = await authorizedRequest(page.request, actor, 'GET', bankPath)
    expect((await afterRepeat.json()).data.items).toHaveLength(4)
    await page.getByRole('button', { name: 'Sửa đề thi', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Sửa đề thi', exact: true })
    const details = editor.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Câu 3 · Nối nội dung hai cột.' }) })
    await details.locator('summary').click()
    const stem = details.getByRole('textbox', { name: 'Câu 3 (Nối / ghép cột)', exact: true })
    await stem.fill((await stem.inputValue()).replace('Mục thứ nhất', 'Mục thứ nhất đã sửa'))
    await details.getByRole('spinbutton', { name: 'Điểm câu 3', exact: true }).focus()
    const blankDetails = editor.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Câu 2 · Điền từ: Em biết {{1}}.' }) })
    await blankDetails.locator('summary').click()
    const blankAnswer = blankDetails.getByRole('textbox', { name: 'Đáp án từng ô / cặp ghép · Câu 2', exact: true })
    await blankAnswer.fill('')
    await blankAnswer.pressSequentially('1: chia sẻ với nhau')
    await expect(blankAnswer).toHaveValue('1: chia sẻ với nhau')
    await blankDetails.getByRole('spinbutton', { name: 'Điểm câu 2', exact: true }).focus()
    const essayEditor = editor.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Câu 4 · Trình bày:' }) })
    await essayEditor.locator('summary').click()
    await expect(essayEditor.getByRole('spinbutton', { name: 'Số dòng trả lời · Câu 4', exact: true })).toHaveValue('14')
    await essayEditor.getByRole('spinbutton', { name: 'Số dòng trả lời · Câu 4', exact: true }).fill('18')
    const updateResponse = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith(`/api/exams/${session.id}/definition`))
    await editor.getByRole('button', { name: 'Lưu đề thi', exact: true }).click()
    expect((await updateResponse).status()).toBe(200)
    const response = await authorizedRequest(page.request, actor, 'GET', `/api/exams/${session.id}`)
    const questions = JSON.parse((await response.json()).data.questions)
    expect(questions[2]).toMatchObject({ responseFormat: 'matching', answerData: { left: [{ id: '1', text: 'Mục thứ nhất đã sửa' }, { id: '2', text: 'Mục thứ hai' }], pairs: [{ leftId: '1', rightId: 'B' }, { leftId: '2', rightId: 'A' }] } })
    expect(questions[3].answerData.subparts).toHaveLength(2)
    expect(questions[3].answerLineCount).toBe(18)
    expect(questions[1].answerData.blanks[0].acceptedAnswers).toEqual(['chia sẻ với nhau'])
    await page.getByRole('button', { name: width < 1024 ? 'Xem Đề Thi' : 'In Đề & Phiếu', exact: true }).click()
    const paper = page.getByRole('dialog', { name: width < 1024 ? 'Xem Đề Thi & Tài Liệu' : 'In & Xuất Tài Liệu Kiểm Tra', exact: true })
    if (width < 1024) await paper.getByRole('button', { name: 'Đề A4', exact: true }).click()
    const preview = page.frameLocator('iframe[title="Xem trước tài liệu kiểm tra"]')
    await expect(preview.locator('[data-essay-answer-lines]')).toHaveAttribute('data-essay-answer-lines', '18')
    await expect(preview.locator('.essay-answer-line')).toHaveCount(18)
    await paper.locator('summary').filter({ hasText: 'Dòng trả lời tự luận' }).click()
    await paper.getByRole('spinbutton', { name: 'Dòng in · Câu 4', exact: true }).fill('0')
    await expect(preview.locator('[data-essay-answer-lines]')).toHaveAttribute('data-essay-answer-lines', '0')
    await expect(preview.locator('.essay-answer-line')).toHaveCount(0)
    expect(await paper.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`essay-spacing-${width}.png`), fullPage: false })
    const afterPrint = await authorizedRequest(page.request, actor, 'GET', `/api/exams/${session.id}`)
    expect(JSON.parse((await afterPrint.json()).data.questions)[3].answerLineCount).toBe(18)
  })
}
