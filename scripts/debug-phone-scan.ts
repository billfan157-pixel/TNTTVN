/* eslint-disable no-console */
/** Debug: chạy pipeline quét production trên ảnh ĐIỆN THOẠI thật (JPEG/PNG).
 * Tái hiện đúng ExamScanModal: decode qua browser canvas → ImageData →
 * jsQR → detectBarcodeFromImageData → detectAnswersFromImage (+ chẩn đoán band). */
import puppeteer from 'puppeteer'
import jsQR from 'jsqr'
import { readFileSync } from 'node:fs'
import { detectAnswersFromImage, tryLocateIntegratedFrame, toGrayscale, type GrayImage } from '../src/lib/omr.js'
import { detectBarcodeFromImageData } from '../src/lib/barcode.js'
import { INTEGRATED_OMR_MARKERS, INTEGRATED_CORNER_SIZE } from '../src/lib/answerSheetTemplate.js'

const FILE = process.argv[2]
const answerKey: Record<number, 'A' | 'B' | 'C' | 'D'> = {}

// Bands mirror INTEGRATED_MARKER_BANDS trong omr.ts (phải khớp để chẩn đoán đúng).
const BANDS = [
  { id: 'TL', xMin: 0, xMax: 0.12, yMin: 0.06, yMax: 0.30, ax: 0, ay: 0.06 },
  { id: 'TR', xMin: 0.88, xMax: 1, yMin: 0.06, yMax: 0.30, ax: 1, ay: 0.06 },
  { id: 'BR', xMin: 0.88, xMax: 1, yMin: 0.22, yMax: 0.75, ax: 1, ay: 0.75 },
  { id: 'BL', xMin: 0, xMax: 0.12, yMin: 0.22, yMax: 0.75, ax: 0, ay: 0.75 },
] as const
const MIN_COV = 0.72

function buildSat(gray: GrayImage): Uint32Array {
  const { width, height, data } = gray
  const sat = new Uint32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    const rowOff = (y + 1) * (width + 1)
    const prevOff = y * (width + 1)
    for (let x = 0; x < width; x++) {
      rowSum += data[y * width + x]
      sat[rowOff + x + 1] = sat[prevOff + x + 1] + rowSum
    }
  }
  return sat
}

function windowSum(sat: Uint32Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  const r0 = y0 * (w + 1)
  const r1 = y1 * (w + 1)
  return sat[r1 + x1] - sat[r0 + x1] - sat[r1 + x0] + sat[r0 + x0]
}

/** Đo coverage cửa sổ (half) quanh 1 điểm — tương đương findMarkerInBand pass 1. */
function covAt(gray: GrayImage, sat: Uint32Array, cx: number, cy: number, half: number): number {
  const { width, height } = gray
  const ax0 = Math.max(0, cx - half)
  const ay0 = Math.max(0, cy - half)
  const ax1 = Math.min(width, cx + half + 1)
  const ay1 = Math.min(height, cy + half + 1)
  const cnt = (ax1 - ax0) * (ay1 - ay0)
  if (cnt === 0) return 0
  return 1 - windowSum(sat, width, ax0, ay0, ax1, ay1) / cnt / 255
}

function bandDiag(gray: GrayImage, sat: Uint32Array, id: string, xMin: number, xMax: number, yMin: number, yMax: number, half: number) {
  const { width, height } = gray
  const x0 = Math.max(0, Math.floor(xMin * width))
  const x1 = Math.min(width, Math.ceil(xMax * width))
  const y0 = Math.max(0, Math.floor(yMin * height))
  const y1 = Math.min(height, Math.ceil(yMax * height))
  let maxCov = -1
  let mx = 0, my = 0
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const cov = covAt(gray, sat, xx, yy, half)
      if (cov > maxCov) { maxCov = cov; mx = xx; my = yy }
    }
  }
  // 2× window (big-blob check)
  const bHalf = Math.max(2, Math.round(half * 2))
  let bigCov = 0
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const cov = covAt(gray, sat, xx, yy, bHalf)
      if (cov > bigCov) bigCov = cov
    }
  }
  // coverage tại vị trí marker template kỳ vọng (INTEGRATED_OMR_MARKERS)
  const tpl = INTEGRATED_OMR_MARKERS.find((m) => m.id === id)
  const expCov = tpl ? covAt(gray, sat, tpl.x * width, tpl.y * height, half) : null
  // coverage tại vị trí điểm đen nhất trong band (cửa sổ chính xác marker)
  const winX = Math.max(0, mx - half), winY = Math.max(0, my - half)
  const winX1 = Math.min(width, mx + half + 1), winY1 = Math.min(height, my + half + 1)
  const cnt = (winX1 - winX) * (winY1 - winY)
  let sum = 0
  for (let yy = winY; yy < winY1; yy++) for (let xx = winX; xx < winX1; xx++) sum += gray.data[yy * width + xx]
  const meanLum = cnt > 0 ? Math.round(sum / cnt) : -1
  console.log(
    `[band:${id}] maxCov(1x)=${maxCov.toFixed(4)} @(${(mx / width).toFixed(4)},${(my / height).toFixed(4)}) ` +
    `bigCov(2x)=${bigCov.toFixed(4)} (reject ${bigCov >= 0.7 ? 'YES' : 'no'}) ` +
    `tplCov=@(${tpl?.x},${tpl?.y}) = ${expCov === null ? 'n/a' : expCov.toFixed(4)} ` +
    `pass1ok=${maxCov >= MIN_COV} meanLum@best=${meanLum}`
  )
}

