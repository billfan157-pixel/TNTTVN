import { expect, test } from '@playwright/test'

/**
 * Font delivery regression guard.
 *
 * This repo shipped for months with Inter and Playfair Display declared in
 * `00-tokens.css` but never actually fetched — the Google Fonts <link> sat inside
 * <noscript> and the programmatic loader had no call site. Every page silently
 * rendered in the system/Georgia fallbacks and nothing failed, because a missing
 * @font-face is not an error, it is just different glyphs.
 *
 * So this asserts delivery as an observable fact: the binaries are requested over
 * the network, the faces report `loaded`, and the rendered width differs from the
 * fallback. A screenshot comparison cannot prove this — a serif fallback is easy
 * to mistake for the real face.
 *
 * The two italic faces are intentionally lazy (@font-face matching is lazy), so
 * they must stay registered but unfetched until something renders serif italic.
 */
test.describe('self-hosted font delivery', () => {
  test('the vendored faces are fetched and actually applied, not silently falling back', async ({ page }) => {
    test.setTimeout(120_000)

    const requested: string[] = []
    page.on('request', request => {
      if (request.url().includes('/fonts/')) requested.push(request.url().split('/').pop()!)
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: /quản lý giáo lý/i })).toBeVisible({ timeout: 30_000 })

    const measured = await page.evaluate(async () => {
      // Vietnamese text forces the vietnamese subset too, which is where the
      // tone-marked vowels (U+1EA0-1EF9) and Ơ ơ Ư ư actually live.
      await Promise.all([
        document.fonts.load('400 40px Inter', 'Xứ Đoàn'),
        document.fonts.load('700 40px Inter', 'Xứ Đoàn'),
        document.fonts.load('700 40px "Playfair Display"', 'Xứ Đoàn'),
      ])
      await document.fonts.ready

      // Measure a real DOM node. Canvas `ctx.font` resolves asynchronously and will
      // happily report fallback widths even when the face is loaded, which produced
      // a false negative during development.
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:40px;font-weight:700'
      probe.textContent = 'Xứ Đoàn ABC nặng'
      document.body.appendChild(probe)
      const width = (family: string) => {
        probe.style.fontFamily = family
        return probe.getBoundingClientRect().width
      }

      const fallback = width('monospace')
      return {
        faces: [...document.fonts].map(face => `${face.family}|${face.style}|${face.weight}|${face.status}`),
        interWidth: width("'Inter', monospace"),
        playfairWidth: width('"Playfair Display", monospace'),
        fallbackWidth: fallback,
      }
    })

    const loaded = measured.faces.filter(face => face.endsWith('loaded'))

    console.log('font requests:', JSON.stringify([...new Set(requested)]))
    console.log('faces:', JSON.stringify(measured.faces))
    console.log('widths:', JSON.stringify({
      inter: measured.interWidth,
      playfair: measured.playfairWidth,
      fallback: measured.fallbackWidth,
    }))

    // All six vendored faces must be registered — a dropped @font-face block shows up here.
    expect(measured.faces, 'all six vendored faces registered').toHaveLength(6)

    // The four roman faces must report loaded. Compared as a set of families so a
    // late status flip on one face cannot flake the guard.
    const romanLoaded = new Set(
      loaded.filter(face => face.includes('|normal|')).map(face => face.split('|')[0])
    )
    expect([...romanLoaded].sort(), 'Inter and Playfair Display roman faces loaded')
      .toEqual(['Inter', 'Playfair Display'])

    // The binaries must cross the network, not merely resolve from cache.
    // The italics ARE fetched now, and that is correct: reviving LandingFaithMoment
    // (Phase 3) renders Đức Mẹ Fatima's quotation in `font-serif italic`, so Playfair
    // Display italic is genuinely used on the page. This assertion used to require zero
    // italic requests, which was only ever true while no element used the face — do not
    // "restore" it without also removing the quotation that needs it.
    expect([...new Set(requested)].sort(), 'the four roman binaries fetched over the network').toEqual([
      'inter-latin.woff2',
      'inter-vietnamese.woff2',
      'playfair-italic-latin.woff2',
      'playfair-italic-vietnamese.woff2',
      'playfair-latin.woff2',
      'playfair-vietnamese.woff2',
    ])
    await expect(page.locator('blockquote').first()).toBeVisible()

    // The decisive check: a distinct width from the fallback proves the glyphs came
    // from the webfont rather than a substitute face with a similar look.
    expect(Math.abs(measured.interWidth - measured.fallbackWidth), 'Inter applied, not falling back')
      .toBeGreaterThan(1)
    expect(Math.abs(measured.playfairWidth - measured.fallbackWidth), 'Playfair Display applied, not falling back')
      .toBeGreaterThan(1)
  })
})
