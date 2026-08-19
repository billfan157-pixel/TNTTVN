import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser, type Page } from 'puppeteer'
import { buildExamPaperHtml } from '../utils/examSheets'
import { detectAnswersFromImage, type OmrMultipleChoiceResult } from '../lib/omr'
import { assessScanQuality } from '../lib/scanQuality'
import { decideScanAcceptance } from '../lib/scanAcceptancePolicy'

type Frame = ImageData

type Mode = {
  id: 'portrait_current' | 'portrait_max' | 'landscape_wide'
  frameWidth: number
  frameHeight: number
  omrWidthFraction: number
}

type Perturbation = {
  id: string
  blurRadius: number
  rotationDeg: number
  offsetX: number
  offsetY: number
}

type SampleResult = {
  mode: Mode['id']
  questionCount: number
  perturbation: string
  markerAndScoreExact: boolean
  acceptance: 'accepted' | 'review_required' | 'rejected'
  reason: string
  confidence: number
  durationMs: number
  omrPixelWidth: number
  omrPixelHeight: number
}

let browser: Browser

const modes: Mode[] = [
  // Effective current guide width on a ~375 CSS-px phone:
  // (viewport - p-3 left/right) * 92% ≈ 86% of the video width.
  { id: 'portrait_current', frameWidth: 810, frameHeight: 1080, omrWidthFraction: 0.86 },
  // Near-edge portrait proposal: reduced guide padding + ~98% guide width.
  { id: 'portrait_max', frameWidth: 810, frameHeight: 1080, omrWidthFraction: 0.96 },
  // 4:3 landscape processing crop, still capped by production's 1280px target width.
  { id: 'landscape_wide', frameWidth: 1280, frameHeight: 960, omrWidthFraction: 0.90 },
]

const perturbations: Perturbation[] = [
  { id: 'clean', blurRadius: 0, rotationDeg: 0, offsetX: 0, offsetY: 0 },
  { id: 'blur1', blurRadius: 1, rotationDeg: 0, offsetX: 0, offsetY: 0 },
  { id: 'blur2', blurRadius: 2, rotationDeg: 0, offsetX: 0, offsetY: 0 },
  { id: 'rot+3', blurRadius: 1, rotationDeg: 3, offsetX: 0, offsetY: 0 },
  { id: 'rot-3', blurRadius: 1, rotationDeg: -3, offsetX: 0, offsetY: 0 },
  { id: 'rot+5', blurRadius: 1, rotationDeg: 5, offsetX: 0, offsetY: 0 },
  { id: 'offset+', blurRadius: 1, rotationDeg: 0, offsetX: 0.05, offsetY: 0.07 },
  { id: 'offset-', blurRadius: 1, rotationDeg: 0, offsetX: -0.05, offsetY: -0.07 },
]

function asImageData(width: number, height: number, data: Uint8ClampedArray): ImageData {
  return { width, height, data, colorSpace: 'srgb' } as ImageData
}

