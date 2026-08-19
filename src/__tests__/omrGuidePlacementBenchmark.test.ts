import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser, type Page } from 'puppeteer'
import { buildExamPaperHtml } from '../utils/examSheets'
import { detectAnswersFromImage, type OmrMultipleChoiceResult } from '../lib/omr'

type Frame = ImageData

type Mode = {
  id: string
  widthFraction: number
  centerYFraction: number
}

type Perturbation = {
  id: string
  blur: number
  rotation: number
  dx: number
  dy: number
}

let browser: Browser

const modes: Mode[] = [
  { id: 'current_86_center50', widthFraction: 0.86, centerYFraction: 0.50 },
  { id: 'same_86_up42', widthFraction: 0.86, centerYFraction: 0.42 },
  { id: 'slight_88_up42', widthFraction: 0.88, centerYFraction: 0.42 },
  { id: 'edge_90_up42', widthFraction: 0.90, centerYFraction: 0.42 },
]

const perturbations: Perturbation[] = [
  { id: 'clean', blur: 0, rotation: 0, dx: 0, dy: 0 },
  { id: 'blur1', blur: 1, rotation: 0, dx: 0, dy: 0 },
  { id: 'blur2', blur: 2, rotation: 0, dx: 0, dy: 0 },
  { id: 'rot+3', blur: 1, rotation: 3, dx: 0, dy: 0 },
  { id: 'rot-3', blur: 1, rotation: -3, dx: 0, dy: 0 },
  { id: 'rot+5', blur: 1, rotation: 5, dx: 0, dy: 0 },
  { id: 'offset+', blur: 1, rotation: 0, dx: 0.03, dy: 0.03 },
  { id: 'offset-', blur: 1, rotation: 0, dx: -0.03, dy: -0.03 },
]

function imageData(width: number, height: number, data: Uint8ClampedArray): Frame {
  return { width, height, data, colorSpace: 'srgb' } as ImageData
}

