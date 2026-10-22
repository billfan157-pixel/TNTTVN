interface DocumentElement {
  type: string
  value?: string
  breakType?: string
  children?: DocumentElement[]
  numbering?: { level: string; isOrdered: boolean } | null
}

/** Extract text from Mammoth's document tree so Word list hierarchy survives. */
export async function extractExamDocxText(buffer: ArrayBuffer | Uint8Array) {
  const module = await import('mammoth')
  const mammoth = module.default ?? module
  const arrayBuffer = buffer instanceof Uint8Array ? Uint8Array.from(buffer).buffer as ArrayBuffer : buffer
  let text = ''
  let hasLists = false
  const counters: number[] = []
  const read = (element: DocumentElement): string => {
    if (element.type === 'text') return element.value ?? ''
    if (element.type === 'tab') return '\t'
    if (element.type === 'break') return element.breakType === 'line' ? '\n' : ''
    if (element.type === 'tableRow') return `${(element.children ?? []).map(read).map(cell => cell.trim().replace(/\n+/g, ' ')).join('\t')}\n`
    const content = (element.children ?? []).map(read).join('')
    if (element.type !== 'paragraph') return content
    if (!element.numbering) {
      if (/^\s*(?:câu|bài|question)\s*\d/i.test(content)) counters.length = 0
      return `${content}\n\n`
    }
    hasLists = true
    const level = Math.max(0, Math.min(8, Number(element.numbering.level) || 0))
    counters.length = level + 1
    counters[level] = (counters[level] ?? 0) + 1
    // Mammoth retains list depth/order but not the original Word label style.
    const marker = element.numbering.isOrdered ? `${counters[level]}${level === 0 ? '.' : ')'}` : '•'
    return `${'  '.repeat(level)}${marker} ${content}\n`
  }
  const extraction = await mammoth.convertToHtml({ arrayBuffer }, {
    externalFileAccess: false,
    includeEmbeddedStyleMap: false,
    convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
    transformDocument: document => {
      text = read(document)
      return document
    },
  })
  // Generated HTML is discarded; only plain text enters the exam parser.
  return {
    value: text,
    messages: [
      ...extraction.messages,
      ...(hasLists ? [{ type: 'warning' as const, message: 'Đã giữ cấp danh sách Word và chuẩn hóa ký hiệu đánh số. Hãy kiểm tra câu lớn và các ý nhỏ trong xem trước.' }] : []),
    ],
  }
}
