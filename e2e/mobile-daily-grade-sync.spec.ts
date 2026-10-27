import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey, waitForBootstrapBaseline } from './helpers'

test('@critical mobile daily grades sync online and after reconnect without duplicating attempts', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const session = await getAdminSession(page.request)
  const key = testKey(testInfo, 'DGS')
  const classResponse = await authorizedRequest(page.request, session, 'POST', '/api/classes', {
    code: key, name: `Lớp ${key}`, branchId: 'ThieuNhi', academicYearId: '2026-2027',
  })
  expect(classResponse.status()).toBe(201)
  const { id: classId } = (await classResponse.json()).data
  const name = `Điểm Hằng Ngày ${key}`
  const created = await authorizedRequest(page.request, session, 'POST', '/api/students', {
    fullName: name, holyName: 'Maria', gender: 'Nữ', dateOfBirth: '2015-01-01', branch: 'ThieuNhi', classId,
  })
  expect(created.status()).toBe(201)
  const student = (await created.json()).data
  await injectSession(page, session)
  await page.goto(`/grades?classId=${classId}`)
  await waitForBootstrapBaseline(page, 45_000)
  await page.getByRole('tab', { name: 'Hằng ngày', exact: true }).click()
  const card = page.locator('article').filter({ hasText: name })
  await expect(card).toHaveCount(1)
  await card.getByRole('button', { expanded: false }).click()

  for (const entry of [
    { tab: 'Miệng', scoreType: 'oral', value: 8, offline: false },
    { tab: 'Khảo kinh', scoreType: 'prayer', value: 6, offline: true },
    { tab: '15 phút', scoreType: '15m', value: 7, offline: true },
    { tab: '1 tiết', scoreType: '1period', value: 9, offline: false },
  ]) {
    await page.getByRole('tablist', { name: 'Chọn loại điểm kiểm tra' }).getByRole('tab', { name: entry.tab, exact: true }).click()
    if (entry.offline) await page.context().setOffline(true)
    const sent = page.waitForResponse(response => response.url().endsWith('/api/daily-entries/batch')
      && response.request().method() === 'POST')
    await card.getByRole('button', { name: String(entry.value), exact: true }).click()
    await expect(card.getByText('1 lần nhập', { exact: true })).toBeVisible()
    if (entry.offline) {
      await expect(page.getByText(/Mất kết nối Internet:/)).toBeVisible()
      await page.context().setOffline(false)
    }
    const response = await sent
    expect(response.status()).toBe(200)
    const result = (await response.json()).data
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ studentId: student.id, scoreType: entry.scoreType, status: 'created', serverScore: entry.value })
    await expect(page.locator('.offline-status-banner')).toHaveCount(0)
  }

  const readEntries = async () => {
    const response = await authorizedRequest(page.request, session, 'GET', `/api/daily-entries?studentId=${student.id}&academicYear=2026-2027&semester=1`)
    expect(response.status()).toBe(200)
    return (await response.json()).data
  }
  expect(await readEntries()).toEqual(expect.arrayContaining([
    expect.objectContaining({ scoreType: 'oral', value: 8 }),
    expect.objectContaining({ scoreType: 'prayer', value: 6 }),
    expect.objectContaining({ scoreType: '15m', value: 7 }),
    expect.objectContaining({ scoreType: '1period', value: 9 }),
  ]))
  expect(await readEntries()).toHaveLength(4)
  const grades = await authorizedRequest(page.request, session, 'GET', `/api/grades?studentId=${student.id}&semester=1`)
  expect((await grades.json()).data).toContainEqual(expect.objectContaining({ studentId: student.id, scoreOral: 8, scorePrayer: 6, score15m: 7, score1Period: 9 }))
  const report = await authorizedRequest(page.request, session, 'GET', `/api/reports/report-card/${student.id}?academicYear=2026-2027`)
  expect(report.status()).toBe(200)
  expect((await report.json()).data.grades).toContainEqual(expect.objectContaining({ semester: 1, scorePrayer: 6, gpa: 7.8 }))

  await page.reload()
  await page.getByRole('tab', { name: 'Hằng ngày', exact: true }).click()
  await expect(card.getByText('1 lần nhập', { exact: true })).toBeVisible()
  await expect(page.locator('.offline-status-banner')).toHaveCount(0)
  expect(await readEntries()).toHaveLength(4)
})
