import { expect, test } from '@playwright/test'
import { getAdminSession, injectSession } from './helpers'
import { installUiBoot } from './design-system-matrix'

test('dashboard panels reveal on scroll and respect reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installUiBoot(page)
  await injectSession(page, await getAdminSession(page.request))
  await page.goto('/dashboard')

  const firstPanel = page.locator('[data-scroll-story="panel"][data-scroll-story-state="pending"]').first()
  await expect(firstPanel).toBeAttached()
  const panelElement = await firstPanel.elementHandle()
  expect(panelElement).not.toBeNull()
  await firstPanel.scrollIntoViewIfNeeded()
  await expect.poll(() => panelElement!.getAttribute('data-scroll-story-state')).toBe('entered')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.locator('[data-scroll-story="panel"]').first()).toBeAttached()
  await expect(page.locator('[data-scroll-story-state="pending"]')).toHaveCount(0)
})