async function screenshotToFrame(page: Page, png: Uint8Array): Promise<Frame> {
  const source = Buffer.from(png).toString('base64')
  const out = await page.evaluate(async base64 => {
    const img = new Image()
    img.src = `data:image/png;base64,${base64}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let binary = ''
    for (let i = 0; i < pixels.data.length; i += 0x8000) {
      binary += String.fromCharCode(...pixels.data.subarray(i, i + 0x8000))
    }
    return { width: pixels.width, height: pixels.height, data: btoa(binary) }
  }, source)
  return imageData(out.width, out.height, new Uint8ClampedArray(Buffer.from(out.data, 'base64')))
}

async function renderStrip(page: Page, questionCount: number): Promise<Frame> {
  await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 1 })
  await page.setContent(buildExamPaperHtml({
    subject: 'Placement benchmark', classLabel: 'TN2', academicYear: '2026-2027', includeAnswerGrid: true,
    questions: Array.from({ length: questionCount }, (_, i) => ({
      index: i + 1,
      question: `Q${i + 1}`,
      options: { A: 'A', B: 'B', C: 'C', D: 'D' },
      correctOption: 'A' as const,
    })),
  }), { waitUntil: 'load' })
  await page.evaluate(() => {
    document.querySelectorAll('.grid-q-row').forEach(row => row.querySelector('.bubble')?.classList.add('bubble-filled'))
  })
  const rect = await page.$eval('.omr-frame', el => {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  })
  const pad = 16
  const png = await page.screenshot({ type: 'png', clip: {
    x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad),
    width: Math.min(800 - Math.max(0, rect.x - pad), rect.width + pad * 2),
    height: Math.min(1131 - Math.max(0, rect.y - pad), rect.height + pad * 2),
  } })
  return screenshotToFrame(page, png)
}

function blur(source: Frame, radius: number): Frame {
  if (!radius) return source
  const out = new Uint8ClampedArray(source.data.length)
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const off = (y * source.width + x) * 4
      for (let c = 0; c < 3; c++) {
        let sum = 0, count = 0
        for (let yy = -radius; yy <= radius; yy++) {
          for (let xx = -radius; xx <= radius; xx++) {
            const sx = Math.max(0, Math.min(source.width - 1, x + xx))
            const sy = Math.max(0, Math.min(source.height - 1, y + yy))
            sum += source.data[(sy * source.width + sx) * 4 + c]
            count++
          }
        }
        out[off + c] = Math.round(sum / count)
      }
      out[off + 3] = 255
    }
  }
  return imageData(source.width, source.height, out)
}

function sample(source: Frame, x: number, y: number, c: number): number {
  const x0 = Math.max(0, Math.min(source.width - 1, Math.floor(x)))
  const y0 = Math.max(0, Math.min(source.height - 1, Math.floor(y)))
  const x1 = Math.min(source.width - 1, x0 + 1), y1 = Math.min(source.height - 1, y0 + 1)
  const tx = x - x0, ty = y - y0
  const a = source.data[(y0 * source.width + x0) * 4 + c]
  const b = source.data[(y0 * source.width + x1) * 4 + c]
  const d = source.data[(y1 * source.width + x0) * 4 + c]
  const e = source.data[(y1 * source.width + x1) * 4 + c]
  return (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty
}

function place(source: Frame, mode: Mode, p: Perturbation): Frame {
  const width = 810, height = 1080
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 205; data[i * 4 + 1] = 201; data[i * 4 + 2] = 192; data[i * 4 + 3] = 255
  }
  const targetW = width * mode.widthFraction
  const scale = targetW / source.width
  const targetH = source.height * scale
  const cx = width * (0.5 + p.dx)
  const cy = height * (mode.centerYFraction + p.dy)
  const rad = p.rotation * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad)
  const boundW = Math.abs(targetW * cos) / 2 + Math.abs(targetH * sin) / 2 + 3
  const boundH = Math.abs(targetW * sin) / 2 + Math.abs(targetH * cos) / 2 + 3
  for (let y = Math.max(0, Math.floor(cy - boundH)); y <= Math.min(height - 1, Math.ceil(cy + boundH)); y++) {
    for (let x = Math.max(0, Math.floor(cx - boundW)); x <= Math.min(width - 1, Math.ceil(cx + boundW)); x++) {
      const dx = x - cx, dy = y - cy
      const sx = (cos * dx + sin * dy) / scale + source.width / 2
      const sy = (-sin * dx + cos * dy) / scale + source.height / 2
      if (sx < 0 || sy < 0 || sx > source.width - 1 || sy > source.height - 1) continue
      const off = (y * width + x) * 4
      data[off] = Math.round(sample(source, sx, sy, 0))
      data[off + 1] = Math.round(sample(source, sx, sy, 1))
      data[off + 2] = Math.round(sample(source, sx, sy, 2))
      data[off + 3] = 255
    }
  }
  return imageData(width, height, data)
}

describe('experiment — integrated guide vertical placement', () => {
  beforeAll(async () => { browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], timeout: 30_000 }) })
  afterAll(async () => { await browser?.close() })

  it('compares centered and upward guide placement', async () => {
    const page = await browser.newPage()
    const result: Array<{ mode: string; questionCount: number; exactRate: number; okRate: number; avgConfidence: number; failures: string[] }> = []
    for (const questionCount of [20, 50]) {
      const original = await renderStrip(page, questionCount)
      const blurred = new Map<number, Frame>()
      for (const radius of new Set(perturbations.map(p => p.blur))) blurred.set(radius, blur(original, radius))
      const answerKey = Object.fromEntries(Array.from({ length: questionCount }, (_, i) => [i + 1, 'A'])) as Record<number, 'A'>
      for (const mode of modes) {
        const rows: Array<{ exact: boolean; ok: boolean; confidence: number; reason: string; id: string }> = []
        for (const p of perturbations) {
          const frame = place(blurred.get(p.blur)!, mode, p)
          const omr = detectAnswersFromImage(frame, answerKey, questionCount, 10, 'integrated') as OmrMultipleChoiceResult
          const exact = Boolean(omr.ok && omr.score === 10 && omr.questions.length === questionCount && omr.questions.every(q => q.selectedAnswer === 'A'))
          rows.push({ exact, ok: omr.ok, confidence: omr.confidence, reason: omr.reason, id: p.id })
        }
        result.push({
          mode: mode.id,
          questionCount,
          exactRate: rows.filter(r => r.exact).length / rows.length,
          okRate: rows.filter(r => r.ok).length / rows.length,
          avgConfidence: rows.reduce((s, r) => s + r.confidence, 0) / rows.length,
          failures: rows.filter(r => !r.exact).map(r => `${r.id}:${r.reason}`),
        })
      }
    }
    await page.close()
    console.log(`OMR_GUIDE_PLACEMENT_BENCHMARK=${JSON.stringify(result)}`)
    expect(result).toHaveLength(modes.length * 2)
  }, 120_000)
})
