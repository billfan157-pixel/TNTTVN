import { describe, it, expect } from 'vitest'
import { isOriginAllowed, resolveAllowedOrigins, DEFAULT_ALLOWED_ORIGINS } from '../../utils/originPolicy.js'

/**
 * A13 (2026-08-10): CORS allowlist CỨNG — đã xóa wildcard `*.vercel.app`.
 * Trước đây index.ts:56 cho phép MỌI project vercel (kể cả của attacker) —
 * attack surface dư thừa + cửa hậu tiềm năng nếu auth chuyển cookie SameSite=None.
 */

describe('A13 — CORS allowlist (no wildcard)', () => {
  it('production origin tnttvn.vercel.app được phép', () => {
    expect(isOriginAllowed('https://tnttvn.vercel.app', DEFAULT_ALLOWED_ORIGINS)).toBe(true)
  })

  it('random-project.vercel.app BỊ TỪ CHỐI (wildcard đã bị xóa)', () => {
    expect(isOriginAllowed('https://random-project.vercel.app', DEFAULT_ALLOWED_ORIGINS)).toBe(false)
  })

  it('localhost dev (5173/5174/4173) được phép', () => {
    expect(isOriginAllowed('http://localhost:5173', DEFAULT_ALLOWED_ORIGINS)).toBe(true)
    expect(isOriginAllowed('http://localhost:5174', DEFAULT_ALLOWED_ORIGINS)).toBe(true)
    expect(isOriginAllowed('http://localhost:4173', DEFAULT_ALLOWED_ORIGINS)).toBe(true)
  })

  it('origin null (curl/server-to-server) được phép', () => {
    expect(isOriginAllowed(null, DEFAULT_ALLOWED_ORIGINS)).toBe(true)
    expect(isOriginAllowed(undefined, DEFAULT_ALLOWED_ORIGINS)).toBe(true)
  })

  it('hostname ngoài allowlist bị từ chối', () => {
    expect(isOriginAllowed('https://evil.example.com', DEFAULT_ALLOWED_ORIGINS)).toBe(false)
    expect(isOriginAllowed('https://tnttvn.vercel.app.evil.io', DEFAULT_ALLOWED_ORIGINS)).toBe(false)
  })

  it('env CLIENT_ORIGIN ghi đè allowlist mặc định', () => {
    process.env.CLIENT_ORIGIN = 'https://app.tnttvn.vn,http://localhost:3000'
    try {
      const origins = resolveAllowedOrigins()
      expect(origins).toEqual(['https://app.tnttvn.vn', 'http://localhost:3000'])
      expect(isOriginAllowed('https://app.tnttvn.vn', origins)).toBe(true)
      expect(isOriginAllowed('https://tnttvn.vercel.app', origins)).toBe(false)
    } finally {
      delete process.env.CLIENT_ORIGIN
    }
  })

  it('A-NEW-12: NODE_ENV=production KHÔNG chứa localhost trong default allowlist', () => {
    process.env.NODE_ENV = 'production'
    try {
      const origins = resolveAllowedOrigins()
      expect(origins).toEqual(['https://tnttvn.vercel.app'])
      expect(isOriginAllowed('http://localhost:5173', origins)).toBe(false)
      expect(isOriginAllowed('http://localhost:5174', origins)).toBe(false)
      expect(isOriginAllowed('https://tnttvn.vercel.app', origins)).toBe(true)
    } finally {
      delete process.env.NODE_ENV
    }
  })

  it('A-NEW-12: NODE_ENV=production + CLIENT_ORIGIN vẫn ghi đè (thêm origin có chủ đích)', () => {
    process.env.NODE_ENV = 'production'
    process.env.CLIENT_ORIGIN = 'https://app.tnttvn.vn'
    try {
      const origins = resolveAllowedOrigins()
      expect(origins).toEqual(['https://app.tnttvn.vn'])
      expect(isOriginAllowed('https://tnttvn.vercel.app', origins)).toBe(false)
      expect(isOriginAllowed('http://localhost:5173', origins)).toBe(false)
    } finally {
      delete process.env.NODE_ENV
      delete process.env.CLIENT_ORIGIN
    }
  })

  it('env CLIENT_ORIGIN tự động trim khoảng trắng thừa giữa các origin', () => {
    process.env.CLIENT_ORIGIN = 'https://tnttvn.vercel.app , http://localhost:5173 '
    try {
      const origins = resolveAllowedOrigins()
      expect(origins).toEqual(['https://tnttvn.vercel.app', 'http://localhost:5173'])
      expect(isOriginAllowed('http://localhost:5173', origins)).toBe(true)
      expect(isOriginAllowed('https://tnttvn.vercel.app', origins)).toBe(true)
    } finally {
      delete process.env.CLIENT_ORIGIN
    }
  })
})