function imgStats(gray: GrayImage) {
  const { width, height, data } = gray
  let min = 255, max = 0, sum = 0
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  console.log(`[stats] ${width}x${height} luma min=${min} max=${max} mean=${(sum / data.length).toFixed(1)}`)
}

/** ASCII map độ tối 40×80 — "nhìn" layout ảnh dưới dạng text. */
function asciiMap(gray: GrayImage, cols = 80, rows = 40) {
  const { width, height, data } = gray
  const chars = ' .:-=+*#%@'
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * width) / cols), x1 = Math.max(x0 + 1, Math.floor(((c + 1) * width) / cols))
      const y0 = Math.floor((r * height) / rows), y1 = Math.max(y0 + 1, Math.floor(((r + 1) * height) / rows))
      let sum = 0, n = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += data[y * width + x]; n++ }
      const lum = sum / n
      line += chars[Math.min(9, Math.floor((255 - lum) / 25.5))]
    }
    out.push(line)
  }
  console.log(`[ascii ${cols}x${rows}] (darkest=@, whitest=space)` + '\n' + out.join('\n'))
}

/** Fine ASCII map của 1 vùng crop (tọa độ normalized). */
function cropMap(gray: GrayImage, label: string, x0: number, y0: number, x1: number, y1: number, cols = 100, rows = 40) {
  const { width, height, data } = gray
  const px0 = Math.floor(x0 * width), py0 = Math.floor(y0 * height)
  const px1 = Math.floor(x1 * width), py1 = Math.floor(y1 * height)
  const chars = ' .:-=+*#%@'
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      const xx0 = px0 + Math.floor((c * (px1 - px0)) / cols), xx1 = Math.max(xx0 + 1, px0 + Math.floor(((c + 1) * (px1 - px0)) / cols))
      const yy0 = py0 + Math.floor((r * (py1 - py0)) / rows), yy1 = Math.max(yy0 + 1, py0 + Math.floor(((r + 1) * (py1 - py0)) / rows))
      let sum = 0, n = 0
      for (let y = yy0; y < yy1; y++) for (let x = xx0; x < xx1; x++) { sum += data[y * width + x]; n++ }
      line += chars[Math.min(9, Math.floor((255 - sum / n) / 25.5))]
    }
    out.push(line)
  }
  console.log(`[crop:${label} ${(x0).toFixed(3)}-${(x1).toFixed(3)} x ${(y0).toFixed(3)}-${(y1).toFixed(3)}]` + '\n' + out.join('\n'))
}

async function tryQrMultiScale(data: number[], w: number, h: number) {
  const scales: { label: string; f: (x: number, y: number, c: number, i: number) => number }[] = [
    { label: 'native', f: (x, y, c, i) => data[i] },
    { label: 'invert', f: (x, y, c, i) => 255 - data[i] },
  ]
  for (const s of scales) {
    for (const ds of [1, 0.5, 0.25, 0.75, 2]) {
      const nw = Math.max(16, Math.round(w * ds)), nh = Math.max(16, Math.round(h * ds))
      const buf = new Uint8ClampedArray(nw * nh * 4)
      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          const sx = Math.min(w - 1, Math.floor(x / ds)), sy = Math.min(h - 1, Math.floor(y / ds))
          const v = s.f(sx, sy, 0, (sy * w + sx) * 4)
          buf[(y * nw + x) * 4] = v; buf[(y * nw + x) * 4 + 1] = v; buf[(y * nw + x) * 4 + 2] = v; buf[(y * nw + x) * 4 + 3] = 255
        }
      }
      try {
        const r = jsQR(buf, nw, nh)
        if (r) return { scale: s.label, ds, data: r.data }
      } catch { /* ignore */ }
    }
  }
  return null
}

/** Đo luma trung bình theo cột cho 1 dải ngang — tìm mép giấy / đường tối. */
function rowProfile(gray: GrayImage, y0: number, y1: number, label: string) {
  const { width, height, data } = gray
  const py0 = Math.floor(y0 * height), py1 = Math.floor(y1 * height)
  const cols = 40
  const out: string[] = []
  for (let c = 0; c < cols; c++) {
    const xx0 = Math.floor((c * width) / cols), xx1 = Math.max(xx0 + 1, Math.floor(((c + 1) * width) / cols))
    let sum = 0, n = 0
    for (let y = py0; y < py1; y++) for (let x = xx0; x < xx1; x++) { sum += data[y * width + x]; n++ }
    out.push(`${(xx0 / width).toFixed(2)}:${Math.round(sum / n)}`)
  }
  console.log(`[profile:${label} y=${y0}-${y1}] ` + out.join(' '))
}

/** Prototype: normalize tương phản CỤC BỘ (bất biến bóng đổ/thiếu sáng).
 * ng = 255 * (1 - clamp((m - lum) * GAIN / m, 0, 1)); m = local mean (box blur thô). */
function normalizeLocalContrast(gray: GrayImage, gain = 2.5, blockDiv = 16, minMean = 20): GrayImage {
  const { width, height, data } = gray
  const block = Math.max(8, Math.floor(Math.min(width, height) / blockDiv))
  const bw = Math.max(1, Math.ceil(width / block)), bh = Math.max(1, Math.ceil(height / block))
  const meanGrid = new Float64Array(bw * bh)
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const x0 = bx * block, y0 = by * block
      const x1 = Math.min(width, x0 + block), y1 = Math.min(height, y0 + block)
      let sum = 0, n = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += data[y * width + x]; n++ }
      meanGrid[by * bw + bx] = n ? sum / n : 128
    }
  }
  const out = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y++) {
    const gy = Math.min(bh - 1, Math.floor(y / block))
    for (let x = 0; x < width; x++) {
      const gx = Math.min(bw - 1, Math.floor(x / block))
      const m = meanGrid[gy * bw + gx]
      const lum = data[y * width + x]
      if (m < minMean) { out[y * width + x] = lum; continue }
      const d = (m - lum) / m
      const ng = Math.round(255 * (1 - Math.min(1, Math.max(0, d * gain))))
      out[y * width + x] = ng
    }
  }
  return { width, height, data: out }
}

function paperBBox(gray: GrayImage, brightTh = 205): { x0: number; y0: number; x1: number; y1: number; coverage: number } | null {
  const { width, height, data } = gray
  const cw = 40, ch = 80
  const bright = new Uint8Array(cw * ch)
  let brightPx = 0
  for (let r = 0; r < ch; r++) {
    for (let c = 0; c < cw; c++) {
      const x0 = Math.floor((c * width) / cw), x1 = Math.max(x0 + 1, Math.floor(((c + 1) * width) / cw))
      const y0 = Math.floor((r * height) / ch), y1 = Math.max(y0 + 1, Math.floor(((r + 1) * height) / ch))
      let sum = 0, n = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += data[y * width + x]; n++ }
      if (sum / n > brightTh) { bright[r * cw + c] = 1; brightPx++ }
    }
  }
  if (brightPx < 100) return null
  let minC = cw, maxC = 0, minR = ch, maxR = 0
  for (let r = 0; r < ch; r++) for (let c = 0; c < cw; c++) {
    if (!bright[r * cw + c]) continue
    if (c < minC) minC = c
    if (c > maxC) maxC = c
    if (r < minR) minR = r
    if (r > maxR) maxR = r
  }
  return {
    x0: minC / cw, y0: minR / ch, x1: (maxC + 1) / cw, y1: (maxR + 1) / ch,
    coverage: brightPx / (cw * ch),
  }
}

/** Tìm marker full-page tại vị trí kỳ vọng (template CORNER_MARKERS) — tái hiện findMarker. */
function fullPageMarkerDiag(gray: GrayImage, sat: Uint32Array, id: string, expectX: number, expectY: number, sizePx: number) {
  const { width, height } = gray
  const cx = expectX * width, cy = expectY * height
  const win = Math.max(14, sizePx * 3.5)
  const halfWin = win / 2
  const half = Math.max(2, Math.floor(sizePx / 2))
  const x0 = Math.max(0, Math.floor(cx - halfWin)), x1 = Math.min(width, Math.ceil(cx + halfWin))
  const y0 = Math.max(0, Math.floor(cy - halfWin)), y1 = Math.min(height, Math.ceil(cy + halfWin))
  let best = { x: 0, y: 0, cov: -1 }
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const cov = covAt(gray, sat, xx, yy, half)
      if (cov > best.cov) best = { x: xx, y: yy, cov }
    }
  }
  const bHalf = Math.max(2, Math.round(half * 2))
  const bigCov = covAt(gray, sat, best.x, best.y, bHalf)
  console.log(
    `[fp:${id}] expect=(${expectX},${expectY}) sizePx=${sizePx.toFixed(0)} half=${half} ` +
    `bestCov=${best.cov.toFixed(3)} @(${(best.x / width).toFixed(4)},${(best.y / height).toFixed(4)}) bigCov(2x)=${bigCov.toFixed(3)} ` +
    `ok=${best.cov >= 0.38}`
  )
}

