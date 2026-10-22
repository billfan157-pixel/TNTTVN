import { test, expect } from '@playwright/test'
import { authorizedRequest, getAdminSession, injectSession } from './helpers'

for (const width of [1280, 320]) {
  test(`saves and cancels a personal daily liturgical reminder at 08:00 at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const actor = await getAdminSession(page.request)
    const path = '/api/notifications/liturgical-reminder'
    expect((await authorizedRequest(page.request, actor, 'PUT', path, { enabled: false, time: '08:00' })).status()).toBe(200)
    await injectSession(page, actor)
    await page.setViewportSize({ width, height: 900 })
    try {
      await page.goto('/calendar')
      const card = page.getByRole('region', { name: 'Nhắc lịch phụng vụ hằng ngày', exact: true })
      const toggle = card.getByRole('checkbox', { name: 'Nhận lịch phụng vụ hằng ngày', exact: true })
      await expect(toggle).toBeEnabled()
      await expect(card.getByLabel('Giờ nhắc', { exact: true })).toHaveValue('08:00')
      await toggle.check()
      const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith(path))
      await card.getByRole('button', { name: 'Lưu lịch nhắc', exact: true }).click()
      const response = await saved
      expect(response.status()).toBe(200)
      expect((await response.json()).data).toEqual({ enabled: true, time: '08:00', timeZone: 'Asia/Ho_Chi_Minh' })
      await page.reload()
      await expect(toggle).toBeChecked()
      await expect(card.getByText('Đã lên lịch hằng ngày lúc 08:00, giờ Việt Nam.', { exact: true })).toBeVisible()
      expect(await card.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      await card.screenshot({ path: testInfo.outputPath(`liturgical-reminder-${width}.png`) })
      await toggle.uncheck()
      const disabled = page.waitForResponse(result => result.request().method() === 'PUT' && result.url().endsWith(path))
      await card.getByRole('button', { name: 'Lưu lịch nhắc', exact: true }).click()
      expect((await disabled).status()).toBe(200)
      const readBack = await authorizedRequest(page.request, actor, 'GET', path)
      expect((await readBack.json()).data.enabled).toBe(false)
    } finally { await authorizedRequest(page.request, actor, 'PUT', path, { enabled: false, time: '08:00' }) }
  })
}
