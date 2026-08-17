/* eslint-disable no-console */
/** Debug: render SVG phiếu toàn trang → sample độ tối tại các ô bubble. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSingleAnswerSheetSvgString } from '../src/utils/examSheets.js'
import { mcOptionToCell, getMcColumnLayout } from '../src/lib/answerSheetTemplate.js'
import puppeteer from 'puppeteer'

const VW = 1000
const VH = Math.round(VW / 0.707)

async function main() {
  const svg = buildSingleAnswerSheetSvgString(
    { id: 'st', code: 'C', name: 'N' },
    { sessionId: 'S', subject: 'GL', scoreTypeLabel: 'X', classLabel: 'L', maxScore: 10, examType: 'multiple_choice', questionCount: 50 }
  )
  const fill: Record<number, string> = {}
  for (let i = 1; i <= 50; i++) fill[i] = ['A', 'B', 'C', 'D'][(i - 1) % 4]
  let bubbles = ''
  for (const [q, opt] of Object.entries(fill)) {
    const cell = mcOptionToCell(Number(q), opt as any, 50)
    bubbles += `<circle cx="${(cell.x * VW).toFixed(2)}" cy="${(cell.y * VH).toFixed(2)}" r="17" fill="#16181d"/>`
  }
  const svgFilled = svg.replace('</svg>', `${bubbles}</svg>`)
  const allIdx: number[] = []
  let ii = svg.indexOf('</svg>')
  while (ii !== -1) { allIdx.push(ii); ii = svg.indexOf('</svg>', ii + 1) }
  console.log('occurrences of </svg> in raw svg:', allIdx.length, allIdx)
  if (allIdx.length > 1) console.log('context first:', JSON.stringify(svg.slice(allIdx[0] - 220, allIdx[0] + 60)))
  const filledIdx = svgFilled.indexOf('<circle cx=')
  console.log('first injected circle at index:', filledIdx, 'total len:', svgFilled.length)
  const layout = getMcColumnLayout(50)
  console.log('layout:', JSON.stringify(layout))

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 })
  await page.setContent(`<!DOCTYPE html><body style="margin:0">${svgFilled}</body>`, { waitUntil: 'load', timeout: 20000 })
  await new Promise((r) => setTimeout(r, 500))
  const shot = await page.screenshot({ type: 'png' })
  writeFileSync(join(process.env.TEMP || '/tmp', 'omr-debug-sheet.png'), shot)
  console.log('screenshot saved', shot.length, 'bytes')

  const px = await page.evaluate(async (dataUrl) => {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data)
  }, `data:image/png;base64,${shot.toString('base64')}`)
  console.log('canvas:', (await page.evaluate(() => ({ iw: window.innerWidth, ih: window.innerHeight }))), 'px len:', px.length)

  const W = 1000
  const H = VH
  const sample = (x: number, y: number, r = 8) => {
    let sum = 0
    let n = 0
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const X = Math.round(x + dx)
        const Y = Math.round(y + dy)
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue
        const i = (Y * W + X) * 4
        sum += (px[i] + px[i + 1] + px[i + 2]) / 3
        n++
      }
    }
    return (sum / n).toFixed(0)
  }
  for (const q of [1, 2, 50]) {
    for (const opt of ['A', 'B', 'C', 'D']) {
      const cell = mcOptionToCell(q, opt as any, 50)
      const d = sample(cell.x * W, cell.y * H)
      console.log(`q${q} ${opt} center=(${(cell.x * W).toFixed(0)},${(cell.y * H).toFixed(0)}) darkness=${d}${fill[q] === opt ? '  <-- FILLED' : ''}`)
    }
  }
  const { detectAnswersFromImage } = await import('../src/lib/omr.js')
  const res = detectAnswersFromImage({ data: new Uint8ClampedArray(px), width: W, height: H } as unknown as ImageData, fill as any, 50, 10)
  console.log('detect:', JSON.stringify({ ok: res.ok, score: res.score, correct: res.rawCorrectCount, reason: res.reason, conf: res.confidence }))
  await browser.close()
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })