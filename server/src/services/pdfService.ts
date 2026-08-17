import puppeteer from 'puppeteer'
import type { Browser, PDFMargin } from 'puppeteer'

import { sanitizePDFHTML, isInternalOrLocalUrl } from '../utils/pdfSanitizer.js'

let browser: Browser | null = null

async function getBrowser(): Promise<Browser> {
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
  options: { format?: 'A4' | 'A3' | 'Letter'; landscape?: boolean; margin?: PDFMargin } = {}
): Promise<Uint8Array> {
  const sanitizedHTML = sanitizePDFHTML(htmlContent)
  const b = await getBrowser()
  const page = await b.newPage()

  try {
    // A-NEW-42 (2026-08-13): Chặn đọc file cục bộ & SSRF qua Puppeteer Request Interception
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const url = req.url().toLowerCase()

      // Chặn mọi yêu cầu file:// (LFI)
      if (url.startsWith('file:')) {
        req.abort('accessdenied')
        return
      }

      // Cho phép data: URIs (inline images/fonts base64)
      if (url.startsWith('data:')) {
        req.continue()
        return
      }

      // Cho phép about: (main document/blank)
      if (url.startsWith('about:')) {
        req.continue()
        return
      }

      // Chặn các request tới localhost / IP nội bộ (SSRF)
      if (isInternalOrLocalUrl(url)) {
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
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close()
    browser = null
  }
}