import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser } from 'puppeteer'
import { buildBatchExamPapersHtml, buildExamPaperHtml } from '../utils/examSheets'
import { prepareExamDocumentForOutput } from '../lib/examPrintSafety'
import { integratedMcOptionToCellForRect } from '../lib/answerSheetTemplate'

let browser: Browser

const boundaryQuestionCounts = [1, 8, 9, 18, 19, 20, 21, 30, 31, 49, 50]

function questions(total: number) {
  return Array.from({ length: total }, (_, index) => ({
    index: index + 1,
    question: `Câu kiểm thử ${index + 1}`,
    options: { A: 'A', B: 'B', C: 'C', D: 'D' },
    correctOption: 'A' as const,
  }))
}

describe('OMR print-media geometry — renderer → safety gate → Chromium print CSS', () => {
  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  })

  afterAll(async () => {
    await browser?.close()
  })

  it.each(boundaryQuestionCounts)(
    'mọi bubble giữ đúng tọa độ detector qua print media (%i câu)',
    async totalQuestions => {
      const html = prepareExamDocumentForOutput(buildExamPaperHtml({
        subject: 'Print geometry regression',
        classLabel: 'Thiếu Nhi 2A',
        academicYear: '2026-2027',
        includeAnswerGrid: true,
        questions: questions(totalQuestions),
      }))

      const page = await browser.newPage()
      await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 1 })
      await page.emulateMediaType('print')
      await page.setContent(html, { waitUntil: 'load' })

      const measured = await page.evaluate(() => {
        const center = (element: Element) => {
          const rect = element.getBoundingClientRect()
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        }
        const markers = ['tl', 'tr', 'br', 'bl'].map(id => center(document.querySelector(`.omr-marker-${id}`)!))
        const rows = Array.from(document.querySelectorAll('.grid-q-row'))
        const bubbles = rows.map(row => Array.from(row.querySelectorAll('.bubble')).map(center))
        return { width: innerWidth, height: innerHeight, markers, bubbles }
      })

      expect(measured.markers).toHaveLength(4)
      expect(measured.bubbles).toHaveLength(totalQuestions)
      expect(measured.bubbles.every(row => row.length === 4)).toBe(true)

      const [tl, tr, , bl] = measured.markers
      const frame = {
        x0: tl.x / measured.width,
        y0: tl.y / measured.height,
        x1: tr.x / measured.width,
        y1: bl.y / measured.height,
      }
      const options = ['A', 'B', 'C', 'D'] as const

      for (let q = 1; q <= totalQuestions; q++) {
        for (let optionIndex = 0; optionIndex < options.length; optionIndex++) {
          const expected = integratedMcOptionToCellForRect(q, options[optionIndex], totalQuestions, frame)
          const actual = measured.bubbles[q - 1][optionIndex]
          expect(Math.abs(expected.x * measured.width - actual.x), `Q${q}${options[optionIndex]} X`).toBeLessThanOrEqual(2)
          expect(Math.abs(expected.y * measured.height - actual.y), `Q${q}${options[optionIndex]} Y`).toBeLessThanOrEqual(2)
        }
      }

      // Exercise Chromium's actual print/PDF layout path as a smoke test. Geometry
      // is asserted above under print media; this additionally catches page CSS/PDF failures.
      const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })
      expect(pdf.byteLength).toBeGreaterThan(5_000)
      await page.close()
    },
    30_000,
  )

  it('batch print keeps integrated marker ink at least 6mm from both A4 side edges', async () => {
    const html = prepareExamDocumentForOutput(buildBatchExamPapersHtml([
      { id: 'ST-12345678', code: 'TN-001', name: 'Nguyễn Văn A' },
      { id: 'ST-87654321', code: 'TN-002', name: 'Trần Văn B' },
    ], {
      subject: 'Batch safe margin',
      classLabel: 'Thiếu Nhi 2A',
      academicYear: '2026-2027',
      sessionId: 'EXS-ABCDEF12',
      includeAnswerGrid: true,
      questions: questions(50),
    }))

    expect(html).toContain('data-omr-batch-safe-margin')

    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 1131, deviceScaleFactor: 1 })
    await page.emulateMediaType('print')
    await page.setContent(html, { waitUntil: 'load' })

    const margins = await page.evaluate(() => {
      const pageRect = document.querySelector('.batch-exam-page')!.getBoundingClientRect()
      const leftMarker = document.querySelector('.batch-exam-page .omr-marker-tl')!.getBoundingClientRect()
      const rightMarker = document.querySelector('.batch-exam-page .omr-marker-tr')!.getBoundingClientRect()
      return {
        pageWidth: pageRect.width,
        left: leftMarker.left - pageRect.left,
        right: pageRect.right - rightMarker.right,
      }
    })

    const sixMmOfA4 = margins.pageWidth * (6 / 210)
    expect(margins.left).toBeGreaterThanOrEqual(sixMmOfA4)
    expect(margins.right).toBeGreaterThanOrEqual(sixMmOfA4)
    await page.close()
  }, 20_000)

  it('teacher answer key becomes machine-invalid before print/PDF output', async () => {
    const html = prepareExamDocumentForOutput(buildExamPaperHtml({
      subject: 'Đáp án',
      classLabel: 'Thiếu Nhi 2A',
      academicYear: '2026-2027',
      showAnswerKey: true,
      includeAnswerGrid: true,
      questions: questions(20),
    }))

    expect(html).toContain('ĐÁP ÁN GLV — KHÔNG CHẤM')
    expect(html).not.toContain('omr-corner-marker')

    const page = await browser.newPage()
    await page.emulateMediaType('print')
    await page.setContent(html, { waitUntil: 'load' })
    expect(await page.$$eval('.omr-corner-marker', elements => elements.length)).toBe(0)
    expect(await page.$$eval('.bubble-correct', elements => elements.length)).toBe(20)
    await page.close()
  }, 20_000)
})
