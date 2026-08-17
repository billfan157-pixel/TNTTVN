/**
 * A13 (2026-08-10): CORS origin policy — allowlist CỨNG (không wildcard).
 *
 * Trước đây (index.ts:56) bất kỳ `*.vercel.app` nào cũng được phép — kể cả project
 * của attacker (vercel.app nằm trong Public Suffix List → random-project.vercel.app
 * là cross-site so với tnttvn.vercel.app, nhưng nếu sau này cookie đổi SameSite=None
 * hoặc auth chuyển domain chung thì wildcard này thành cửa hậu session hijack).
 *
 * Policy hiện tại: origin === null (curl/server-to-server) được phép; ngoài ra CHỈ
 * các origin KHỚP CHÍNH XÁC (scheme://host:port) nằm trong allowlist (mặc định:
 * localhost dev + https://tnttvn.vercel.app) — có thể ghi đè qua env CLIENT_ORIGIN
 * (comma-separated).
 *
 * A14 (2026-08-10): so khớp FULL origin (scheme + host + port) thay vì chỉ hostname —
 * trước đây http://tnttvn.vercel.app:8443 hoặc https://tnttvn.vercel.app:9999 cũng pass
 * (hostname trùng), mở rộng surface cho các cổng/scheme không kiểm soát. Allowlist
 * hiện đã liệt kê từng cổng localhost cụ thể nên không vỡ workflow dev.
 */

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'https://tnttvn.vercel.app',
]

// A-NEW-12 (2026-08-10): production KHÔNG được chứa localhost trong default allowlist.
// Probe thật trên Railway (tnttvn-production.up.railway.app/api/health): Origin
// localhost:5173 được reflect ACAO + credentials:true — với SameSite=None + access
// token trong localStorage, localhost-origin là attack surface không cần thiết.
// Production default CHỈ gồm domain thật; muốn thêm origin → set CLIENT_ORIGIN rõ ràng.
const PRODUCTION_ALLOWED_ORIGINS = ['https://tnttvn.vercel.app']

export function resolveAllowedOrigins(): string[] {
  if (process.env.CLIENT_ORIGIN) return process.env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  return process.env.NODE_ENV === 'production' ? PRODUCTION_ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS
}

export function isOriginAllowed(origin: string | null | undefined, allowedOrigins: string[] = DEFAULT_ALLOWED_ORIGINS): boolean {
  if (!origin) return true

  try {
    const normalizedOrigin = new URL(origin).origin
    return allowedOrigins.some((allowed) => {
      try {
        return normalizedOrigin === new URL(allowed).origin
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}