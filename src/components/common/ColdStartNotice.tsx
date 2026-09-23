import { Hourglass } from 'lucide-react'

/**
 * Ghi chú trấn an khi một thao tác chờ phản hồi máy chủ kéo dài bất thường —
 * điển hình là cold start của hosting free tier: trình duyệt vẫn "online" nhưng
 * request đầu tiên trong ngày có thể mất tới ~1 phút. Chỉ là lớp presentational:
 * không đo, không quyết định khi nào hiển thị — caller dùng `useDelayedNotice`.
 */
export function ColdStartNotice({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border border-parish-info/25 bg-parish-info-bg p-3 text-left ${className}`}
      role="status"
    >
      <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-parish-info" aria-hidden="true" />
      <span className="typography-body-sm text-parish-info">
        <strong className="font-semibold">Máy chủ có thể đang khởi động.</strong> Lần đầu mở trong
        ngày, khôi phục máy chủ có thể mất khoảng 1 phút. Dữ liệu của bạn được bảo vệ — bạn không cần
        tải lại trang, hệ thống sẽ tự tiếp tục ngay khi sẵn sàng.
      </span>
    </div>
  )
}
