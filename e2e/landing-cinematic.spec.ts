import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { installUiBoot, settleFiniteAnimations } from './design-system-matrix'

test.describe.configure({ timeout: 180_000 })

async function openLanding(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /quản lý giáo lý/i })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.landing-page')).toHaveAttribute('data-active-scene', 'hero')
  await page.locator('.landing-hero-photo').evaluate(image => (image as HTMLImageElement).decode())
  // The hero plays a finite entrance stagger. Contrast must be judged on the
  // settled state, otherwise axe samples a half-faded frame and reports a
  // false violation. This mirrors what design-system-matrix does for every
  // observation open (and what a11y.spec.ts relies on) and matches chapter().
  await settleFiniteAnimations(page)
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
  // Derived from live layout rather than hard-coded: the public header reuses
  // `.app-header` (76px + 1px border), and the preview's own sticky offset is 5.5rem.
  // Hard-coded 64/160 only ever described the old 64px header, and sat close enough
  // to the natural resting position to fail on an unrelated 13px header change.
  // Scoped to .landing-header: `.landing-product-intro` is also a <header> element,
  // so a bare `header` locator is ambiguous on this page.
  const headerHeight = (await page.locator('.landing-header').boundingBox())!.height
  const stickyTop = await preview.evaluate(element => parseFloat(getComputedStyle(element).top))
  const parkCeiling = stickyTop + 96
  for (const workspace of ['academic', 'organization', 'parent']) {
    await chapter(page, workspace)
    await expect(stage).toHaveAttribute('data-active-story', workspace)
    await expect(preview.locator('.landing-preview-device')).toHaveAttribute('data-workspace', workspace)
    const bounds = await preview.boundingBox()
    // Parked below the header, and either stuck at its sticky offset or still within
    // one viewport-ish band above it — never drifting down the page.
    expect(bounds!.y).toBeGreaterThanOrEqual(headerHeight - 1)
    expect(bounds!.y).toBeLessThan(parkCeiling)
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
  // The sticky header reuses `.app-header` (76px + 1px border = 77px), so the
  // "clear of the chrome" floor is read from the live header rather than a literal.
  const headerFloor = (await page.locator('.landing-header').boundingBox())!.height - 1
  for (const id of ['academic', 'organization', 'parent']) {
    await chapter(page, id)
    // Enter the pinned range even when the first chapter is above its midpoint.
    await page.locator(`#story-${id}`).evaluate(element => window.scrollTo({ top: element.getBoundingClientRect().top + scrollY, behavior: 'instant' }))
    await expect(page.locator('#san-pham')).toHaveAttribute('data-active-story', id)
    await settleFiniteAnimations(page)
    const screen = await page.locator('.landing-cinematic__preview .landing-preview-shell').boundingBox()
    const tabs = await page.getByRole('tablist').boundingBox()
    expect(tabs!.y).toBeGreaterThanOrEqual(headerFloor)
    expect(tabs!.y + tabs!.height).toBeLessThanOrEqual(720)
    expect(screen!.y).toBeGreaterThanOrEqual(headerFloor)
    expect(screen!.y + screen!.height).toBeLessThanOrEqual(720)
    await capture(page, info, `1280-${id}`)
  }
})

test('desktop: the header rail advances and announces the current stop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openLanding(page)
  const rail = page.locator('.landing-header__rail-fill')
  const stop = page.locator('.landing-header__stop-label')
  // The rail is decorative; the accessible half is an aria-live region, so "where am I"
  // is never carried by a gradient on its own.
  await expect(page.locator('.landing-header__rail')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByRole('status')).toContainText('Khởi đầu')
  const scaleAt = async () => {
    const matrix = await rail.evaluate(element => getComputedStyle(element).transform)
    return Number(/matrix\(([-\d.]+)/.exec(matrix)?.[1] ?? 'NaN')
  }
  expect(await scaleAt()).toBeLessThan(0.05)
  const before = await stop.innerText()
  for (const id of ['branches', 'access', 'faq']) {
    await chapter(page, id)
    // transform, not width: a width change re-lays out the bar every frame.
    expect(await rail.evaluate(element => getComputedStyle(element).width)).toBe(await rail.evaluate(element => getComputedStyle(element).width))
    expect(await scaleAt()).toBeGreaterThan(0.05)
  }
  const after = await stop.innerText()
  expect(after, 'the announced stop should change as the reader moves down the page').not.toBe(before)
  await expect(stop).not.toBeEmpty()
})

