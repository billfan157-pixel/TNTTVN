/**
 * CSP-SRCDOC-PREVIEW (2026-09-08) — Root cause: localhost (Vite dev, không CSP)
 * render `<style>` inline trong iframe `srcDoc` bình thường, nhưng production
 * (Vercel/nginx/server middleware) áp `style-src 'self'` KHÔNG có
 * `'unsafe-inline'` → mọi `<style>` element trong tài liệu `srcDoc` (vốn KẾ
 * THỪA CSP của parent — verified bằng Chromium thật với đúng header Vercel)
 * bị chặn → preview đề thi/phiếu thu mất toàn bộ layout. Tài liệu popup Blob
 * URL (`window.open` + `location.href = blob:`) CŨNG kế thừa CSP (verified:
 * inline `<style>` trong popup bị chặn y hệt) — cộng thêm base URL `blob:...`
 * khiến URL tương đối không resolve được.
 *
 * Fix KHÔNG nới CSP, KHÔNG bỏ `sandbox=""`: mỗi tài liệu in nhúng thêm `<link>`
 * stylesheet TUYỆT ĐỐI cùng origin (được `style-src 'self'` cho phép — verified
 * sheet load và style áp dụng trong cả iframe `srcDoc` lẫn popup Blob).
 * Khối `<style>` inline vẫn giữ nguyên cho các ngữ cảnh không CSP (tải file
 * HTML/Word, Puppeteer server, script node/tsx).
 *
 * Mỗi loại tài liệu có file CSS riêng (1 doc — 1 file) để `@page`/`body` của
 * các loại không cascade lẫn nhau. File trong `public/` là mirror của khối
 * `<style>` builder sinh ra; test `src/__tests__/printPreviewCsp.test.ts`
 * khóa đồng bộ (tái sinh bằng test với SYNC_PRINT_CSS=1).
 *
 * Mọi giá trị động theo từng tài liệu (số cột, màu phiếu theo loại) phải nằm
 * trong `style=""` attribute (được `style-src-attr 'unsafe-inline'`) hoặc class
 * toggle trỏ tới rule tĩnh — TUYỆT ĐỐI không interpolation giá trị động vào
 * CSS dùng cho preview.
 */

/**
 * Chèn `<link>` stylesheet preview vào tài liệu HTML in ấn. Idempotent, pure,
 * không chạm dữ liệu user (đã escape ở tầng builder). Trả về nguyên văn khi
 * không có `<head>` (không phải tài liệu in).
 *
 * Href LUÔN tuyệt đối theo origin hiện tại vì tài liệu popup Blob URL
 * (`window.open` + `location.href = blob:`) có base URL là `blob:...` —
 * URL tương đối (`/print-*.css`) KHÔNG resolve được (verified Chromium thật:
 * `link.href` giữ nguyên chuỗi thô, `link.sheet` null, server không nhận request).
 * URL tuyệt đối cùng origin vẫn qua `style-src 'self'` (verified: sheet load,
 * style áp dụng) trong cả iframe `srcDoc` lẫn popup Blob (cả hai đều kế thừa
 * CSP parent — popup Blob KHÔNG phải "document riêng" như nhận định cũ).
 * Ngữ cảnh không có `window` (script node/tsx) rơi về `/` tương đối — ở đó
 * link vốn chỉ là dự phòng câm (inline `<style>` vẫn chạy vì không có CSP).
 */
export function withPreviewStylesheet(html: string, cssFile: string): string {
  if (!html || !cssFile || !html.includes('<head>') || html.includes(cssFile)) return html
  return html.replace('<head>', `<head><link rel="stylesheet" href="${stylesheetHref(cssFile, currentOrigin())}">`)
}

/** Dựng href stylesheet: tuyệt đối theo origin khi có, tương đối khi không. */
export function stylesheetHref(cssFile: string, origin?: string): string {
  if (origin && origin !== 'null') {
    return `${origin.endsWith('/') ? origin.slice(0, -1) : origin}/${cssFile}`
  }
  return `/${cssFile}`
}

function currentOrigin(): string | undefined {
  try {
    if (typeof window !== 'undefined' && typeof window.location?.origin === 'string') {
      return window.location.origin
    }
  } catch {
    // Bỏ qua — rơi về href tương đối bên dưới.
  }
  return undefined
}
