import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { installUiBoot, settleFiniteAnimations } from './design-system-matrix'

/**
 * WCAG 1.4.3 for the text that sits on the hero photograph.
 *
 * axe cannot judge this: it resolves a text node's background by walking the DOM, and
 * here the backdrop is a raster image under a scrim, so axe either skips the element or
 * reports the scrim's own colour. The plan's Truth Matrix listed "Chữ kem trên ảnh đủ
 * contrast" as UNKNOWN for exactly that reason.
 *
 * So this measures rendered pixels, and it measures them as a *difference*. Two
 * screenshots are taken of the same box — one with the glyphs, one with the glyphs
 * blanked to transparent (backgrounds and borders untouched) — and only the pixels that
 * actually changed are treated as text. That matters because a bounding box is not a
 * painted region: measuring "the brightest pixel in the box" reported 1.11:1 for the
 * identity rail purely because the gaps *between* the stacked chips show the bare photo,
 * and 1.56:1 for the scroll cue purely because `rounded-full` leaves its corners
 * unpainted. Both were measurement artefacts hiding the real numbers.
 *
 * Glyph pixels are the top 60% of the difference distribution (so anti-aliased edges are
 * excluded), and the backdrop is then read at those same coordinates and reduced to its
 * *brightest* value — the pessimistic choice, since every target here is light-on-dark.
 */
// Scoped to the hero figure. An unscoped `a[href="#san-pham"]` also matches the header's
// "Không gian làm việc" nav link, which has nothing to do with text over a photograph and
// is covered by the a11y viewport/theme matrix instead.
const HERO = '.landing-hero-stage '
const TARGETS = [
  { selector: `${HERO}.landing-hero-title`, label: 'H1' },
  { selector: `${HERO}.hero-enter-2 > p:first-of-type`, label: 'parish kicker (cream on photo)' },
  { selector: `${HERO}.landing-hero-lead`, label: 'lead paragraph' },
  { selector: `${HERO}.landing-hero-identity .grid > div`, label: 'identity rail chip' },
  { selector: `${HERO}a[href="#san-pham"]`, label: 'secondary hero CTA' },
  { selector: `${HERO}a[href="#hanh-trinh"]`, label: 'scroll cue' },
]