test('hero title breaks on two deliberate lines without splitting a proper noun', async ({ page }, info) => {
  for (const [width, height] of [[320, 720], [390, 844], [768, 900], [1440, 900], [1920, 1080]] as const) {
    await page.setViewportSize({ width, height })
    await openLanding(page)
    const measured = await page.evaluate(() => {
      const heading = document.querySelector('.landing-hero-title')!
      const linesOf = (element: Element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return new Set(Array.from(range.getClientRects()).map(rect => Math.round(rect.top))).size
      }
      return {
        desktop: window.innerWidth >= 640,
        lines: Array.from(heading.querySelectorAll('.landing-hero-title__line')).map(linesOf),
        // The multi-word names that must never be split across a line break.
        keeps: Array.from(heading.querySelectorAll('.landing-hero-title__keep')).map(el => ({ text: el.textContent, lines: linesOf(el) })),
        scrollWidth: document.documentElement.scrollWidth,
      }
    })
    expect(measured.scrollWidth, `${width}: hero must not overflow horizontally`).toBeLessThanOrEqual(width + 1)
    // Read the text back. Counting line boxes proves geometry, not content: when the two
    // halves are one inline flow below sm, JSX collapsed the space at the element
    // boundary and the heading rendered as "Giáo lý& Thiếu Nhi" while every assertion
    // above still passed.
    const heading = await page.locator('.landing-hero-title').innerText()
    expect(heading.replace(/\s+/g, ' '), `${width}: the heading lost a word boundary`).toBe(
      'Nền tảng quản lý Giáo lý & Thiếu Nhi Thánh Thể',
    )
    for (const keep of measured.keeps) {
      expect(keep.lines, `${width}: "${keep.text}" must stay on one line`).toBe(1)
    }
    if (measured.desktop) {
      // One line per semantic half, never three. This is what `max-width: 17ch` broke:
      // it was narrower than "Nền tảng quản lý Giáo lý", so the first line wrapped and
      // could split "Thiếu Nhi".
      expect(measured.lines, `${width}: desktop title should be exactly two lines`).toEqual([1, 1])
    } else {
      // Below sm the two halves are one inline flow and wrap to three lines, not four.
      expect(Math.max(...measured.lines), `${width}: compact title should be at most three lines`).toBeLessThanOrEqual(3)
    }
    if (width === 1440) await capture(page, info, 'hero-title-1440')
  }
})

test('desktop: both pinned columns stay clear of the header and hold one centre line', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openLanding(page)
  const headerFloor = (await page.locator('.landing-header').boundingBox())!.height - 1
  // Both scrolly stages pin a column against the same fixed header, and both have the
  // same latent failure: a sticky element taller than the grid area it is pinned inside
  // is pushed *up* out of the top of that area instead of scrolling away, sliding under
  // the header on the last chapter. Measured before the fix: product y=9.5, community
  // y=46.3, against a 77px header. No earlier assertion covered either stage's bounds.
  const pinned = [
    { scene: 'community-learn', column: '.landing-community__visual' },
    { scene: 'community-family', column: '.landing-community__visual' },
    { scene: 'organization', column: '.landing-cinematic__preview' },
    { scene: 'parent', column: '.landing-cinematic__preview' },
  ]
  for (const { scene, column } of pinned) {
    await chapter(page, scene)
    const bounds = await page.locator(column).boundingBox()
    expect(bounds!.y, `${scene}: pinned column must not slide under the fixed header`).toBeGreaterThanOrEqual(headerFloor)
    // Compare centres, not tops. The two columns are deliberately different heights
    // (a 763–812px preview against ~490px of copy), so equal tops are not achievable;
    // the shared centre line is what the composition actually reads as. Fixed viewport,
    // so these offsets are deterministic: 20.2 / 3.3 / 0.3 / 0.3px.
    const delta = await page.evaluate(({ scene, column }) => {
      const centre = (element: Element) => { const box = element.getBoundingClientRect(); return box.top + box.height / 2 }
      return Math.abs(centre(document.querySelector(column)!) - centre(document.querySelector(`[data-landing-scene="${scene}"]`)!))
    }, { scene, column })
    expect(delta, `${scene}: pinned column and chapter copy should share a centre line`).toBeLessThanOrEqual(45)
    await capture(page, info, `pinned-${scene}`)
  }
})