async function main() {
  if (!FILE) { console.error('usage: tsx debug-phone-scan.ts <image>'); process.exit(1) }
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const sizes: Record<string, { w: number; h: number }> = {}
  const buf = readFileSync(FILE)
  const b64 = Buffer.from(buf).toString('base64')
  const mime = FILE.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  await page.goto('about:blank')
  const pageCode = `
(async () => {
  const img = new Image();
  img.src = 'data:__MIME__;base64,__B64__';
  await img.decode();
  const out = {};
  const mk = (label, w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    out[label] = { w, h, data: Array.from(d) };
  };
  mk('native', img.naturalWidth, img.naturalHeight);
  const MAX_SIDE = 1400;
  let w = img.naturalWidth, h = img.naturalHeight;
  if (w > MAX_SIDE || h > MAX_SIDE) {
    if (w > h) { h = Math.round((h * MAX_SIDE) / w); w = MAX_SIDE; }
    else { w = Math.round((w * MAX_SIDE) / h); h = MAX_SIDE; }
  }
  mk('photo1400', w, h);
  const w1080 = Math.min(1080, img.naturalWidth);
  const h1080 = Math.round((w1080 * img.naturalHeight) / img.naturalWidth);
  mk('camera1080', w1080, h1080);
  return out;
})()
`.replace('__MIME__', mime).replace('__B64__', b64)
  const frames = (await page.evaluate(pageCode)) as Record<string, { w: number; h: number; data: number[] }>
  await browser.close()

  for (const [label, f] of Object.entries(frames)) {
    sizes[label] = { w: f.w, h: f.h }
    console.log(`\n===== ${label} ${f.w}x${f.h} =====`)
    const img: ImageData = { width: f.w, height: f.h, data: new Uint8ClampedArray(f.data) }
    const gray = toGrayscale(img)
    imgStats(gray)

    const qr = jsQR(f.data as unknown as Uint8ClampedArray, f.w, f.h)
    console.log(`[qr] ${qr ? `FOUND data="${qr.data}"` : 'not found'}`)
    const bc = detectBarcodeFromImageData(img)
    console.log(`[barcode] ${bc ? `FOUND "${bc}"` : 'not found'}`)

    asciiMap(gray)
    const paper = paperBBox(gray)
    console.log(`[paper] ${paper ? JSON.stringify(paper) : 'none'}`)
    const qrMulti = await tryQrMultiScale(f.data, f.w, f.h)
    console.log(`[qr-multiscale] ${qrMulti ? JSON.stringify(qrMulti) : 'not found at any scale'}`)
    if (label === 'native') {
      cropMap(gray, 'sheet-full', 0, 0.16, 1, 0.9, 120, 60)
      cropMap(gray, 'qr-region', 0.62, 0.16, 1.0, 0.42, 100, 40)
      rowProfile(gray, 0.55, 0.75, 'shadow-band')
    }

    const sat = buildSat(gray)
    const half = Math.max(2, Math.floor((INTEGRATED_CORNER_SIZE * Math.min(f.w, f.h)) / 2))
    console.log(`[sizePx] INTEGRATED_CORNER_SIZE*minSide=${(INTEGRATED_CORNER_SIZE * Math.min(f.w, f.h)).toFixed(1)}px half=${half}`)
    for (const b of BANDS) bandDiag(gray, sat, b.id, b.xMin, b.xMax, b.yMin, b.yMax, half)

    const fpSize = 0.055 * Math.min(f.w, f.h)
    for (const m of [{ id: 'TL', x: 0.07, y: 0.08 }, { id: 'TR', x: 0.93, y: 0.08 }, { id: 'BR', x: 0.93, y: 0.92 }, { id: 'BL', x: 0.07, y: 0.92 }]) {
      fullPageMarkerDiag(gray, sat, m.id, m.x, m.y, fpSize)
    }

    console.log(`--- normalized (gain 2.5, block minSide/16) ---`)
    const ngray = normalizeLocalContrast(gray)
    imgStats(ngray)
    const nsat = buildSat(ngray)
    for (const b of BANDS) bandDiag(ngray, nsat, b.id, b.xMin, b.xMax, b.yMin, b.yMax, half)
    const nLoc = tryLocateIntegratedFrame(ngray)
    console.log(`[norm:locateIntegrated] ${nLoc ? JSON.stringify({
      rect: nLoc.rect,
      markers: nLoc.markers.map((m) => ({ id: m.id, x: (m.x / f.w).toFixed(4), y: (m.y / f.h).toFixed(4), cov: m.coverage.toFixed(3) })),
    }) : 'NULL'}`)
    for (const m of [{ id: 'TL', x: 0.07, y: 0.08 }, { id: 'TR', x: 0.93, y: 0.08 }, { id: 'BR', x: 0.93, y: 0.92 }, { id: 'BL', x: 0.07, y: 0.92 }]) {
      fullPageMarkerDiag(ngray, nsat, m.id, m.x, m.y, fpSize)
    }
    const qrBuf = new Uint8ClampedArray(f.w * f.h * 4)
    for (let i = 0; i < f.w * f.h; i++) {
      const v = ngray.data[i]
      qrBuf[i * 4] = v; qrBuf[i * 4 + 1] = v; qrBuf[i * 4 + 2] = v; qrBuf[i * 4 + 3] = 255
    }
    let qrN: { data: string } | null = null
    for (const ds of [1, 0.5, 0.75, 1.5]) {
      const nw = Math.max(16, Math.round(f.w * ds)), nh = Math.max(16, Math.round(f.h * ds))
      const buf = new Uint8ClampedArray(nw * nh * 4)
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const sx = Math.min(f.w - 1, Math.floor(x / ds)), sy = Math.min(f.h - 1, Math.floor(y / ds))
        const v = ngray.data[sy * f.w + sx]
        buf[(y * nw + x) * 4] = v; buf[(y * nw + x) * 4 + 1] = v; buf[(y * nw + x) * 4 + 2] = v; buf[(y * nw + x) * 4 + 3] = 255
      }
      try {
        const r = jsQR(buf, nw, nh)
        if (r) { qrN = { data: r.data }; break }
      } catch { /* ignore */ }
    }
    console.log(`[norm:qr] ${qrN ? `FOUND "${qrN.data}"` : 'not found'}`)
    if (label === 'native') {
      cropMap(ngray, 'norm-qr-region', 0.62, 0.16, 1.0, 0.42, 100, 40)
      cropMap(ngray, 'norm-sheet-top', 0, 0.16, 1, 0.36, 120, 40)
    }

    const located = tryLocateIntegratedFrame(gray)
    console.log(`[locateIntegrated] ${located ? JSON.stringify({
      rect: located.rect,
      markers: located.markers.map((m) => ({ id: m.id, x: (m.x / f.w).toFixed(4), y: (m.y / f.h).toFixed(4), cov: m.coverage.toFixed(3) })),
    }) : 'NULL'}`)

    const res = detectAnswersFromImage(img, answerKey, 50, 10)
    console.log(`[detect] ok=${res.ok} reason=${res.reason} score=${res.score} conf=${res.confidence.toFixed(3)} correct=${res.rawCorrectCount}/50`)
    if (res.ok && res.questions.length) {
      const covs = res.questions.map((q) => q.options.map((o) => o.coverage))
      const filled = covs.flat().filter((c) => c > 0.4)
      const empty = covs.flat().filter((c) => c <= 0.4)
      const q = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
      console.log(`[cells] filledCov avg=${q(filled).toFixed(3)} n=${filled.length} | emptyCov avg=${q(empty).toFixed(3)} n=${empty.length}`)
    }
  }
  console.log('\n[sizes] ' + JSON.stringify(sizes))
}

main().catch((e) => { console.error(e); process.exit(1) })
