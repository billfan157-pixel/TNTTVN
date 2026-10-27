import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey, waitForBootstrapBaseline } from './helpers'
import { installUiBoot } from './design-system-matrix'

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'compact', width: 320, height: 720 }]) {
  test(`@critical daily entry defaults and relative score bonus sync on ${viewport.name}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize(viewport)
    await installUiBoot(page)
    const session = await getAdminSession(page.request)
    const key = testKey(testInfo, 'BONUS')
    const createdClass = await authorizedRequest(page.request, session, 'POST', '/api/classes', { code: key, name: `Lớp ${key}`, branchId: 'ThieuNhi', academicYearId: '2026-2027' })
    expect(createdClass.status()).toBe(201)
    const classId = (await createdClass.json()).data.id
    const fullName = `Cộng điểm ${key}`
    const createdStudent = await authorizedRequest(page.request, session, 'POST', '/api/students', { fullName, holyName: 'Maria', gender: 'Nữ', dateOfBirth: '2015-01-01', branch: 'ThieuNhi', classId })
    expect(createdStudent.status()).toBe(201)
    const studentId = (await createdStudent.json()).data.id
    for (const [suffix, value] of [['old', 8], ['latest', 10]] as const) {
      const seeded = await authorizedRequest(page.request, session, 'POST', '/api/daily-entries/batch', { entries: [{ id: `DG-${key}-${suffix}`, studentId, academicYear: '2026-2027', semester: 1, scoreType: 'prayer', value, date: '2026-10-27' }] })
      expect(seeded.status()).toBe(200)
      expect((await seeded.json()).data.saved).toBe(1)
    }
    await injectSession(page, session)
    await page.goto(`/grades?classId=${classId}`)
    await waitForBootstrapBaseline(page, 45_000)
    await expect(page.getByRole('heading', { name: 'Nhập Điểm Hằng Ngày' })).toBeVisible()
    await page.getByRole(viewport.name === 'desktop' ? 'button' : 'tab', { name: /Khảo [Kk]inh/, exact: true }).click()
    const bonusButton = page.getByRole('button', { name: `Cộng 1 điểm khảo kinh cho ${fullName}`, exact: true })
    const nameContainer = viewport.name === 'desktop' ? page.getByRole('cell').filter({ has: bonusButton }) : page.locator('article').filter({ has: bonusButton })
    await expect(nameContainer.getByText(fullName, { exact: true })).toBeVisible()
    await expect(bonusButton).toHaveText('+1')
    const box = await bonusButton.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    if (viewport.name !== 'desktop') expect(box!.height).toBeGreaterThanOrEqual(44)
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width)
    await page.screenshot({ path: testInfo.outputPath(`daily-score-bonus-${viewport.name}.png`) })

    await page.context().setOffline(true)
    await bonusButton.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    if (viewport.name !== 'desktop') await expect(nameContainer.getByRole('button', { expanded: false })).toBeVisible()
    await expect(page.getByText(/Mất kết nối Internet:/)).toBeVisible()
    const sent = page.waitForResponse(response => response.url().endsWith('/api/daily-entries/batch') && response.request().method() === 'POST' && response.request().postDataJSON()?.entries?.[0]?.operation === 'bonus')
    await page.context().setOffline(false)
    const response = await sent
    expect(response.status()).toBe(200)
    expect((await response.json()).data.items[0]).toMatchObject({ operation: 'bonus', status: 'created', targetEntryId: `DG-${key}-old`, beforeScore: 8, serverScore: 9 })
    await expect(page.locator('.offline-status-banner')).toHaveCount(0)

    const readScores = async () => {
      const read = await authorizedRequest(page.request, session, 'GET', `/api/daily-entries?studentId=${studentId}&academicYear=2026-2027&semester=1&scoreType=prayer`)
      expect(read.status()).toBe(200)
      return (await read.json()).data
    }
    expect(await readScores()).toEqual(expect.arrayContaining([expect.objectContaining({ id: `DG-${key}-old`, value: 9 }), expect.objectContaining({ id: `DG-${key}-latest`, value: 10 })]))
    expect(await readScores()).toHaveLength(2)
    const replay = await authorizedRequest(page.request, session, 'POST', '/api/daily-entries/batch', response.request().postDataJSON())
    expect((await replay.json()).data.items[0]).toMatchObject({ status: 'duplicate', serverScore: 9 })
    const gradeResponse = await authorizedRequest(page.request, session, 'GET', `/api/grades?studentId=${studentId}&semester=1`)
    expect((await gradeResponse.json()).data).toContainEqual(expect.objectContaining({ studentId, scorePrayer: 9.5 }))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Nhập Điểm Hằng Ngày' })).toBeVisible()
    await page.getByRole(viewport.name === 'desktop' ? 'button' : 'tab', { name: /Khảo [Kk]inh/, exact: true }).click()
    await expect(bonusButton).toBeVisible()
    expect(await readScores()).toHaveLength(2)
  })
}
