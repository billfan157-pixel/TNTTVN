import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey } from './helpers'
import { installUiBoot } from './design-system-matrix'

for (const mobile of [false, true]) {
  test(`Xuân Lộc references create only a user-written draft (${mobile ? 'mobile' : 'desktop'})`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
    await installUiBoot(page)
    const session = await getAdminSession(page.request)
    await injectSession(page, session)
    await page.goto('/grades?view=bank')
    if (mobile) await page.getByRole('tab', { name: 'Ngân hàng', exact: true }).click()
    await page.getByRole('tab', { name: 'Giáo lý Xuân Lộc', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Giáo lý Hồng Ân · Xuân Lộc' })).toBeVisible()
    await page.getByLabel('Khối chương trình').selectOption('hong-an')
    await expect(page.getByRole('status').filter({ hasText: 'Chưa xác minh sách' })).toBeVisible()
    await page.getByLabel('Khối chương trình').selectOption('khai-tam')
    await page.getByLabel('Tham chiếu bài Khai Tâm').selectOption('50')
    const panel = page.getByRole('tabpanel', { name: 'Giáo lý Xuân Lộc', exact: true })
    const geometry = await panel.evaluate(element => ({
      overflow: element.scrollWidth - element.clientWidth,
      width: element.clientWidth,
      scrollChildren: Array.from(element.querySelectorAll<HTMLElement>('*'))
        .filter(child => child.scrollWidth > child.clientWidth + 1)
        .map(child => ({ tag: child.tagName, id: child.id, className: child.className, scroll: child.scrollWidth, width: child.clientWidth, control: child.querySelector('select')?.id, html: child.classList.contains('form-group') ? child.innerHTML.slice(0, 550) : '' })).slice(0, 10),
      offenders: Array.from(element.querySelectorAll<HTMLElement>('*'))
        .filter(child => child.getBoundingClientRect().right > element.getBoundingClientRect().right + 1)
        .map(child => ({ tag: child.tagName, id: child.id, className: child.className, width: child.clientWidth })).slice(0, 10),
    }))
    await panel.screenshot({ path: testInfo.outputPath('xuan-loc-curriculum.png') })
    expect(geometry.overflow, JSON.stringify(geometry)).toBeLessThanOrEqual(1)
    const sourceLink = page.getByRole('link', { name: 'Xem tên 50 bài tại nguồn Thái Bình' })
    await expect(sourceLink).toHaveAttribute('href', /^https:\/\/giaophanthaibinh.net\//)
    const writes: string[] = []
    page.on('request', request => {
      if (request.method() === 'POST' && /\/api\/question-bank\/questions$/.test(request.url())) writes.push(request.url())
    })
    await page.getByRole('button', { name: 'Soạn câu hỏi với tham chiếu này' }).click()
    const editor = page.getByRole('dialog', { name: 'Tạo câu hỏi nháp', exact: true })
    await expect(editor.getByLabel('Bài học', { exact: true })).toHaveValue('Bài 50')
    await expect(editor.getByLabel('Chương', { exact: true })).toHaveValue('Phần IV')
    await expect(editor.getByLabel('Nội dung câu hỏi')).toHaveValue('')
    expect(writes).toHaveLength(0)
    const source = await editor.getByLabel('Nguồn trích dẫn').inputValue()
    await editor.getByLabel('Hình thức câu hỏi').selectOption('essay')
    const stem = `${testKey(testInfo, 'XL')} Em kể một việc tốt mình muốn thực hiện trong tuần.`
    await editor.getByLabel('Nội dung câu hỏi').fill(stem)
    const savedResponse = page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/question-bank\/questions$/.test(response.url()))
    await editor.getByRole('button', { name: 'Lưu câu hỏi nháp', exact: true }).click()
    const saved = await savedResponse
    expect(saved.status()).toBe(201)
    const created = (await saved.json()).data
    const persisted = await authorizedRequest(page.request, session, 'GET', `/api/question-bank/questions/${created.id}`)
    expect(persisted.status()).toBe(200)
    expect((await persisted.json()).data).toMatchObject({
      status: 'draft', chapter: 'Phần IV', lesson: 'Bài 50', lessonOrder: 50, source,
      branchId: null, curriculumLevel: null, provenance: 'human',
      current: { stem, questionType: 'essay' },
    })
    expect(writes).toHaveLength(1)
    await expect(editor).toBeHidden()
  })
}
