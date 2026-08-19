const NATIVE_CAMERA_FALLBACK_MESSAGE = 'Camera trực tiếp chưa khả dụng trong WebView của thiết bị này. Hãy bấm “Tải ảnh” để chụp phiếu bằng camera iPhone hoặc chọn ảnh phiếu đã chụp.'

/**
 * WKWebView only exposes navigator.mediaDevices when the native media/privacy
 * configuration is valid. Keep the scanner fail-safe on older/misconfigured
 * native shells instead of throwing while evaluating mediaDevices.getUserMedia.
 *
 * This is deliberately a rejection-only shim: when WebRTC is available we do
 * not touch the browser implementation, and still-image capture continues to
 * use the existing <input capture="environment"> -> QR/OMR pipeline.
 */
export function installNativeMediaDevicesGuard(): void {
  if (typeof navigator === 'undefined') return
  if (navigator.mediaDevices?.getUserMedia) return

  const fallback = {
    getUserMedia: async () => {
      throw new Error(NATIVE_CAMERA_FALLBACK_MESSAGE)
    },
  } as unknown as MediaDevices

  try {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: fallback,
    })
  } catch {
    try {
      ;(navigator as Navigator & { mediaDevices: MediaDevices }).mediaDevices = fallback
    } catch {
      // If WebKit keeps the property non-configurable, the scanner's outer
      // camera error boundary still prevents the rest of the app from failing.
    }
  }
}
