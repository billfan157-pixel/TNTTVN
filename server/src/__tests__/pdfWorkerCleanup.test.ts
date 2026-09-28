import { describe, expect, it, vi } from 'vitest'
import type { Browser } from 'puppeteer'
import { generatePDFFromHTML, withPdfBrowserLauncher } from '../services/pdfService.js'

vi.mock('../utils/cloudflareRuntime.js', () => ({ isCloudflareWorkerRuntime: () => true }))

describe('Worker PDF browser cleanup', () => {
  it('releases a Browser Run session when page creation fails', async () => {
    const close = vi.fn(async () => {})
    const browser = { newPage: vi.fn(async () => { throw new Error('Page creation failed') }), close }
    await expect(withPdfBrowserLauncher(async () => browser as unknown as Browser,
      () => generatePDFFromHTML('<p>synthetic</p>'))).rejects.toThrow('Page creation failed')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('releases the browser even when closing its page fails', async () => {
    const close = vi.fn(async () => {})
    const page = {
      setJavaScriptEnabled: vi.fn(async () => {}), setRequestInterception: vi.fn(async () => {}),
      on: vi.fn(), setContent: vi.fn(async () => {}), pdf: vi.fn(async () => new Uint8Array([1])),
      close: vi.fn(async () => { throw new Error('Page close failed') }),
    }
    await expect(withPdfBrowserLauncher(async () => ({ newPage: async () => page, close }) as unknown as Browser,
      () => generatePDFFromHTML('<p>synthetic</p>'))).rejects.toThrow('Page close failed')
    expect(close).toHaveBeenCalledTimes(1)
  })
})