function relativeLuminance(r: number, g: number, b: number) {
  const [rs, gs, bs] = [r, g, b].map(value => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrast(a: number, b: number) {
  const [lighter, darker] = a > b ? [a, b] : [b, a]
  return (lighter + 0.05) / (darker + 0.05)
}

async function decode(png: Buffer) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

test.describe.configure({ timeout: 240_000 })

for (const theme of ['light', 'dark'] as const) {
  test(`hero text over the photograph holds WCAG AA contrast — ${theme}`, async ({ page }, info) => {
    await installUiBoot(page, theme)
    // 390 is the phone case: object-cover shows the full image height there, so the banner
    // across the top of the photo and the bright steps are both in frame. 1440 is desktop.
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: /quản lý giáo lý/i })).toBeVisible({ timeout: 30_000 })
      await page.locator('.landing-hero-photo').evaluate(image => (image as HTMLImageElement).decode())
      await settleFiniteAnimations(page)

      const measured: unknown[] = []
      for (const target of TARGETS) {
        const elements = await page.locator(target.selector).all()
        for (const [index, locator] of elements.entries()) {
          if (!await locator.isVisible()) {
            if (process.env.HERO_CONTRAST_VERBOSE) console.log(`SKIP ${target.label}#${index + 1} not visible (${theme}@${width})`)
            continue
          }
          const label = elements.length > 1 ? `${target.label} #${index + 1}` : target.label
          const metrics = await locator.evaluate(element => {
            const style = getComputedStyle(element)
            const box = element.getBoundingClientRect()
            // Resolve the text colour to sRGB bytes in the browser. Chrome serialises
            // `text-white/95` as `oklab(L a b / alpha)`, and reading those three numbers
            // as R/G/B silently produced wrong ratios. Rasterising via canvas is the only
            // colour-space-safe route.
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = 1
            const context = canvas.getContext('2d', { willReadFrequently: true })!
            context.fillStyle = style.color
            context.fillRect(0, 0, 1, 1)
            const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
            return {
              fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight) || 400,
              r, g, b, alpha: a / 255,
              box: { x: box.x, y: box.y, width: box.width, height: box.height },
            }
          })

          // Blank the glyphs through inline styles, not an injected stylesheet. A rule like
          // `.wcag-probe * { color: transparent !important }` loses to Tailwind's own
          // `text-white` on a child element — verified: the anchor went transparent while
          // its inner <span> stayed `rgb(255,255,255)`. That silently poisoned every
          // measurement, because the "backdrop" then contained the text itself. Inline
          // `!important` on each node in the subtree cannot be overridden.
          const blank = () => locator.evaluate((element) => {
            for (const node of [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))]) {
              node.dataset.wcagPrevColor = node.style.color
              // `transition: none` is not optional: the scroll cue's label carries
              // `transition-colors`, so blanking its colour animates over 150ms and the
              // screenshot then catches a still-mostly-white frame — which measured 0.93
              // for a region that renders as dark navy.
              node.style.setProperty('transition', 'none', 'important')
              node.style.setProperty('color', 'transparent', 'important')
              node.style.setProperty('text-shadow', 'none', 'important')
              node.style.setProperty('filter', 'none', 'important')
            }
          })
          const unblank = () => locator.evaluate((element) => {
            for (const node of [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))]) {
              if (node.dataset.wcagPrevColor !== undefined) node.style.color = node.dataset.wcagPrevColor
              node.style.removeProperty('transition')
              node.style.removeProperty('text-shadow')
              node.style.removeProperty('filter')
              delete node.dataset.wcagPrevColor
            }
          })
          await blank()
          const backdrop = await decode(await page.screenshot({ scale: 'css' }))
          await unblank()

          // Sample the central 60% of the box. A bounding box is not a painted region —
          // rounded corners let the bare photograph through — but insetting by the border
          // radius is worse: `rounded-full` on a short box yields radius = height/2, which
          // collapses the sample to zero pixels. The central band is inside the painted
          // area for every shape in use here, and it is also where the text sits.
          const marginX = metrics.box.width * 0.2
          const marginY = metrics.box.height * 0.2
          const x0 = Math.max(0, Math.round(metrics.box.x + marginX))
          const y0 = Math.max(0, Math.round(metrics.box.y + marginY))
          const x1 = Math.min(backdrop.width, Math.round(metrics.box.x + metrics.box.width - marginX))
          const y1 = Math.min(backdrop.height, Math.round(metrics.box.y + metrics.box.height - marginY))
          const pixels = Math.max(0, (x1 - x0) * (y1 - y0))
          if (pixels < 64) {
            if (process.env.HERO_CONTRAST_VERBOSE) console.log(`SKIP ${label} pixels=${pixels} box=${JSON.stringify(metrics.box)} (${theme}@${width})`)
            continue
          }

          let brightestBackdrop = 0
          let meanR = 0
          let meanG = 0
          let meanB = 0
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const index = (y * backdrop.width + x) * backdrop.channels
              const r = backdrop.data[index]
              const g = backdrop.data[index + 1]
              const b = backdrop.data[index + 2]
              brightestBackdrop = Math.max(brightestBackdrop, relativeLuminance(r, g, b))
              meanR += r
              meanG += g
              meanB += b
            }
          }
          // WCAG 1.4.3 is defined on colours, so the foreground is the specified text
          // colour — composited over the mean local backdrop so `text-white/95` resolves
          // to what the eye receives — not the antialiased glyph pixels.
          const alpha = metrics.alpha
          const textLuminance = relativeLuminance(
            metrics.r * alpha + (meanR / pixels) * (1 - alpha),
            metrics.g * alpha + (meanG / pixels) * (1 - alpha),
            metrics.b * alpha + (meanB / pixels) * (1 - alpha),
          )

          // WCAG "large text" is >=24px, or >=18.66px bold; below that the bar is 4.5:1.
          const large = metrics.fontSize >= 24 || (metrics.fontSize >= 18.66 && metrics.fontWeight >= 700)
          measured.push({
            label, width, fontPx: metrics.fontSize, fontWeight: metrics.fontWeight,
            sampledPx: pixels,
            textLuminance: Number(textLuminance.toFixed(4)),
            brightestBackdropLuminance: Number(brightestBackdrop.toFixed(4)),
            ratio: Number(contrast(textLuminance, brightestBackdrop).toFixed(2)),
            required: large ? 3 : 4.5,
          })
        }
      }

      const rows = measured as { label: string; ratio: number; required: number; textLuminance: number; brightestBackdropLuminance: number }[]
      const failing = rows.filter(row => row.ratio < row.required)
      if (failing.length) console.log(`FAILING ${theme}@${width}: ${JSON.stringify(failing)}`)
      if (process.env.HERO_CONTRAST_VERBOSE) console.log(`ALL ${theme}@${width}: ${JSON.stringify(rows)}`)
      await info.attach(`hero-contrast-${theme}-${width}.json`, {
        body: Buffer.from(JSON.stringify(measured, null, 2)), contentType: 'application/json',
      })
      expect(failing, `hero text over the photo @${width}px (${theme})`).toEqual([])
      expect(rows.length, 'expected to measure the hero targets').toBeGreaterThan(4)
    }
  })
}
