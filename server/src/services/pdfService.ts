import puppeteer from 'puppeteer'
import type { Browser, PDFMargin } from 'puppeteer'
import { AsyncLocalStorage } from 'node:async_hooks'

import { sanitizePDFHTML, isAllowedPdfResourceUrl } from '../utils/pdfSanitizer.js'
import { isCloudflareWorkerRuntime } from '../utils/cloudflareRuntime.js'

let browser: Browser | null = null
const workerBrowserLauncher = new AsyncLocalStorage<() => Promise<Browser>>()
const workerPdfRenderer = new AsyncLocalStorage<(html: string, options: PdfOptions) => Promise<Uint8Array>>()

type PdfOptions = { format?: 'A4' | 'A3' | 'Letter'; landscape?: boolean; margin?: PDFMargin }

export function withPdfBrowserLauncher<T>(launch: () => Promise<Browser>, run: () => T): T {
  return workerBrowserLauncher.run(launch, run)
}

export function withPdfRenderer<T>(render: (html: string, options: PdfOptions) => Promise<Uint8Array>, run: () => T): T {
  return workerPdfRenderer.run(render, run)
}

async function getBrowser(): Promise<Browser> {
  if (isCloudflareWorkerRuntime()) {
    const launch = workerBrowserLauncher.getStore()
    if (!launch) throw new Error('Cloudflare Browser Run binding is required for PDF generation')
    return launch()
  }
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  }
  return browser
}

export async function generatePDFFromHTML(
  htmlContent: string,
  options: PdfOptions = {}
): Promise<Uint8Array> {
  const remoteRenderer = isCloudflareWorkerRuntime() ? workerPdfRenderer.getStore() : undefined
  if (remoteRenderer) return remoteRenderer(htmlContent, options)
  const sanitizedHTML = sanitizePDFHTML(htmlContent)
  const b = await getBrowser()
  const page = await b.newPage()

  try {
    // PDF input is presentation-only; do not execute any script even if an
    // unusual HTML/SVG encoding evades the string sanitizer.
    await page.setJavaScriptEnabled(false)
    // A-NEW-42 (2026-08-13): Chặn đọc file cục bộ & SSRF qua Puppeteer Request Interception
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const url = req.url()

      // Official PDF templates are self-contained. Deny every network/file/
      // blob resource instead of trying to enumerate private address syntax.
      if (!isAllowedPdfResourceUrl(url)) {
        req.abort('accessdenied')
        return
      }

      // Chặn các resource type không cần thiết cho render PDF tĩnh
      const resType = req.resourceType()
      if (['websocket', 'eventsource', 'xhr', 'fetch'].includes(resType)) {
        req.abort('blockedbyclient')
        return
      }

      req.continue()
    })

    await page.setContent(sanitizedHTML, { waitUntil: 'load', timeout: 30000 })

    const pdfBuffer = await page.pdf({
      format: options.format || 'A4',
      landscape: options.landscape || false,
      margin: options.margin || { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      printBackground: true,
      preferCSSPageSize: true,
    })

    return pdfBuffer
  } finally {
    await page.close()
    if (isCloudflareWorkerRuntime()) await b.close()
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close()
    browser = null
  }
}
