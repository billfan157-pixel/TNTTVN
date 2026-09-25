/**
 * Tiện ích phản hồi xúc giác (Haptic Feedback) chuẩn cho Catevia PWA.
 * An toàn trên mọi môi trường (Browser, PWA mobile iOS 16+/Android, SSR, jsdom).
 * Tự động tắt khi người dùng bật chế độ giảm chuyển động (prefers-reduced-motion: reduce).
 */

let hapticsEnabled = true

function canVibrate(): boolean {
  if (!hapticsEnabled) return false
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (typeof navigator.vibrate !== 'function') return false

  // Tôn trọng thiết lập trợ năng của người dùng
  if (typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return false
      }
    } catch {
      // Bỏ qua lỗi matchMedia trên môi trường kiểm thử cũ
    }
  }

  return true
}

function safeVibrate(pattern: number | number[]): boolean {
  if (!canVibrate()) return false
  try {
    return navigator.vibrate(pattern)
  } catch {
    return false
  }
}

export const hapticFeedback = {
  /**
   * Chạm nhẹ (8ms): Phản hồi cho các nút bấm thường, chuyển tab, chọn bộ lọc.
   */
  light(): boolean {
    return safeVibrate(8)
  },

  /**
   * Chạm nhẹ (8ms): Alias cho light().
   */
  tap(): boolean {
    return safeVibrate(8)
  },

  /**
   * Chạm vừa (16ms): Phản hồi khi chuyển chế độ, bấm hành động chính.
   */
  medium(): boolean {
    return safeVibrate(16)
  },

  /**
   * Chọn trạng thái (4ms): Tích điểm danh nhanh, chuyển công tắc (switch).
   */
  selection(): boolean {
    return safeVibrate(4)
  },

  /**
   * Thành công [12, 40, 20]: Nhịp kép khi lưu dữ liệu thành công, quét OMR khớp.
   */
  success(): boolean {
    return safeVibrate([12, 40, 20])
  },

  /**
   * Cảnh báo [25, 40, 25]: Nhịp cảnh báo khi xung đột dữ liệu, phiên offline.
   */
  warning(): boolean {
    return safeVibrate([25, 40, 25])
  },

  /**
   * Lỗi [35, 60, 35]: Nhịp rung khi lỗi biểu mẫu, thao tác nguy hiểm (xóa).
   */
  error(): boolean {
    return safeVibrate([35, 60, 35])
  },

  /**
   * Kiểm tra thiết bị hiện tại có hỗ trợ API rung không.
   */
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  },

  /**
   * Bật/tắt haptics theo cài đặt của người dùng.
   */
  setEnabled(enabled: boolean): void {
    hapticsEnabled = enabled
  },

  /**
   * Kiểm tra haptics có đang được kích hoạt hay không.
   */
  isEnabled(): boolean {
    return hapticsEnabled
  },
}

export const haptics = hapticFeedback