async function pngToImageData(page: Page, png: Uint8Array): Promise<Frame> {
  const rgbaBase64 = Buffer.from(png).toString('base64')
  const serialized = await page.evaluate(async (source): Promise<{ width: number; height: number; rgba: string }> => {
    const img = new Image()
    img.src = `data:image/png;base64,${source}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0)
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let binary = ''
    const chunkSize = 0x8000
    for (let offset = 0; offset < frame.data.length; offset += chunkSize) {
      binary += String.fromCharCode(...frame.data.subarray(offset, offset + chunkSize))
    }
    return { width: frame.width, height: frame.height, rgba: btoa(binary) }
  }, rgbaBase64)
  return asImageData(serialized.width, serialized.height, new Uint8ClampedArray(Buffer.from(serialized.rgba, 'base64')))
}

async function renderFilledIntegratedOmr(page: Page, questionCount: number): Promise<Frame> {
  await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 1 })
  await page.setContent(buildExamPaperHtml({
    subject: 'Benchmark scale OMR',
    classLabel: 'TN 2A',
    academicYear: '2026-2027',
    includeAnswerGrid: true,
    questions: Array.from({ length: questionCount }, (_, index) => ({
      index: index + 1,
      question: `Câu ${index + 1}`,
      options: { A: 'A', B: 'B', C: 'C', D: 'D' },
      correctOption: 'A' as const,
    })),
  }), { waitUntil: 'load' })

  await page.evaluate(() => {
    for (const row of Array.from(document.querySelectorAll('.grid-q-row'))) {
      row.querySelector('.bubble')?.classList.add('bubble-filled')
    }
  })

  const rect = await page.$eval('.omr-frame', element => {
    const r = element.getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  })
  const pad = 16
  const clip = {
    x: Math.max(0, rect.x - pad),
    y: Math.max(0, rect.y - pad),
    width: Math.min(800 - Math.max(0, rect.x - pad), rect.width + pad * 2),
    height: Math.min(1131 - Math.max(0, rect.y - pad), rect.height + pad * 2),
  }
  const png = await page.screenshot({ type: 'png', clip })
  return pngToImageData(page, png)
}

function blurSource(source: Frame, radius: number): Frame {
  if (radius <= 0) return source
  const { width, height, data } = source
  const tmp = new Uint8ClampedArray(data.length)
  const out = new Uint8ClampedArray(data.length)
  const span = radius * 2 + 1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0
        let count = 0
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.max(0, Math.min(width - 1, x + dx))
          sum += data[(y * width + sx) * 4 + c]
          count++
        }
        tmp[(y * width + x) * 4 + c] = Math.round(sum / count)
      }
      tmp[(y * width + x) * 4 + 3] = 255
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (let dy = -radius; dy <= radius; dy++) {
          const sy = Math.max(0, Math.min(height - 1, y + dy))
          sum += tmp[(sy * width + x) * 4 + c]
        }
        out[(y * width + x) * 4 + c] = Math.round(sum / span)
      }
      out[(y * width + x) * 4 + 3] = 255
    }
  }
  return asImageData(width, height, out)
}

function bilinear(source: Frame, x: number, y: number, channel: number): number {
  const x0 = Math.max(0, Math.min(source.width - 1, Math.floor(x)))
  const y0 = Math.max(0, Math.min(source.height - 1, Math.floor(y)))
  const x1 = Math.min(source.width - 1, x0 + 1)
  const y1 = Math.min(source.height - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const a = source.data[(y0 * source.width + x0) * 4 + channel]
  const b = source.data[(y0 * source.width + x1) * 4 + channel]
  const c = source.data[(y1 * source.width + x0) * 4 + channel]
  const d = source.data[(y1 * source.width + x1) * 4 + channel]
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

function composeCameraFrame(source: Frame, mode: Mode, perturbation: Perturbation): { frame: Frame; omrWidth: number; omrHeight: number } {
  const width = mode.frameWidth
  const height = mode.frameHeight
  const data = new Uint8ClampedArray(width * height * 4)
  // Light neutral desk/background; isolate geometric scale rather than low-light rejection.
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 205
    data[i * 4 + 1] = 201
    data[i * 4 + 2] = 192
    data[i * 4 + 3] = 255
  }

  const targetWidth = Math.round(width * mode.omrWidthFraction)
  const scale = targetWidth / source.width
  const targetHeight = source.height * scale
  const cx = width * (0.5 + perturbation.offsetX)
  const cy = height * (0.5 + perturbation.offsetY)
  const radians = perturbation.rotationDeg * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const halfBoundW = Math.abs(targetWidth * cos) / 2 + Math.abs(targetHeight * sin) / 2 + 2
  const halfBoundH = Math.abs(targetWidth * sin) / 2 + Math.abs(targetHeight * cos) / 2 + 2
  const xMin = Math.max(0, Math.floor(cx - halfBoundW))
  const xMax = Math.min(width - 1, Math.ceil(cx + halfBoundW))
  const yMin = Math.max(0, Math.floor(cy - halfBoundH))
  const yMax = Math.min(height - 1, Math.ceil(cy + halfBoundH))

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const dx = x - cx
      const dy = y - cy
      const ux = (cos * dx + sin * dy) / scale + source.width / 2
      const uy = (-sin * dx + cos * dy) / scale + source.height / 2
      if (ux < 0 || uy < 0 || ux > source.width - 1 || uy > source.height - 1) continue
      const off = (y * width + x) * 4
      data[off] = Math.round(bilinear(source, ux, uy, 0))
      data[off + 1] = Math.round(bilinear(source, ux, uy, 1))
      data[off + 2] = Math.round(bilinear(source, ux, uy, 2))
      data[off + 3] = 255
    }
  }

  return { frame: asImageData(width, height, data), omrWidth: targetWidth, omrHeight: Math.round(targetHeight) }
}

function summarize(samples: SampleResult[]) {
  return modes.flatMap(mode => [20, 50].map(questionCount => {
    const rows = samples.filter(sample => sample.mode === mode.id && sample.questionCount === questionCount)
    const exact = rows.filter(row => row.markerAndScoreExact).length
    const accepted = rows.filter(row => row.markerAndScoreExact && row.acceptance === 'accepted').length
    const review = rows.filter(row => row.acceptance === 'review_required').length
    const rejected = rows.filter(row => row.acceptance === 'rejected').length
    return {
      mode: mode.id,
      questionCount,
      samples: rows.length,
      exactRate: exact / rows.length,
      autoAcceptRate: accepted / rows.length,
      reviewRate: review / rows.length,
      rejectRate: rejected / rows.length,
      avgConfidence: rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length,
      avgDurationMs: rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length,
      omrPixelWidth: rows[0]?.omrPixelWidth,
      omrPixelHeight: rows[0]?.omrPixelHeight,
      failures: rows.filter(row => !row.markerAndScoreExact || row.acceptance !== 'accepted').map(row => `${row.perturbation}:${row.reason}`),
    }
  }))
}

describe('experiment — integrated OMR guide scale vs scan robustness', () => {
  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], timeout: 30_000 })
  })

  afterAll(async () => {
    await browser?.close()
  })

  it('benchmarks current portrait, enlarged portrait, and wide landscape guidance', async () => {
    const page = await browser.newPage()
    const samples: SampleResult[] = []

    for (const questionCount of [20, 50]) {
      const base = await renderFilledIntegratedOmr(page, questionCount)
      const blurred = new Map<number, Frame>()
      for (const radius of new Set(perturbations.map(item => item.blurRadius))) {
        blurred.set(radius, blurSource(base, radius))
      }
      const answerKey = Object.fromEntries(Array.from({ length: questionCount }, (_, index) => [index + 1, 'A'])) as Record<number, 'A'>

      for (const mode of modes) {
        for (const perturbation of perturbations) {
          const source = blurred.get(perturbation.blurRadius)!
          const { frame, omrWidth, omrHeight } = composeCameraFrame(source, mode, perturbation)
          const startedAt = performance.now()
          const omr = detectAnswersFromImage(frame, answerKey, questionCount, 10, 'integrated') as OmrMultipleChoiceResult
          const durationMs = performance.now() - startedAt
          const quality = assessScanQuality(frame)
          const acceptance = decideScanAcceptance(omr, quality)
          const exact = Boolean(
            omr.ok
            && omr.score === 10
            && omr.questions?.length === questionCount
            && omr.questions.every(question => question.selectedAnswer === 'A'),
          )
          samples.push({
            mode: mode.id,
            questionCount,
            perturbation: perturbation.id,
            markerAndScoreExact: exact,
            acceptance: acceptance.status,
            reason: exact ? acceptance.reason : omr.reason,
            confidence: omr.confidence,
            durationMs,
            omrPixelWidth: omrWidth,
            omrPixelHeight: omrHeight,
          })
        }
      }
    }
    await page.close()

    const summary = summarize(samples)
    console.log(`OMR_GUIDE_SCALE_BENCHMARK=${JSON.stringify(summary)}`)
    expect(summary).toHaveLength(6)
    expect(samples).toHaveLength(modes.length * perturbations.length * 2)
  }, 120_000)
})
