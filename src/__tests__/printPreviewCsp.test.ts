import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildExamPaperHtml,
  buildBatchExamPapersHtml,
  buildBatchAnswerSheetsHtml,
  buildQrSheetHtml,
} from '../utils/examSheets'
import { buildReceiptHtml } from '../utils/receiptGenerator'
import { prepareExamDocumentForOutput } from '../lib/examPrintSafety'
import { withPreviewStylesheet, stylesheetHref } from '../utils/printPreviewCss'
import type { ExamQuestion } from '../types'

// CSP-SRCDOC-PREVIEW (2026-09-08): production áp `style-src 'self'` (không
// 'unsafe-inline') nên `<style>` inline trong iframe `srcDoc` preview bị chặn
// (verified bằng Chromium thật) → mỗi tài liệu in phải có thêm `<link>` tới
// file CSS tĩnh cùng origin. File trong `public/` là mirror của khối `<style>`
// builders sinh ra. Tái sinh sau khi sửa CSS trong builder:
//   PowerShell:  $env:SYNC_PRINT_CSS='1'; npx vitest run src/__tests__/printPreviewCsp.test.ts --no-coverage
//   bash:        SYNC_PRINT_CSS=1 npx vitest run src/__tests__/printPreviewCsp.test.ts --no-coverage

const SYNC_ENV = 'SYNC_PRINT_CSS'

function canonicalQuestions(): ExamQuestion[] {
  return [1, 2].map(i => ({
    index: i,
    question: `Câu hỏi đồng bộ CSS ${i}?`,
    options: { A: 'A', B: 'B', C: 'C', D: 'D' },
    correctOption: 'A' as const,
  }))
}

const SYNC_STUDENTS = [{ id: 'SYNC-1', code: 'TN001', name: 'Đồng Bộ CSS' }]

function syncSingleOptions() {
  return {
    subject: 'Đồng Bộ',
    classLabel: 'Lớp Đồng Bộ',
    academicYear: '2026-2027',
    questions: canonicalQuestions(),
  }
}

interface SyncDoc {
  file: string
  label: string
  html: string
}

function buildSyncDocs(): SyncDoc[] {
  const singleOptions = syncSingleOptions()
  return [
    {
      file: 'print-exam-single.css',
      label: 'Đề thi đơn (buildExamPaperHtml)',
      html: prepareExamDocumentForOutput(buildExamPaperHtml({ ...singleOptions })),
    },
    {
      file: 'print-exam-batch.css',
      label: 'Đề thi hàng loạt (buildBatchExamPapersHtml)',
      html: prepareExamDocumentForOutput(buildBatchExamPapersHtml(SYNC_STUDENTS, { ...singleOptions })),
    },
    {
      file: 'print-answer-sheet.css',
      label: 'Phiếu trả lời rời (buildBatchAnswerSheetsHtml)',
      html: prepareExamDocumentForOutput(
        buildBatchAnswerSheetsHtml(SYNC_STUDENTS, {
          sessionId: 'SYNC',
          subject: 'Đồng Bộ',
          scoreTypeLabel: 'Kiểm Tra',
          classLabel: 'Lớp Đồng Bộ',
          maxScore: 10,
          examType: 'multiple_choice',
          questionCount: 2,
        }),
      ),
    },
    {
      file: 'print-qr-sheet.css',
      label: 'Thẻ mã QR (buildQrSheetHtml)',
      html: buildQrSheetHtml('Đồng Bộ', [{ payload: 'SYNC', svg: '<svg></svg>', name: 'A', code: 'C' }]),
    },
    {
      file: 'print-receipt.css',
      label: 'Phiếu thu/chi (buildReceiptHtml)',
      html: buildReceiptHtml({
        type: 'INCOME',
        receiptNumber: 'PT-SYNC',
        date: '2026-09-08',
        personName: 'Đồng Bộ CSS',
        amount: 100000,
        category: 'Đồng bộ',
        title: 'Đồng bộ CSS preview',
        fundName: 'Quỹ Chung',
        recordedByName: 'Thủ Quỹ',
      }),
    },
  ]
}

