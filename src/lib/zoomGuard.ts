/**
 * Chặn hoàn toàn khả năng zoom (pinch-zoom, double-tap zoom) trên mobile.
 *
 * Lý do phải có JS guard: iOS Safari / WKWebView bỏ qua `user-scalable=no`
 * trong viewport meta từ iOS 10 (chính sách accessibility), nên meta tag
 * chỉ đủ cho Android. Guard này bổ sung lớp chặn gesture cho WebKit:
 *  - `gesturestart/gesturechange/gestureend`: pinch-zoom Safari/WKWebView.
 *  - touchmove >= 2 ngón: pinch-zoom fallback (Chrome/WebView).
 *
 * Cuộn dọc/ngang một ngón và thao tác form không bị ảnh hưởng.
 */
export function installZoomGuard(): void {
  if (typeof window === 'undefined') return

  const blockEvent = (event: Event) => {
    event.preventDefault()
  }

  // Pinch-zoom của Safari / WKWebView
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'] as const) {
    document.addEventListener(type, blockEvent, { passive: false })
  }

  // Pinch 2+ ngón trên Chromium/WebView — giữ cuộn một ngón hoạt động bình thường
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) {
        event.preventDefault()
      }
    },
    { passive: false },
  )
}
