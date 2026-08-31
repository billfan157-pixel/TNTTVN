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
 * localhost dev + https://tnttvn.vercel.app + native shell Capacitor) — có thể ghi
 * đè qua env CLIENT_ORIGIN (comma-separated).
 *
 * A14 (2026-08-10): so khớp FULL origin (scheme + host + port) thay vì chỉ hostname —
 * trước đây http://tnttvn.vercel.app:8443 hoặc https://tnttvn.vercel.app:9999 cũng pass
 * (hostname trùng), mở rộng surface cho các cổng/scheme không kiểm soát. Allowlist
 * hiện đã liệt kê từng cổng localhost cụ thể nên không vỡ workflow dev.
 *
 * NATIVE (2026-08-19, ADR-029 amendment): native shell Capacitor 8 — iOS WebView chạy
 * ở origin `capacitor://localhost` (CAPInstanceDescriptorDefaultScheme = "capacitor"),
 * Android WebView chạy ở `https://localhost` (androidScheme default = "https").
 * Origin header do browser/WebView đặt theo document origin thật — không thể giả mạo
 * từ JS (forbidden header name trong Fetch spec), nên thêm các origin này KHÔNG mở
 * cửa cho website độc hại; auth vẫn là Bearer JWT + login mật khẩu (không ambient
 * cookie), không tạo vector session hijack mới.
 */

export const NATIVE_ALLOWED_ORIGINS = [
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'https://tnttvn.vercel.app',
  ...NATIVE_ALLOWED_ORIGINS,
]

// A-NEW-12 (2026-08-10): production KHÔNG được chứa localhost dev ports trong default
// allowlist — probe thật trên Railway: Origin localhost:5173 được reflect ACAO +
// credentials:true, localhost-origin là attack surface không cần thiết. Production
// default CHỈ gồm domain thật + origin native shell của chính app (2026-08-19);
// muốn thêm origin → set CLIENT_ORIGIN rõ ràng.
const PRODUCTION_ALLOWED_ORIGINS = [
  'https://tnttvn.vercel.app',
  ...NATIVE_ALLOWED_ORIGINS,
]

export function resolveAllowedOrigins(): string[] {
  if (process.env.CLIENT_ORIGIN) {
    const configured = process.env.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    // NATIVE (2026-08-31): luôn giữ các origin native shell để việc cấu hình CLIENT_ORIGIN
    // cho web domain (ví dụ trên Render/Vercel) không làm hỏng app native iOS/Android
    return Array.from(new Set([...configured, ...NATIVE_ALLOWED_ORIGINS]))
  }
  return process.env.NODE_ENV === 'production' ? PRODUCTION_ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS
}

function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(raw)
    // Opaque origin ("null") xảy ra với scheme tùy chỉnh (ví dụ capacitor://) —
    // không thể so khớp qua .origin, fallback so khớp scheme://host:port
    const scheme = u.protocol.replace(/:$/, '').toLowerCase()
    if (u.origin === 'null') return `${scheme}://${u.host}`.toLowerCase()
    return u.origin.toLowerCase()
  } catch {
    return null
  }
}

export function isOriginAllowed(origin: string | null | undefined, allowedOrigins: string[] = DEFAULT_ALLOWED_ORIGINS): boolean {
  if (!origin) return true

  const normalizedOrigin = normalizeOrigin(origin)
  if (!normalizedOrigin) return false
  return allowedOrigins.some((allowed) => normalizeOrigin(allowed) === normalizedOrigin)
}