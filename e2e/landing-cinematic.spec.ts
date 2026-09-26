import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { installUiBoot, settleFiniteAnimations } from './design-system-matrix'

test.describe.configure({ timeout: 180_000 })

async function openLanding(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /quản lý giáo lý/i })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.landing-page')).toHaveAttribute('data-active-scene', 'hero')
  await page.locator('.landing-hero-photo').evaluate(image => (image as HTMLImageElement).decode())
}
async function chapter(page: Page, id: string) {
  await page.locator(`[data-landing-scene="${id}"]`).evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await expect(page.locator('.landing-page')).toHaveAttribute('data-active-scene', id)
  await settleFiniteAnimations(page)
}
async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`)
  await page.screenshot({ path, animations: 'disabled' })
  await info.attach(name, { path, contentType: 'image/png' })
}

test('desktop: community imagery, distinct product scenes, reverse scroll and keyboard tabs', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openLanding(page)
  await capture(page, info, 'desktop-hero')
  const adjacency = await page.evaluate(() => {
    const hero = document.querySelector('.landing-hero-stage')!.getBoundingClientRect()
    return document.querySelector('#hanh-trinh')!.getBoundingClientRect().top - hero.bottom
  })
  expect(Math.abs(adjacency)).toBeLessThanOrEqual(1)
  await page.locator('.landing-community__intro').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await capture(page, info, 'desktop-community-intro')
  for (const moment of ['gather', 'learn', 'family']) {
    await chapter(page, `community-${moment}`)
    await expect(page.locator(`.landing-community__visual-panel--${moment}`)).toHaveCSS('opacity', '1')
    await capture(page, info, `desktop-community-${moment}`)
  }
  const stage = page.locator('#san-pham')
  const preview = page.locator('.landing-cinematic__preview')
  await chapter(page, 'product-intro')
  await capture(page, info, 'desktop-product-intro')
  let wideWidth = 0
  for (const workspace of ['academic', 'organization', 'parent']) {
    await chapter(page, workspace)
    await expect(stage).toHaveAttribute('data-active-story', workspace)
    await expect(preview.locator('.landing-preview-device')).toHaveAttribute('data-workspace', workspace)
    const bounds = await preview.boundingBox()
    expect(bounds?.y).toBeGreaterThanOrEqual(64)
    expect(bounds?.y).toBeLessThan(160)
    const shell = await preview.locator('.landing-preview-shell').boundingBox()
    if (workspace === 'academic') wideWidth = shell!.width
    if (workspace === 'parent') expect(shell!.width).toBeLessThan(wideWidth * 0.8)
    await expect(preview.getByText('Số liệu demo, không phải dữ liệu thật')).toBeVisible()
    await capture(page, info, `desktop-${workspace}`)
  }
  for (const workspace of ['organization', 'academic']) {
    await chapter(page, workspace)
    await expect(stage).toHaveAttribute('data-active-story', workspace)
  }
  await preview.getByRole('tab', { name: /phụ huynh/i }).click()
  await expect.poll(() => page.locator('#story-parent').evaluate(element => {
    const box = element.getBoundingClientRect()
    return box.top < innerHeight * 0.47 && box.bottom > innerHeight * 0.47
  })).toBe(true)
  await expect(stage).toHaveAttribute('data-active-story', 'parent')
  await preview.getByRole('tab', { name: /phụ huynh/i }).press('Home')
  await expect(preview.getByRole('tab', { name: /học vụ/i })).toBeFocused()
  await expect.poll(() => page.locator('#story-academic').evaluate(element => {
    const box = element.getBoundingClientRect()
    return box.top < innerHeight * 0.47 && box.bottom > innerHeight * 0.47
  })).toBe(true)
  await expect(stage).toHaveAttribute('data-active-story', 'academic')
  await chapter(page, 'faq')
  await expect(stage).toHaveAttribute('data-active-story', 'academic')
  for (const id of ['branches', 'trust', 'access', 'faq']) {
    await chapter(page, id)
    await capture(page, info, `desktop-${id}`)
  }
  await chapter(page, 'parent')
  await expect(stage).toHaveAttribute('data-active-story', 'parent')
})

test('mobile and tablet: sequential scenes, readable previews and no horizontal overflow', async ({ page }, info) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await openLanding(page)
    await expect(page.locator('.landing-cinematic__preview')).toBeHidden()
    await capture(page, info, `${width}-hero`)
    if (width === 390) {
      await page.getByRole('button', { name: /mở menu điều hướng/i }).click()
      await page.getByRole('navigation', { name: /menu di động/i }).getByRole('button', { name: 'Không gian làm việc' }).click()
      await expect(page.getByRole('navigation', { name: /menu di động/i })).toHaveCount(0)
      await expect.poll(async () => {
        const bounds = await page.locator('#tieu-de-san-pham').boundingBox()
        return bounds && bounds.y >= 64 && bounds.y + bounds.height < 844
      }).toBe(true)
    }
    for (const id of ['community-gather', 'community-learn', 'community-family', 'academic', 'organization', 'parent', 'branches', 'access', 'faq']) {
      await chapter(page, id)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      if (['academic', 'organization', 'parent'].includes(id)) {
        const demo = page.locator(`#story-${id} .landing-product-story__mobile-visual`)
        await expect(demo).toBeVisible()
        const bounds = await demo.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
      }
      await capture(page, info, `${width}-${id}`)
    }
    for (const target of await page.locator('#cong-dang-nhap button').all()) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
})