function extractStyles(html: string): string[] {
  return Array.from(html.matchAll(/<style>([\s\S]*?)<\/style>/g)).map(m => m[1].trim())
}

function cssFileHeader(label: string): string {
  return `/* GENERATED — DO NOT EDIT BY HAND.
 * Mirror của khối <style> do builders sinh ra (${label}).
 * Tái sinh: xem hướng dẫn đầu file src/__tests__/printPreviewCsp.test.ts
 * Sync test: src/__tests__/printPreviewCsp.test.ts
 * Lý do tồn tại: src/utils/printPreviewCss.ts (CSP-SRCDOC-PREVIEW).
 */`
}

function normalizeCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('CSP-SRCDOC-PREVIEW — tài liệu in mang <link> CSS cho preview production', () => {
  it.each([
    ['single', () => buildExamPaperHtml({ ...syncSingleOptions() }), 'print-exam-single.css'],
    ['batch', () => buildBatchExamPapersHtml(SYNC_STUDENTS, { ...syncSingleOptions() }), 'print-exam-batch.css'],
    [
      'answer-sheet',
      () =>
        buildBatchAnswerSheetsHtml(SYNC_STUDENTS, {
          sessionId: 'SYNC',
          subject: 'Đồng Bộ',
          scoreTypeLabel: 'Kiểm Tra',
          classLabel: 'Lớp Đồng Bộ',
          maxScore: 10,
          examType: 'multiple_choice',
          questionCount: 2,
        }),
      'print-answer-sheet.css',
    ],
    ['qr-sheet', () => buildQrSheetHtml('Đồng Bộ', []), 'print-qr-sheet.css'],
    [
      'receipt',
      () =>
        buildReceiptHtml({
          type: 'EXPENSE',
          receiptNumber: 'PC-1',
          date: '2026-09-08',
          personName: 'A',
          amount: 50000,
          category: 'C',
          title: 'T',
          fundName: 'Q',
          recordedByName: 'Q',
        }),
      'print-receipt.css',
    ],
  ])('%s: nhúng <link> stylesheet tuyệt đối ngay sau <head>', (_name, build, cssFile) => {
    const html = (build as () => string)()
    // Href tuyệt đối theo origin (popup Blob base `blob:` không resolve được
    // URL tương đối) — chỉ assert phần cuối để trung lập môi trường test.
    expect(html).toContain(`<head><link rel="stylesheet" href="`)
    expect(html).toContain(`/${cssFile}">`)
    expect(html).toContain('<style>')
  })

  it('stylesheetHref tuyệt đối theo origin, tương đối khi không có origin', () => {
    expect(stylesheetHref('print-qr-sheet.css', 'https://tnttvn.vercel.app')).toBe(
      'https://tnttvn.vercel.app/print-qr-sheet.css',
    )
    expect(stylesheetHref('print-qr-sheet.css', 'https://tnttvn.vercel.app/')).toBe(
      'https://tnttvn.vercel.app/print-qr-sheet.css',
    )
    expect(stylesheetHref('print-qr-sheet.css', undefined)).toBe('/print-qr-sheet.css')
    expect(stylesheetHref('print-qr-sheet.css', 'null')).toBe('/print-qr-sheet.css')
  })

  it('withPreviewStylesheet idempotent và bỏ qua HTML không phải tài liệu in', () => {
    const once = withPreviewStylesheet('<head><style>a{}</style></head>', 'print-qr-sheet.css')
    expect(once).toContain('print-qr-sheet.css')
    expect(once).toContain('<head><link rel="stylesheet" href="')
    expect(withPreviewStylesheet(once, 'print-qr-sheet.css')).toBe(once)
    expect(withPreviewStylesheet('<div>no head</div>', 'print-qr-sheet.css')).toBe('<div>no head</div>')
  })

  it('toggle 1/2 cột dùng class tĩnh cols-2 (không interpolation động trong CSS)', () => {
    const two = buildExamPaperHtml({ ...syncSingleOptions(), layoutColumns: 2 })
    const one = buildExamPaperHtml({ ...syncSingleOptions(), layoutColumns: 1 })
    expect(two).toContain('class="questions-wrapper cols-2"')
    expect(one).toContain('<div class="questions-wrapper">')
    expect(one).not.toContain('questions-wrapper cols-2">')
  })

  it('màu phiếu thu/chi theo loại dùng class tĩnh trên body', () => {
    const base = {
      receiptNumber: 'PT-1',
      date: '2026-09-08',
      personName: 'A',
      amount: 1000,
      category: 'C',
      title: 'T',
      fundName: 'Q',
      recordedByName: 'Q',
    } as const
    expect(buildReceiptHtml({ ...base, type: 'INCOME' })).toContain('<body class="voucher-income">')
    expect(buildReceiptHtml({ ...base, type: 'TRANSFER' })).toContain('<body class="voucher-transfer">')
    expect(buildReceiptHtml({ ...base, type: 'EXPENSE' })).toContain('<body class="voucher-expense">')
  })

  it('khối <style> builder sinh ra thuần tĩnh — không phụ thuộc tùy chọn động', () => {
    // Tripwire: mọi giá trị động (số cột, khung điểm, màu phiếu) phải nằm ở
    // attribute/class HTML, vì file public/*.css chỉ mirror ĐÚNG MỘT biến thể.
    // Nếu test này fail sau khi thêm `${...}` động vào CSS builder → chuyển giá
    // trị đó ra attribute/class rồi chạy lại sync.
    const examA = buildExamPaperHtml({ ...syncSingleOptions(), layoutColumns: 1, includeGradingBox: false })
    const examB = buildExamPaperHtml({ ...syncSingleOptions(), layoutColumns: 2, includeGradingBox: true })
    expect(extractStyles(examA).map(normalizeCss).join('\n')).toBe(
      extractStyles(examB).map(normalizeCss).join('\n'),
    )
    const receiptBase = {
      receiptNumber: 'PT-1',
      date: '2026-09-08',
      personName: 'A',
      amount: 1000,
      category: 'C',
      title: 'T',
      fundName: 'Q',
      recordedByName: 'Q',
    } as const
    const income = extractStyles(buildReceiptHtml({ ...receiptBase, type: 'INCOME' })).map(normalizeCss).join('\n')
    const expense = extractStyles(buildReceiptHtml({ ...receiptBase, type: 'EXPENSE' })).map(normalizeCss).join('\n')
    const transfer = extractStyles(buildReceiptHtml({ ...receiptBase, type: 'TRANSFER' })).map(normalizeCss).join('\n')
    expect(expense).toBe(income)
    expect(transfer).toBe(income)
  })

  it('public/*.css đồng bộ byte với khối <style> builders sinh ra (hoặc tái sinh với SYNC_PRINT_CSS=1)', () => {
    const docs = buildSyncDocs()
    if (process.env[SYNC_ENV] === '1') {
      for (const doc of docs) {
        const styles = extractStyles(doc.html)
        expect(styles.length).toBeGreaterThan(0)
        writeFileSync(resolve(process.cwd(), 'public', doc.file), `${cssFileHeader(doc.label)}\n${styles.join('\n')}\n`, 'utf8')
      }
      return
    }
    for (const doc of docs) {
      const expected = extractStyles(doc.html).map(normalizeCss).join('\n')
      const actualRaw = readFileSync(resolve(process.cwd(), 'public', doc.file), 'utf8')
      expect(normalizeCss(actualRaw), `public/${doc.file} lệch khỏi builder — tái sinh theo hướng dẫn đầu file test`).toBe(expected)
    }
  })
})
