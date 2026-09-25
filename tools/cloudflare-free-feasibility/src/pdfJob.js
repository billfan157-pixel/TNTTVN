import { DurableObject } from 'cloudflare:workers'
import puppeteer from '@cloudflare/puppeteer'
import { generatePDFFromHTML, withPdfBrowserLauncher } from '../../../server/src/services/pdfService.ts'

// Browser rendering and HTML sanitization have a separate DO invocation budget.
export class PdfJob extends DurableObject {
  renderQueue = Promise.resolve()

  renderPdf(html, options) {
    // Browser Run Free allows one new browser every 20 seconds per account.
    // Serialize launches in this deployment coordinator and use a durable
    // timestamp so an isolate restart cannot immediately exceed that limit.
    const task = this.renderQueue.then(async () => {
      const lastLaunchAt = await this.ctx.storage.get('lastLaunchAt') || 0
      const waitMs = lastLaunchAt + 21_000 - Date.now()
      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs))
      await this.ctx.storage.put('lastLaunchAt', Date.now())
      return withPdfBrowserLauncher(
        () => puppeteer.launch(this.env.BROWSER, { guardrails: { allowedDomains: [] } }),
        () => generatePDFFromHTML(html, options),
      )
    })
    this.renderQueue = task.then(() => undefined, () => undefined)
    return task
  }
}
