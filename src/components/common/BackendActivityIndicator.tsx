import { Loader2 } from 'lucide-react'
import { useBackendActivityCount } from '../../hooks/useBackendActivity'
import { useDelayedNotice } from '../../hooks/useDelayedNotice'

/**
 * Chỉ báo toàn cục "đang chờ máy chủ" cho MỌI hoạt động có kết nối backend.
 *
 * Đây là lưới an toàn ở tầng transport: kể cả khi một nút/handler quên bật
 * busy state cục bộ, người dùng vẫn thấy phản hồi ngay thay vì màn hình "đơ".
 * Busy state cục bộ (`Button loading`, skeleton) vẫn là lớp phản hồi chính —
 * chỉ báo này bổ sung, không thay thế.
 *
 * Chống nhiễu: chỉ hiện khi request kéo dài quá `delayMs` (mặc định 400ms) nên
 * các lần chờ nhanh không nhấp nháy màn hình. `useDelayedNotice` tự reset khi
 * request kết thúc.
 */
export function BackendActivityIndicator({ delayMs = 400 }: { delayMs?: number }) {
  const pendingCount = useBackendActivityCount()
  const visible = useDelayedNotice(pendingCount > 0, delayMs)

  if (!visible) return null

  return (
    <>
      <div className="backend-activity-bar" aria-hidden="true">
        <div className="backend-activity-bar__sweep" />
      </div>
      <div
        className="backend-activity-chip"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={`Đang xử lý ${pendingCount} yêu cầu máy chủ`}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-parish-info" aria-hidden="true" />
        <span>Đang xử lý…</span>
      </div>
    </>
  )
}
