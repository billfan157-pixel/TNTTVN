import { describe, it, expect } from 'vitest'
import { getClientIp } from '../utils/ip.js'
import type { Context } from 'hono'

function makeContext(headers: Record<string, string>, remoteAddress?: string): Context {
  // Minimal mock Context cho getClientIp: c.req.header() + c.env conninfo (socket IP)
  const ctx: any = {
    req: {
      header: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? undefined,
    },
  }
  if (remoteAddress) {
    ctx.env = { server: { incoming: { socket: { remoteAddress } } } }
  }
  return ctx as Context
}

/**
 * A15 (2026-08-10): getClientIp KHÔNG còn tin header khi thiếu TRUST_PROXY.
 * - Mặc định: socket IP thật (conninfo) — chống spoof tuyệt đối.
 * - TRUST_PROXY=true: x-real-ip (nginx ghi đè) → x-forwarded-for lấy giá trị CUỐI.
 * - cf-connecting-ip: bị bỏ hẳn (không có Cloudflare trong stack).
 */
describe('getClientIp — A15 policy', () => {
  it('KHÔNG TRUST_PROXY: trả về socket IP thật, bỏ qua mọi header giả mạo', () => {
    delete process.env.TRUST_PROXY
    const c = makeContext({
      'cf-connecting-ip': '203.0.113.10',
      'x-real-ip': '172.68.10.1',
      'x-forwarded-for': '1.2.3.4, 172.68.10.1',
    }, '203.0.113.50')
    expect(getClientIp(c)).toBe('203.0.113.50')
  })

  it('KHÔNG TRUST_PROXY + không có conninfo → unknown (không tin header không được xác thực)', () => {
    delete process.env.TRUST_PROXY
    const c = makeContext({ 'x-forwarded-for': '1.2.3.4' })
    expect(getClientIp(c)).toBe('unknown')
  })

  it('TRUST_PROXY=true: tin x-real-ip (nginx ghi đè bằng $remote_addr)', () => {
    process.env.TRUST_PROXY = 'true'
    try {
      const c = makeContext({ 'x-real-ip': '172.68.10.1', 'x-forwarded-for': '1.2.3.4, 172.68.10.1' })
      expect(getClientIp(c)).toBe('172.68.10.1')
    } finally {
      delete process.env.TRUST_PROXY
    }
  })

  it('TRUST_PROXY=true: x-forwarded-for lấy giá trị CUỐI (proxy append), bỏ IP giả phía trước', () => {
    process.env.TRUST_PROXY = 'true'
    try {
      const c = makeContext({ 'x-forwarded-for': '1.2.3.4, 203.0.113.195, 172.68.10.1' })
      expect(getClientIp(c)).toBe('172.68.10.1')
    } finally {
      delete process.env.TRUST_PROXY
    }
  })

  it('cf-connecting-ip LUÔN bị bỏ qua (không có Cloudflare trong stack)', () => {
    process.env.TRUST_PROXY = 'true'
    try {
      const c = makeContext({ 'cf-connecting-ip': '203.0.113.10', 'x-real-ip': '172.68.10.1' })
      expect(getClientIp(c)).toBe('172.68.10.1')
      const c2 = makeContext({ 'cf-connecting-ip': '203.0.113.10', 'x-forwarded-for': '172.68.10.1' })
      expect(getClientIp(c2)).toBe('172.68.10.1')
    } finally {
      delete process.env.TRUST_PROXY
    }
  })

  it('trim x-real-ip và x-forwarded-for', () => {
    process.env.TRUST_PROXY = 'true'
    try {
      expect(getClientIp(makeContext({ 'x-real-ip': '  172.68.10.1  ' }))).toBe('172.68.10.1')
      expect(getClientIp(makeContext({ 'x-forwarded-for': ' 198.51.100.5 ,  172.68.10.1  ' }))).toBe('172.68.10.1')
    } finally {
      delete process.env.TRUST_PROXY
    }
  })

  it('TRUST_PROXY=true + header rỗng hết → fallback socket IP', () => {
    process.env.TRUST_PROXY = 'true'
    try {
      const c = makeContext({ 'x-real-ip': '  ', 'x-forwarded-for': '   ' }, '198.51.100.9')
      expect(getClientIp(c)).toBe('198.51.100.9')
    } finally {
      delete process.env.TRUST_PROXY
    }
  })

  it('TRUST_PROXY=true + không có gì → unknown', () => {
    process.env.TRUST_PROXY = 'true'
    try {
      expect(getClientIp(makeContext({}))).toBe('unknown')
    } finally {
      delete process.env.TRUST_PROXY
    }
  })
})