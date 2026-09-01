/**
 * haptics.ts — Nền tảng phản hồi xúc giác (Haptic & Tactile Feedback Engine)
 *
 * Hỗ trợ đa nền tảng:
 * 1. Native Capacitor App: Tận dụng Web Vibration / Native Bridge
 * 2. Mobile Web / PWA: HTML5 Navigator.vibrate API với chuỗi xung nhịp tối ưu
 * 3. Desktop / Unsupported: Fallback no-op an toàn, không ném ngoại lệ
 * 4. Respect Accessibility: Tự động tắt nếu người dùng bật `prefers-reduced-motion`
 */

function isVibrationSupported(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function userPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function triggerVibration(pattern: number | number[]): boolean {
  if (!isVibrationSupported() || userPrefersReducedMotion()) return false
  try {
    return navigator.vibrate(pattern)
  } catch {
    return false
  }
}

export const hapticFeedback = {
  /**
   * Phản hồi chạm nhẹ (8ms) — Dùng cho chuyển tab, click button, filter chips, selection controls.
   */
  light(): boolean {
    return triggerVibration(8)
  },

  /**
   * Phản hồi chạm vừa (16ms) — Dùng cho toggle trạng thái điểm danh, đổi steppers, mở rộng thẻ.
   */
  medium(): boolean {
    return triggerVibration(16)
  },

  /**
   * Phản hồi thành công [12ms, 40ms nghỉ, 20ms] — Dùng khi lưu điểm, lưu điểm danh, bắt QR thành công.
   */
  success(): boolean {
    return triggerVibration([12, 40, 20])
  },

  /**
   * Phản hồi cảnh báo [25ms, 40ms nghỉ, 25ms] — Dùng cho cảnh báo khóa sổ, xác nhận xóa, cảnh báo unsaved.
   */
  warning(): boolean {
    return triggerVibration([25, 40, 25])
  },

  /**
   * Phản hồi lỗi [35ms, 60ms nghỉ, 35ms] — Dùng khi nhập điểm ngoài khoảng 0-10, quét mã thất bại.
   */
  error(): boolean {
    return triggerVibration([35, 60, 35])
  },

  /**
   * Phản hồi vi mô (4ms) — Dùng khi lướt danh sách, trượt con lăn số nhanh.
   */
  selection(): boolean {
    return triggerVibration(4)
  },
}
