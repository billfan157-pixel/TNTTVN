import { expect, test } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession, testKey, waitForBootstrapBaseline } from './helpers'

test('@critical mobile conduct deduction queues offline, syncs once and retains its reason after reload', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const session = await getAdminSession(page.request)
  const key = `${testKey(testInfo, 'CONDUCT')}-${testInfo.repeatEachIndex}`
  const classResponse = await authorizedRequest(page.request, session, 'POST', '/api/classes', {
    code: key, name: `Lớp ${key}`, branchId: 'ThieuNhi', academicYearId: '2026-2027',
  })
  expect(classResponse.status()).toBe(201)
  const { id: classId } = (await classResponse.json()).data
  const name = `Đạo Đức ${key}`
  const created = await authorizedRequest(page.request, session, 'POST', '/api/students', {
    fullName: name, holyName: 'Maria', gender: 'Nữ', dateOfBirth: '2015-01-01', branch: 'ThieuNhi', classId,
  })
  expect(created.status()).toBe(201)
  const student = (await created.json()).data
  await injectSession(page, session)
  const openConduct = async () => {
    await page.getByRole('tab', { name: 'Hằng ngày', exact: true }).click()
    await page.getByRole('tab', { name: 'Đạo đức', exact: true }).click()
  }
  await page.goto(`/grades?classId=${classId}`)
  // A cold Vite graph can take longer than the shared 15s baseline budget on
  // Windows. Keep waiting for the same real baseline; never synthesize it.
  await waitForBootstrapBaseline(page, 45_000)
  await openConduct()
  const conduct = page.getByRole('region', { name: 'Điểm đạo đức', exact: true })
  await expect(conduct.locator('article')).toHaveCount(1)
  const card = conduct.locator('article').filter({ hasText: name })
  const score = card.getByLabel(`Điểm đạo đức của ${name}`)
  await expect(score).toHaveText('10 / 10')
  const deduct = card.getByRole('button', { name: '−0,5 đ' })
  const bounds = await deduct.boundingBox()
  expect(bounds!.height).toBeGreaterThanOrEqual(44)
  expect(bounds!.width).toBeGreaterThanOrEqual(44)
  await deduct.click()
  await expect(card.getByRole('button', { name: 'Lưu lần trừ' })).toBeDisabled()
  const reason = 'Nói chuyện riêng trong giờ học'
  await card.getByRole('textbox').fill(reason)
  await page.context().setOffline(true)
  await card.getByRole('button', { name: 'Lưu lần trừ' }).click()
  await expect(score).toHaveText('9,5 / 10')
  await expect(card.getByText(/1 lần trừ đang chờ đồng bộ/)).toBeVisible()
  const sent = page.waitForResponse(r => r.url().endsWith('/api/daily-entries/batch') && r.request().method() === 'POST')
  await page.context().setOffline(false)
  const response = await sent
  expect(response.status()).toBe(200)
  const result = (await response.json()).data
  expect(result.items[0]).toMatchObject({ status: 'created', serverScore: 9.5 })
  const mutation = response.request().postDataJSON()
  const replay = await authorizedRequest(page.request, session, 'POST', '/api/daily-entries/batch', mutation)
  expect((await replay.json()).data.items[0]).toMatchObject({ status: 'duplicate', serverScore: 9.5 })
  const readBack = await authorizedRequest(page.request, session, 'GET', `/api/grades?studentId=${student.id}&semester=1`)
  expect((await readBack.json()).data).toContainEqual(expect.objectContaining({ studentId: student.id, scoreDaoDuc: 9.5 }))
  await expect(card.getByText(/lần trừ đang chờ đồng bộ/)).toHaveCount(0)
  await page.reload()
  await openConduct()
  await expect(score).toHaveText('9,5 / 10')
  await card.getByText('Lịch sử trừ điểm (1)', { exact: true }).click()
  await expect(card.getByText(reason, { exact: true })).toBeVisible()
  await card.getByText(reason, { exact: true }).scrollIntoViewIfNeeded()
  const screenshotPath = testInfo.outputPath('mobile-conduct-history.png')
  // The full-suite roster can exceed WebKit's 32767px screenshot limit.
  // Capture the student's persisted history that this journey verifies.
  await card.screenshot({ path: screenshotPath })
  await testInfo.attach('mobile-conduct-history.png', { path: screenshotPath, contentType: 'image/png' })
})
