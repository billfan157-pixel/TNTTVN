import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// A-NEW-29 (2026-08-11): A-NEW-22 (P2) — nginx.conf CSP phải đồng bộ với
// middleware/security.ts. Trước đây script-src có 'unsafe-inline' — SPA document
// nhận policy yếu hơn app → drift. Test này chống regression: nếu ai đó nới CSP
// ở proxy (nginx) thì test fail ngay, không cần deploy để phát hiện.
const nginxConf = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8')
const cspMatch = nginxConf.match(/add_header Content-Security-Policy "([^"]+)"/)
const csp = cspMatch?.[1] ?? ''

function directive(name: string): string {
  const m = csp.match(new RegExp(`${name}\\s+([^;]+)`))
  return m?.[1] ?? ''
}

describe('nginx.conf CSP alignment (A-NEW-22)', () => {
  it('nginx.conf có Content-Security-Policy', () => {
    expect(csp).not.toBe('')
  })

  it('script-src KHÔNG chứa unsafe-inline (đồng bộ app: script-src self)', () => {
    expect(directive('script-src')).toContain("'self'")
    expect(directive('script-src')).not.toContain('unsafe-inline')
  })

  it('style-src giữ allowance inline style attributes qua style-src-attr (React style={})', () => {
    expect(directive('style-src-attr')).toContain("'unsafe-inline'")
  })

  it('style-src không cho inline <style> element', () => {
    expect(directive('style-src')).not.toContain('unsafe-inline')
  })

  it('base-uri + object-src hardening có mặt (đồng bộ app)', () => {
    expect(directive('base-uri')).toBe("'self'")
    expect(directive('object-src')).toBe("'none'")
  })
})
