import { createServer, type Server } from 'node:http'
import { afterAll, describe, expect, it } from 'vitest'
import { closeBrowser, generatePDFFromHTML } from '../../services/pdfService.js'

describe('PDF browser network isolation', () => {
  let probe: Server | undefined

  afterAll(async () => {
    await closeBrowser()
    if (probe) await new Promise<void>((resolve, reject) => probe!.close(error => error ? reject(error) : resolve()))
  })

  it('renders a PDF without fetching a localhost-dot srcset or CSS import', async () => {
    let hits = 0
    probe = createServer((_request, response) => {
      hits++
      response.writeHead(200, { 'Content-Type': 'image/png' })
      response.end()
    })
    await new Promise<void>((resolve, reject) => {
      probe!.once('error', reject)
      probe!.listen(0, '127.0.0.1', resolve)
    })
    const address = probe.address()
    if (!address || typeof address === 'string') throw new Error('Missing local probe port')

    const target = `http://localhost.:${address.port}/probe`
    const pdf = await generatePDFFromHTML(`
      <html><head><style>@import "${target}";</style></head>
      <body><img srcset="${target} 1x" alt="probe"><p>PDF isolation</p>
      <script>fetch('${target}')</script></body></html>
    `)

    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe('%PDF')
    expect(hits).toBe(0)
  }, 60_000)
})
