/* eslint-disable no-console */
/** Debug: render integrated sheet → tìm marker thực tế nằm đâu trên ảnh. */
import { buildBatchExamPapersHtml } from '../src/utils/examSheets.js'
import { INTEGRATED_OMR_MARKERS } from '../src/lib/answerSheetTemplate.js'
import puppeteer from 'puppeteer'

async function main() {
  const totalQ = 50
  const options = ['A', 'B', 'C', 'D']
  const answerKey: Record<number, string> = {}
  for (let i = 1; i <= totalQ; i++) answerKey[i] = options[(i - 1) % 4]
  const questions = Array.from({ length: totalQ }, (_, i) => ({
    index: i + 1,
    question: `Câu hỏi số ${i + 1}: giáo lý về Chúa Giê-su và các mầu nhiệm.`,
    options: { A: 'Đáp án A đúng', B: 'Đáp án B đúng', C: 'Đáp án C đúng', D: 'Đáp án D đúng' },
    correctOption: answerKey[i + 1],
  }))
  const html = buildBatchExamPapersHtml(
    [{ id: 'st', code: 'C', name: 'N' }],
    {
      parishName: 'Giáo Xứ E2E', dioceseName: 'Giáo Phận', subject: 'Giáo Lý',
      classLabel: 'Thiếu Nhi 1', academicYear: '2026-2027', questions,
      includeAnswerGrid: true, includeGradingBox: true, sessionId: 'S',
    }
  )

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load', timeout: 20000 })
  await new Promise((r) => setTimeout(r, 500))
  await page.evaluate((key: Record<number, string>) => {
    const rows = document.querySelectorAll('.grid-q-row')
    for (const row of Array.from(rows)) {
      const m = row.querySelector('.q-num')?.textContent?.match(/\d+/)
      const q = m ? Number(m[0]) : null
      const opt = q ? key[q] : null
      if (!opt) continue
      const bubbles = row.querySelectorAll('.bubble')
      const idx = { A: 0, B: 1, C: 2, D: 3 }[opt as 'A' | 'B' | 'C' | 'D']
      if (bubbles[idx]) bubbles[idx].classList.add('bubble-filled')
    }
  }, answerKey)
  await new Promise((r) => setTimeout(r, 300))
  const rects = await page.evaluate(() => {
    const out: any = { frame: null, grid: null, rows: [], viewport: { w: 0, h: 0 } }
    const f = document.querySelector('.omr-frame')
    if (f) {
      const r = f.getBoundingClientRect()
      out.frame = { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    const grid = document.querySelector('.answer-grid-container')
    if (grid) {
      const r = grid.getBoundingClientRect()
      out.grid = { x: r.x, y: r.y, w: r.width, h: r.height }
      for (let i = 0; i < Math.min(3, grid.children.length); i++) {
        const row = grid.children[i]
        const rr = row.getBoundingClientRect()
        const bubbles = []
        for (const el of row.querySelectorAll('.bubble')) {
          const br = el.getBoundingClientRect()
          bubbles.push({ x: br.x + br.width / 2, y: br.y + br.height / 2, w: br.width, h: br.height })
        }
        out.rows.push({ x: rr.x, y: rr.y, w: rr.width, h: rr.height, bubbles })
      }
    }
    out.viewport = { w: window.innerWidth, h: window.innerHeight }
    return out
  })
  console.log('DOM rects:', JSON.stringify(rects))
  const shot = await page.screenshot({ type: 'png' })

  const px = await page.evaluate(async (dataUrl) => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const id = ctx.getImageData(0, 0, c.width, c.height)
    return { data: Array.from(id.data), width: c.width, height: c.height }
  }, `data:image/png;base64,${shot.toString('base64')}`)

  const W = px.width
  const H = px.height
  console.log(`image: ${W}x${H}`)

  const gray = new Float64Array(W * H)
  for (let i = 0; i < W * H; i++) {
    gray[i] = (px.data[i * 4] + px.data[i * 4 + 1] + px.data[i * 4 + 2]) / 3
  }
  const sampleAt = (x: number, y: number, r: number) => {
    let sum = 0, n = 0
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const X = Math.round(x + dx), Y = Math.round(y + dy)
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue
      sum += gray[Y * W + X]; n++
    }
    return 1 - sum / n / 255
  }

  console.log('── Marker kỳ vọng (INTEGRATED_OMR_MARKERS normalized × image):')
  for (const m of INTEGRATED_OMR_MARKERS) {
    const mx = m.x * W, my = m.y * H
    console.log(`  ${m.id}: expected (${mx.toFixed(0)},${my.toFixed(0)}) darkness(8px)=${sampleAt(mx, my, 8).toFixed(2)}`)
  }

  const { detectAnswersFromImage, toGrayscale, tryLocateIntegratedFrame } = await import('../src/lib/omr.js')
  const imgData = { data: new Uint8ClampedArray(px.data), width: W, height: H } as unknown as ImageData
  const res = detectAnswersFromImage(imgData, answerKey, 50, 10)
  console.log('detect:', JSON.stringify({ ok: res.ok, score: res.score, correct: res.rawCorrectCount, reason: res.reason, conf: res.confidence }))
  for (const q of res.questions.slice(0, 8)) {
    console.log(`  q${q.questionIndex}: sel=${q.selectedAnswer} blank=${q.isBlank} multi=${q.isMultiFill} ` + q.readings.map(r => `${r.option}=${r.coverage.toFixed(2)}`).join(' '))
  }

  const frameLoc = tryLocateIntegratedFrame(toGrayscale(imgData))
  console.log('tryLocateIntegratedFrame:', frameLoc ? frameLoc.markers.map(m => `${m.id}@(${m.x},${m.y}) cov=${m.coverage.toFixed(3)}`).join(' | ') + ' rect=' + JSON.stringify(frameLoc.rect) : 'NULL')

  if (frameLoc) {
    const { integratedMcCellsForRect } = await import('../src/lib/answerSheetTemplate.js')
    const cells = integratedMcCellsForRect(50, frameLoc.rect)
    console.log('── Template cells vs real bubble darkness (r=5):')
    for (const c of cells.filter(c => c.questionIndex === 1 || c.questionIndex === 8 || c.questionIndex === 50).slice(0, 12)) {
      const x = c.x * W, y = c.y * H
      console.log(`  q${c.questionIndex}${c.option}: cell=(${x.toFixed(1)},${y.toFixed(1)}) dark=${sampleAt(x, y, 5).toFixed(2)}`)
    }
    console.log('── Quét dark blobs trong vùng grid (x 60..745, y 215..360):')
    const blobs: { x: number; y: number; cov: number }[] = []
    for (let yy = 215; yy < 360; yy += 2) {
      for (let xx = 60; xx < 745; xx += 2) {
        const cov = sampleAt(xx, yy, 4)
        if (cov > 0.65) blobs.push({ x: xx, y: yy, cov })
      }
    }
    const dedup: { x: number; y: number; cov: number }[] = []
    for (const b of blobs) {
      if (!dedup.some((p) => Math.abs(p.x - b.x) < 6 && Math.abs(p.y - b.y) < 6)) dedup.push(b)
    }
    for (const b of dedup.slice(0, 30)) console.log(`  dark@(${b.x},${b.y}) cov=${b.cov.toFixed(2)}`)
  }

  console.log('── Vùng QR/marker TR (x 580..800, y 150..240) — density 10px grid:')
  const d = (x: number, y: number) => {
    let sum = 0, n = 0
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const X = x + dx, Y = y + dy
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue
      sum += gray[Y * W + X]; n++
    }
    return (1 - sum / n / 255).toFixed(2)
  }
  for (let y = 150; y <= 240; y += 30) {
    const row = []
    for (let x = 580; x <= 800; x += 22) row.push(`${x}:${d(x, y)}`)
    console.log('  y=' + y + ' ' + row.join(' '))
  }

  console.log('── ASCII dump x 690..770, y 190..225 (TR marker zone):')
  for (let y = 190; y < 225; y++) {
    let line = ''
    for (let x = 690; x < 770; x++) line += gray[y * W + x] < 128 ? '#' : '.'
    console.log('  ' + line)
  }
  console.log('── ASCII dump x 40..120, y 190..225 (TL marker zone):')
  for (let y = 190; y < 225; y++) {
    let line = ''
    for (let x = 40; x < 120; x++) line += gray[y * W + x] < 128 ? '#' : '.'
    console.log('  ' + line)
  }

  // Mô phỏng banded search theo từng band
  const { width, height, data: gdata } = gray2
  const sat = new Uint32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    const rowOff = (y + 1) * (width + 1)
    const prevOff = y * (width + 1)
    for (let x = 0; x < width; x++) {
      rowSum += gdata[y * width + x]
      sat[rowOff + x + 1] = sat[prevOff + x + 1] + rowSum
    }
  }
  const windowSum = (x0: number, y0: number, x1: number, y1: number) => {
    const r0 = y0 * (width + 1), r1 = y1 * (width + 1)
    return sat[r1 + x1] - sat[r0 + x1] - sat[r1 + x0] + sat[r0 + x0]
  }
  const bands = [
    { id: 'TL', xMin: 0, xMax: 0.12, yMin: 0.06, yMax: 0.40 },
    { id: 'TR', xMin: 0.88, xMax: 1, yMin: 0.06, yMax: 0.40 },
    { id: 'BR', xMin: 0.88, xMax: 1, yMin: 0.08, yMax: 0.75 },
    { id: 'BL', xMin: 0, xMax: 0.12, yMin: 0.08, yMax: 0.75 },
  ]
  for (const b of bands) {
    const bx0 = Math.floor(b.xMin * width), bx1 = Math.min(width, Math.ceil(b.xMax * width))
    const by0 = Math.floor(b.yMin * height), by1 = Math.min(height, Math.ceil(b.yMax * height))
    let best: { x: number; y: number; cov: number } | null = null
    for (let yy = by0; yy < by1; yy++) {
      for (let xx = bx0; xx < bx1; xx++) {
        const ax0 = Math.max(0, xx - 8), ay0 = Math.max(0, yy - 8)
        const ax1 = Math.min(width, xx + 9), ay1 = Math.min(height, yy + 9)
        const cnt = (ax1 - ax0) * (ay1 - ay0)
        if (cnt === 0) continue
        const cov = 1 - windowSum(ax0, ay0, ax1, ay1) / cnt / 255
        if (!best || cov > best.cov) best = { x: xx, y: yy, cov }
      }
    }
    console.log(`band ${b.id}: best=(${best?.x},${best?.y}) cov=${best?.cov.toFixed(3)}`)
  }

  console.log('── Quét tìm vùng tối nhất (17x17) trong 600px đầu, mỗi 20px:')
  const half = 8
  const results: { x: number; y: number; cov: number }[] = []
  for (let yy = 0; yy < Math.min(H, 600); yy++) {
    for (let xx = 0; xx < Math.min(W, 200); xx++) {
      let sum = 0, n = 0
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
        const X = xx + dx, Y = yy + dy
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue
        sum += gray[Y * W + X]; n++
      }
      const cov = 1 - sum / n / 255
      results.push({ x: xx, y: yy, cov })
    }
  }
  results.sort((a, b) => b.cov - a.cov)
  for (const r of results.slice(0, 15)) console.log(`  dark@(${r.x},${r.y}) cov=${r.cov.toFixed(2)}`)
  console.log('── Mô phỏng findMarker (window 61px, half 8) quanh (0.04,0.16):')
  const cx = 0.04 * W, cy = 0.16 * H
  let bestCov = 0
  let bestPos = ''
  for (let yy = Math.max(0, Math.floor(cy - 30)); yy < Math.min(H, Math.ceil(cy + 30)); yy++) {
    for (let xx = Math.max(0, Math.floor(cx - 30)); xx < Math.min(W, Math.ceil(cx + 30)); xx++) {
      let sum = 0, n = 0
      for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) {
        const X = xx + dx, Y = yy + dy
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue
        sum += gray[Y * W + X]; n++
      }
      const cov = 1 - sum / n / 255
      if (cov > bestCov) { bestCov = cov; bestPos = `(${xx},${yy})` }
    }
  }
  console.log(`  best cov=${bestCov.toFixed(2)} at ${bestPos} (expect (${cx.toFixed(0)},${cy.toFixed(0)}))`)
  await browser.close()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })