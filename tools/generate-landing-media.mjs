/**
 * Landing hero image pipeline.
 *
 * The parish photograph is a group portrait taken outside the church, and the original
 * frame carries three pieces of signage: a printed banner across the very top and a
 * vertical banner down each side. On a phone the hero box is taller than the image is
 * wide by a wide margin, so `object-cover` always shows the *full* height of the frame —
 * the top banner is therefore visible on every mobile load, and `object-position` cannot
 * hide it. The only fix is to crop it out of the asset.
 *
 * Outputs AVIF + WebP + JPEG at the widths the plan asks for (640/828/1280/1600/2480).
 * The source stays in git; run this after any change to it:
 *
 *     node tools/generate-landing-media.mjs
 *
 * Prints the byte size of every variant so the LCP budget in the plan (mobile <= 70KB,
 * desktop <= 150KB) can be checked from the output rather than assumed.
 */
import sharp from 'sharp'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

const SOURCE = path.resolve('public/images/xu-doan-tap-the-original.jpg')
const OUT_DIR = path.resolve('public/images/hero')
const PREFIX = 'hero'
const WIDTHS = [640, 828, 1280, 1600, 2480]

// Only the top band is cropped. The two side banners are left in place: they sit outside
// the central group, and cropping 18% off each edge would cut people out of a portrait
// whose whole point is that everyone is in it.
const CROP_TOP_RATIO = 0.05
const CROP_BOTTOM_RATIO = 0.005

// AVIF is the slowest to encode by a wide margin; these are quality targets, not knobs to
// tune blindly. Re-run and read the printed sizes.
const VARIANTS = [
  { format: 'avif', quality: 52 },
  { format: 'webp', quality: 72 },
  // 62, not 76: at 76 the 1600w JPEG fallback came out at 189KB and 158KB at 68, over the plan's 150KB
  // desktop budget. The image carries a heavy scrim, so the extra JPEG quality was buying
  // nothing a reader could see.
  { format: 'jpeg', quality: 62 },
]

const kb = bytes => `${(bytes / 1024).toFixed(1)}KB`

const source = sharp(SOURCE)
const { width, height } = await source.metadata()
if (!width || !height) throw new Error(`cannot read dimensions of ${SOURCE}`)

const top = Math.round(height * CROP_TOP_RATIO)
const bottom = Math.round(height * CROP_BOTTOM_RATIO)
const crop = { left: 0, top, width, height: height - top - bottom }
console.log(`source ${width}x${height} -> crop ${crop.width}x${crop.height} (top ${top}px, bottom ${bottom}px)`)

await rm(OUT_DIR, { recursive: true, force: true })
await mkdir(OUT_DIR, { recursive: true })

const rows = []
for (const target of WIDTHS) {
  if (target > crop.width) continue
  for (const variant of VARIANTS) {
    const file = path.join(OUT_DIR, `${PREFIX}-${target}.${variant.format}`)
    const pipeline = sharp(SOURCE).extract(crop).resize({ width: target, withoutEnlargement: true })
    const encoder = variant.format === 'jpeg'
      ? pipeline.jpeg({ quality: variant.quality, mozjpeg: true, progressive: true })
      : variant.format === 'webp'
        ? pipeline.webp({ quality: variant.quality })
        : pipeline.avif({ quality: variant.quality, effort: 6 })
    const { size } = await encoder.toFile(file)
    rows.push({ width: target, format: variant.format, size })
  }
}

const byFormat = Object.groupBy(rows, row => row.format)
for (const [format, entries] of Object.entries(byFormat)) {
  console.log(`\n${format}`)
  for (const row of entries) console.log(`  ${String(row.width).padStart(4)}w  ${kb(row.size).padStart(8)}`)
}

const mobile = byFormat.jpeg?.find(row => row.width === 828)?.size ?? 0
const desktop = byFormat.jpeg?.find(row => row.width === 1600)?.size ?? 0
console.log(`\nLCP budget (jpeg fallback): mobile 828w = ${kb(mobile)} (target <= 70KB) ${mobile <= 70 * 1024 ? 'OK' : 'OVER'}`)
console.log(`                          desktop 1600w = ${kb(desktop)} (target <= 150KB) ${desktop <= 150 * 1024 ? 'OK' : 'OVER'}`)

// Open Graph / Twitter share card: 1200x630 is the canonical size every crawler
// (Facebook, Zalo, X) renders un-cropped. index.html must reference it with an
// ABSOLUTE url — relative og:image was the pre-2026-09 defect: crawlers resolve it
// against their own fetch origin, and the old file was deleted outright, so every
// share card rendered empty. Sourced from the same cropped frame as the hero and
// biased above centre so faces land in the card. Regenerated here, never hand-made,
// so the share card can never drift from the hero photograph.
const OG_WIDTH = 1200
const OG_HEIGHT = 630
const ogResizedHeight = Math.round(crop.height * (OG_WIDTH / crop.width))
const ogTop = Math.max(0, Math.round((ogResizedHeight - OG_HEIGHT) * 0.35))
const ogFile = path.resolve('public/images/og/catevia-og.jpg')
await mkdir(path.dirname(ogFile), { recursive: true })
const og = await sharp(SOURCE)
  .extract(crop)
  .resize({ width: OG_WIDTH, height: ogResizedHeight })
  .extract({ left: 0, top: ogTop, width: OG_WIDTH, height: OG_HEIGHT })
  .jpeg({ quality: 72, mozjpeg: true, progressive: true })
  .toFile(ogFile)
console.log(`\nog share card: ${og.width}x${og.height} = ${kb(og.size)} -> public/images/og/catevia-og.jpg`)
