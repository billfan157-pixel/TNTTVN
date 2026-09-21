/**
 * A-NEW-42 (2026-08-13): Bộ lọc và vệ sinh HTML cho dịch vụ xuất PDF (Puppeteer).
 * 
 * Phòng chống SSRF (Server-Side Request Forgery) và LFI (Local File Inclusion):
 * 1. Mẫu PDF là self-contained: URL ngoài `data:` / `about:blank` bị thay thế.
 * 2. Browser request interception trong pdfService từ chối mọi outbound request.
 * 3. Loại script, iframe, object, embed và inline event handlers.
 */

function isPrivateIpOctets(a: number, b: number): boolean {
  if (a === 127) return true // 127.0.0.0/8
  if (a === 10) return true  // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 169 && b === 254) return true // 169.254.0.0/16 (cloud metadata)
  if (a === 0 && b === 0) return true // 0.0.0.0
  return false
}

function parseIpAddress(hostname: string): [number, number, number, number] | null {
  const cleanHost = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  // IPv6 loopback
  if (cleanHost === '::1' || cleanHost === '0:0:0:0:0:0:0:1') {
    return [127, 0, 0, 1]
  }

  // Dotted decimal IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanHost)) {
    const parts = cleanHost.split('.').map(Number)
    if (parts.every(p => p >= 0 && p <= 255)) {
      return parts as [number, number, number, number]
    }
  }

  // Single integer (decimal representation, e.g. 2130706433 = 127.0.0.1)
  if (/^\d+$/.test(cleanHost)) {
    const num = parseInt(cleanHost, 10)
    if (num >= 0 && num <= 0xFFFFFFFF) {
      return [
        (num >>> 24) & 0xFF,
        (num >>> 16) & 0xFF,
        (num >>> 8) & 0xFF,
        num & 0xFF
      ]
    }
  }

  // Hexadecimal representation, e.g. 0x7f000001
  if (/^0x[0-9a-f]+$/i.test(cleanHost)) {
    const num = parseInt(cleanHost, 16)
    if (num >= 0 && num <= 0xFFFFFFFF) {
      return [
        (num >>> 24) & 0xFF,
        (num >>> 16) & 0xFF,
        (num >>> 8) & 0xFF,
        num & 0xFF
      ]
    }
  }

  return null
}

export function isInternalOrLocalUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false
  const trimmed = urlStr.trim()

  if (trimmed.toLowerCase().startsWith('file:')) return true
  if (trimmed.toLowerCase().startsWith('data:')) return false
  if (trimmed.toLowerCase().startsWith('about:')) return false

  try {
    const parsed = new URL(trimmed)
    const protocol = parsed.protocol.toLowerCase()

    if (protocol === 'file:') return true
    if (protocol === 'data:' || protocol === 'about:') return false
    if (protocol !== 'http:' && protocol !== 'https:') return true

    // URL treats `localhost.` as a distinct hostname string even though DNS
    // resolves it to loopback. Canonicalize terminal dots before comparing.
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')

    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return true
    }

    const ip = parseIpAddress(hostname)
    if (ip) {
      return isPrivateIpOctets(ip[0], ip[1])
    }

    return false
  } catch {
    // URL không hợp lệ hoặc tương đối nhưng chứa file: hoặc IP local
    return trimmed.toLowerCase().includes('file:') || trimmed.toLowerCase().includes('localhost') || trimmed.toLowerCase().includes('127.0.0.1')
  }
}

/**
 * Official report templates are self-contained (inline CSS/SVG/data images).
 * The PDF browser therefore has no valid reason to reach the network. Keep
 * this allowlist deliberately tiny so an incomplete private-host classifier,
 * DNS rebinding, redirects, or unusual address encodings cannot become SSRF.
 */
export function isAllowedPdfResourceUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false
  try {
    const parsed = new URL(urlStr.trim())
    const protocol = parsed.protocol.toLowerCase()
    return protocol === 'data:' || (protocol === 'about:' && parsed.href.toLowerCase() === 'about:blank')
  } catch {
    return false
  }
}

export function sanitizePDFHTML(html: string): string {
  if (!html || typeof html !== 'string') return ''

  let sanitized = html

  // 1. Loại bỏ các thẻ script/iframe/object/embed/applet/frameset/meta http-equiv
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
  sanitized = sanitized.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
  sanitized = sanitized.replace(/<embed\b[^>]*>/gi, '')
  sanitized = sanitized.replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, '')
  sanitized = sanitized.replace(/<frame\b[^>]*>/gi, '')
  sanitized = sanitized.replace(/<frameset\b[^<]*(?:(?!<\/frameset>)<[^<]*)*<\/frameset>/gi, '')
  sanitized = sanitized.replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')

  // 2. Loại bỏ inline event handlers (onload, onerror,...)
  sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')

  // 3. Thay thế mọi đường dẫn ngoài allowlist trong thuộc tính src/href/action/data
  sanitized = sanitized.replace(/(src|href|action|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (match, attr, val1, val2, val3) => {
    const urlVal = (val1 || val2 || val3 || '').trim()
    if (!urlVal) return match

    if (!isAllowedPdfResourceUrl(urlVal)) {
      return `${attr}="about:blank"`
    }
    return match
  })

  // 4. Thay thế mọi url(...) ngoài allowlist trong CSS inline
  sanitized = sanitized.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]+))\s*\)/gi, (match, val1, val2, val3) => {
    const urlVal = (val1 || val2 || val3 || '').trim()
    if (!isAllowedPdfResourceUrl(urlVal)) {
      return 'url("about:blank")'
    }
    return match
  })

  return sanitized
}