test('reduced motion keeps the desktop composition and all demo content available', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await openLanding(page)
  await expect(page.locator('.landing-page')).toHaveAttribute('data-motion-ready', 'false')
  // Reduced motion must NOT change the layout: a 1440px viewport keeps the
  // two-column scrolly stage and the pinned preview, exactly as without the
  // preference. Only the animation is withheld.
  await expect(page.locator('.landing-cinematic__preview')).toBeVisible()
  await expect(page.locator('.landing-cinematic__preview')).toHaveCSS('position', 'sticky')
  await expect(page.locator('.landing-community__visual')).toBeVisible()
  // No scroll-driven parallax may leak through under reduced motion.
  await expect(page.locator('.landing-hero-photo')).toHaveCSS('transform', 'none')
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
    // `branches` is scanned because its five stations now carry the branch tokens as a
    // tinted wash; the scarf palette is only a light mix over paper, and nothing was
    // measuring it before.
    for (const id of ['hero', 'organization', 'access', 'branches']) {
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

const REVEAL_SECTIONS = ['#tieu-de-nganh', '.landing-trust', '#cong-dang-nhap', '#cau-hoi-thuong-gap']

async function readRevealState(page: Page) {
  return page.evaluate(selectors => {
    const root = document.querySelector('.landing-page') as HTMLElement
    return {
      armed: root.dataset.landingRevealArmed ?? null,
      items: selectors.map(selector => {
        const element = document.querySelector(selector) as HTMLElement
        return {
          selector,
          revealed: element.dataset.landingRevealed ?? null,
          opacity: Number(getComputedStyle(element).opacity).toFixed(2),
        }
      }),
    }
  }, REVEAL_SECTIONS)
}

test('the tail sections reveal once and can never be left invisible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openLanding(page)

  // Armed, and hidden immediately — no fade-out flash for content nobody has reached.
  const onLoad = await readRevealState(page)
  expect(onLoad.armed, 'reveal armed on load').toBe('true')
  expect(onLoad.items.map(item => item.opacity), 'below-the-fold sections start hidden')
    .toEqual(REVEAL_SECTIONS.map(() => '0.00'))

  // Anchor navigation into the tail must reveal what it lands on.
  await page.locator('a[href="#cong-dang-nhap"]').first().click()
  await expect
    .poll(async () => (await readRevealState(page)).items.find(item => item.selector === '#tieu-de-nganh')?.opacity)
    .toBe('1.00')

  // Scroll the whole page: everything ends revealed at full opacity. This is the
  // assertion that matters — Playwright's toBeVisible() ignores opacity, so content
  // stuck at 0 would pass every other check in this file.
  for (let step = 0; step < 12; step += 1) {
    await page.mouse.wheel(0, 900)
    await page.waitForTimeout(120)
  }
  await expect.poll(async () => {
    const state = await readRevealState(page)
    return state.items.every(item => item.revealed === 'true' && item.opacity === '1.00')
  }, { timeout: 10_000 }).toBe(true)
})

test('reduced motion never arms the tail reveal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await openLanding(page)
  const state = await readRevealState(page)
  expect(state.armed, 'reveal is not armed under reduced motion').toBeNull()
  expect(state.items.every(item => item.opacity === '1.00'), 'all tail sections plainly visible').toBe(true)
})
