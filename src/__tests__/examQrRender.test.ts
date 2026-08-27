import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import puppeteer, { type Browser, type Page } from 'puppeteer'
import { buildExamPaperHtml, buildSingleAnswerSheetSvgString } from '../utils/examSheets'
import { buildExamQrPayload } from '../lib/qr'
import { scanExamCode } from '../lib/examCodeScanner'
import { getObjectCoverSourceRect } from '../lib/cameraFrame'
import { detectAnswersFromImage } from '../lib/omr'
import { integratedMcOptionToCellForRect } from '../lib/answerSheetTemplate'

let browser: Browser

type SerializedPixels = { width: number; height: number; rgbaBase64: string }

function serializedPixelsToImageData(pixels: SerializedPixels): ImageData {
  const rgba = Buffer.from(pixels.rgbaBase64, 'base64')
  return {
    width: pixels.width,
    height: pixels.height,
    data: new Uint8ClampedArray(rgba),
    colorSpace: 'srgb',
  } as ImageData
}

async function pngImageData(page: Page, png: Uint8Array): Promise<ImageData> {
  const pixels = await page.evaluate(async (dataUrl): Promise<SerializedPixels> => {
    const img = new Image()
    img.src = dataUrl
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
    return { width: frame.width, height: frame.height, rgbaBase64: btoa(binary) }
  }, `data:image/png;base64,${Buffer.from(png).toString('base64')}`)
  return serializedPixelsToImageData(pixels)
}

async function elementImageData(page: Page, selector: string): Promise<ImageData> {
  const element = await page.$(selector)
  if (!element) throw new Error(`Missing element: ${selector}`)
  return pngImageData(page, await element.screenshot({ type: 'png' }))
}

async function cameraFrameFromPage(page: Page, blurPx = 0): Promise<ImageData> {
  const pagePng = await page.screenshot({ type: 'png' })
  const dataUrl = `data:image/png;base64,${Buffer.from(pagePng).toString('base64')}`
  const pixels = await page.evaluate(async ({ source, blurPx }): Promise<SerializedPixels> => {
    const img = new Image()
    img.src = source
    await img.decode()
    // Sensor iPhone trả 1920×1080 landscape. Production crop đúng vùng 3:4
    // đang hiển thị bởi object-cover: 810×1080 ở chính giữa sensor.
    const raw = document.createElement('canvas')
    raw.width = 1920
    raw.height = 1080
    const rawCtx = raw.getContext('2d')!
    rawCtx.fillStyle = '#8b7355'
    rawCtx.fillRect(0, 0, raw.width, raw.height)
    const paperH = 1000
    const paperW = Math.round(paperH * 210 / 297)
    const x = Math.round((raw.width - paperW) / 2)
    const y = Math.round((raw.height - paperH) / 2)
    rawCtx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none'
    rawCtx.drawImage(img, x, y, paperW, paperH)
    rawCtx.filter = 'none'
    const canvas = document.createElement('canvas')
    canvas.width = 810
    canvas.height = 1080
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(raw, (raw.width - canvas.width) / 2, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height)
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let binary = ''
    const chunkSize = 0x8000
    for (let offset = 0; offset < frame.data.length; offset += chunkSize) {
      binary += String.fromCharCode(...frame.data.subarray(offset, offset + chunkSize))
    }
    return { width: frame.width, height: frame.height, rgbaBase64: btoa(binary) }
  }, { source: dataUrl, blurPx })
  return serializedPixelsToImageData(pixels)
}

