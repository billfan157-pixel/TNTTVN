import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatePDFFromHTML, withPdfRenderer } from '../services/pdfService.js'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function workerRuntime() {
  vi.stubEnv('CATEVIA_RUNTIME', 'cloudflare-worker')
  vi.stubGlobal('WebSocketPair', class WebSocketPair {})
}

describe('Worker PDF dispatcher', () => {
  it('fails closed without the Browser Run or PDF job binding', async () => {
    workerRuntime()
    await expect(generatePDFFromHTML('<h1>probe</h1>')).rejects.toThrow('Cloudflare Browser Run binding is required')
  })

  it('keeps concurrent renderers request-scoped', async () => {
    workerRuntime()
    const output = await Promise.all([
      withPdfRenderer(async (html, options) => {
        await Promise.resolve()
        expect(html).toBe('<p>first</p>')
        expect(options.format).toBe('A4')
        return new Uint8Array([1])
      }, () => generatePDFFromHTML('<p>first</p>', { format: 'A4' })),
      withPdfRenderer(async (html, options) => {
        await Promise.resolve()
        expect(html).toBe('<p>second</p>')
        expect(options.landscape).toBe(true)
        return new Uint8Array([2])
      }, () => generatePDFFromHTML('<p>second</p>', { landscape: true })),
    ])
    expect(output.map(bytes => bytes[0])).toEqual([1, 2])
  })
})