test('short desktop viewport keeps the full pinned product screen in view', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openLanding(page)
  for (const id of ['academic', 'organization', 'parent']) {
    await chapter(page, id)
    // Enter the pinned range even when the first chapter is above its midpoint.
    await page.locator(`#story-${id}`).evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY, behavior: 'instant' }))
    await expect(page.locator('#san-pham')).toHaveAttribute('data-active-story', id)
    await settleFiniteAnimations(page)
    const screen = await page.locator('.landing-cinematic__preview .landing-preview-shell').boundingBox()
    const tabs = await page.getByRole('tablist').boundingBox()
    expect(tabs!.y).toBeGreaterThanOrEqual(64)
    expect(tabs!.y + tabs!.height).toBeLessThanOrEqual(720)
    expect(screen!.y).toBeGreaterThanOrEqual(64)
    expect(screen!.y + screen!.height).toBeLessThanOrEqual(720)
    await capture(page, info, `1280-${id}`)
  }
})

test('reduced motion keeps every scene and all demo content available', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await openLanding(page)
  await expect(page.locator('.landing-page')).toHaveAttribute('data-motion-ready', 'false')
  await expect(page.locator('.landing-cinematic__preview')).toBeHidden()
  for (const id of ['community-learn', 'academic', 'organization', 'parent']) {
    await chapter(page, id)
    const copy = page.locator(`[data-landing-scene="${id}"]`).locator(id.startsWith('community') ? '> div:last-child' : '.landing-product-story__copy')
    await expect(copy).toHaveCSS('opacity', '1')
    await expect(copy).toHaveCSS('transform', 'none')
  }
  await capture(page, info, 'desktop-reduced-parent')
  await expect(page.locator('.landing-video-control')).toHaveCount(0)
})

test('landing WCAG automated checks across photographic, navy, access and mobile scenes', async ({ page }, info) => {
  const findings: unknown[] = []
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await openLanding(page)
    for (const id of ['hero', 'organization', 'access']) {
      if (id !== 'hero') await chapter(page, id)
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      findings.push({ width, id, violations: result.violations })
    }
  }
  await info.attach('landing-axe.json', { body: Buffer.from(JSON.stringify(findings, null, 2)), contentType: 'application/json' })
  expect(findings.filter(finding => (finding as { violations: unknown[] }).violations.length)).toEqual([])
})

test('dark mode preserves readable gold and white on the navy scenes', async ({ page }, info) => {
  await installUiBoot(page, 'dark')
  await page.setViewportSize({ width: 1440, height: 900 })
  await openLanding(page)
  await expect(page.locator('html')).toHaveClass(/dark/)
  for (const id of ['hero', 'community-learn', 'organization', 'access']) {
    if (id !== 'hero') await chapter(page, id)
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    await info.attach(`dark-${id}.json`, { body: Buffer.from(JSON.stringify(result.violations, null, 2)), contentType: 'application/json' })
    expect(result.violations).toEqual([])
    await capture(page, info, `dark-${id}`)
  }
})