describe('QR render thật — printer → Chromium bitmap → jsQR', () => {
  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  })

  afterAll(async () => {
    await browser?.close()
  }, 60_000)

  it('camera landscape 1920×1080 chỉ quét crop portrait 810×1080 user nhìn thấy', () => {
    expect(getObjectCoverSourceRect(1920, 1080, 3, 4)).toEqual({
      sx: 555,
      sy: 0,
      sw: 810,
      sh: 1080,
    })
  })

  it.each([10, 20, 50])('tọa độ detector khớp tâm bubble trên bản in Chromium (%i câu)', async totalQuestions => {
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 1 })
    await page.setContent(buildExamPaperHtml({
      subject: 'Đo hình học OMR',
      classLabel: 'Thiếu Nhi 2A',
      academicYear: '2026-2027',
      includeAnswerGrid: true,
      questions: Array.from({ length: totalQuestions }, (_, index) => ({
        index: index + 1,
        question: `Câu ${index + 1}`,
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        correctOption: 'A' as const,
      })),
    }), { waitUntil: 'load' })

    const measured = await page.evaluate((lastIndex) => {
      const center = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      }
      const rows = Array.from(document.querySelectorAll('.grid-q-row'))
      return {
        width: innerWidth,
        height: innerHeight,
        markers: ['tl', 'tr', 'br', 'bl'].map(id => center(document.querySelector(`.omr-marker-${id}`)!)),
        firstA: center(rows[0].querySelectorAll('.bubble')[0]),
        lastD: center(rows[lastIndex].querySelectorAll('.bubble')[3]),
      }
    }, totalQuestions - 1)
    await page.close()

    const [tl, tr, , bl] = measured.markers
    const frame = {
      x0: tl.x / measured.width,
      y0: tl.y / measured.height,
      x1: tr.x / measured.width,
      y1: bl.y / measured.height,
    }
    const expected = [
      { cell: integratedMcOptionToCellForRect(1, 'A', totalQuestions, frame, (frame.x1 - frame.x0) * measured.width), actual: measured.firstA },
      { cell: integratedMcOptionToCellForRect(totalQuestions, 'D', totalQuestions, frame, (frame.x1 - frame.x0) * measured.width), actual: measured.lastD },
    ]
    const errors = expected.map(({ cell, actual }) => ({
      x: cell.x * measured.width - actual.x,
      y: cell.y * measured.height - actual.y,
    }))
    for (const error of errors) {
      expect(Math.abs(error.x), `Sai lệch X ${JSON.stringify(errors)}`).toBeLessThanOrEqual(2)
      expect(Math.abs(error.y), `Sai lệch Y ${JSON.stringify(errors)}`).toBeLessThanOrEqual(2)
    }
  }, 20_000)

  it('đề thi tích hợp render QR đầy đủ, giải mã đúng payload', async () => {
    const sessionId = 'EXS-a1b2c3d4'
    const student = { id: 'ST-11223344', code: 'TN001', name: 'Em Test' }
    const html = buildExamPaperHtml({
      subject: 'Giáo Lý',
      classLabel: 'Thiếu Nhi 2A',
      academicYear: '2026-2027',
      sessionId,
      student,
      questions: [{
        index: 1,
        question: 'Câu hỏi kiểm thử',
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        correctOption: 'A',
      }],
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'load' })
    expect(await page.$eval('.qr-box', element => ({
      width: Math.round(element.getBoundingClientRect().width),
      height: Math.round(element.getBoundingClientRect().height),
    }))).toEqual({ width: 120, height: 120 })
    const frame = await elementImageData(page, '.qr-box')
    await page.close()

    const decoded = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' })
    expect(decoded?.data).toBe(buildExamQrPayload(sessionId, student.id, { templateMode: 'integrated', questionCount: 1, examVersion: 'A' }))
  })

  it('phiếu trả lời rời render QR đầy đủ, giải mã đúng payload', async () => {
    const sessionId = 'EXS-b2c3d4e5'
    const student = { id: 'ST-55667788', code: 'TN002', name: 'Em Test 2' }
    const svg = buildSingleAnswerSheetSvgString(student, {
      sessionId,
      subject: 'Giáo Lý',
      scoreTypeLabel: '15 phút',
      classLabel: 'Thiếu Nhi 2A',
      maxScore: 10,
      examType: 'multiple_choice',
      questionCount: 20,
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 1000, height: 1414, deviceScaleFactor: 2 })
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`, { waitUntil: 'load' })
    const frame = await elementImageData(page, 'svg > svg')
    await page.close()

    const decoded = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' })
    expect(decoded?.data).toBe(buildExamQrPayload(sessionId, student.id, { templateMode: 'full_page', questionCount: 20, examVersion: 'A' }))
  }, 20_000)

  it('pipeline production đọc QR từ toàn frame camera landscape có tờ A4 portrait ở giữa', async () => {
    const sessionId = 'EXS-c3d4e5f6'
    const student = { id: 'ST-99aabbcc', code: 'TN003', name: 'Em Test 3' }
    const html = buildExamPaperHtml({
      subject: 'Giáo Lý',
      classLabel: 'Thiếu Nhi 2A',
      academicYear: '2026-2027',
      sessionId,
      student,
      questions: Array.from({ length: 50 }, (_, index) => ({
        index: index + 1,
        question: `Câu hỏi kiểm thử camera ${index + 1}`,
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        correctOption: 'A',
      })),
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => {
      document.querySelector('.questions-wrapper')?.remove()
      document.body.style.minHeight = '1131px'
      for (const row of Array.from(document.querySelectorAll('.grid-q-row'))) {
        const filledBubble = row.querySelector('.bubble')
        filledBubble?.classList.add('bubble-filled')
        if (filledBubble) filledBubble.textContent = ''
      }
    })
    const frame = await cameraFrameFromPage(page)
    await page.close()

    const result = scanExamCode(frame, 'live_fast')
    expect(result.source).toBe('qr')
    expect(result.payload).toMatchObject({
      sessionId,
      studentId: student.id,
      protocolVersion: 3,
      examVersion: 'A',
      templateMode: 'integrated',
      questionCount: 50,
    })
    const answerKey = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, 'A'])) as Record<number, 'A'>
    const omr = detectAnswersFromImage(frame, answerKey, 50, 10)
    expect(omr.ok, omr.reason).toBe(true)
    expect(omr.score).toBe(10)
  }, 20_000)

  it('đọc được QR production ID khi camera bị mất nét nhẹ', async () => {
    const sessionId = 'EXS-7e8f7985'
    const student = { id: 'ST-12345678', code: 'TN004', name: 'Em Test 4' }
    const html = buildExamPaperHtml({
      subject: 'Kiểm tra Giáo Lý & Phụng Vụ',
      classLabel: 'Thiếu Nhi 2A',
      academicYear: '2026-2027',
      sessionId,
      student,
      questions: [{ index: 1, question: 'Câu hỏi', options: { A: 'A', B: 'B', C: 'C', D: 'D' }, correctOption: 'A' }],
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    const frame = await cameraFrameFromPage(page, 1.1)
    await page.close()

    expect(scanExamCode(frame, 'live_recovery').payload).toMatchObject({
      sessionId,
      studentId: student.id,
      protocolVersion: 3,
      examVersion: 'A',
      templateMode: 'integrated',
      questionCount: 1,
    })
  }, 20_000)

  it('đọc được QR compact không-OMR khi camera bị mất nét nhẹ', async () => {
    const sessionId = 'EXS-7e8f798z'
    const student = { id: 'ST-12345678', code: 'TN005', name: 'Em Test 5' }
    const html = buildExamPaperHtml({
      subject: 'Kiểm tra Giáo Lý & Phụng Vụ',
      classLabel: 'Thiếu Nhi 2A',
      academicYear: '2026-2027',
      sessionId,
      student,
      includeAnswerGrid: false,
      questions: [{ index: 1, question: 'Câu hỏi', options: { A: 'A', B: 'B', C: 'C', D: 'D' }, correctOption: 'A' }],
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    const frame = await cameraFrameFromPage(page, 1.1)
    await page.close()

    expect(scanExamCode(frame, 'live_recovery').payload).toEqual({ sessionId, studentId: student.id })
  }, 20_000)
})
