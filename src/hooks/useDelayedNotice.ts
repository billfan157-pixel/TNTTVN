import { useEffect, useState } from 'react'

/**
 * Trả về true sau `delayMs` tính từ lúc `active` chuyển lên true; reset về false
 * ngay khi `active` tắt (tự re-arm cho lần chờ/submit kế tiếp). Dùng cho các ghi
 * chú "chờ lâu" (cold-start hint) chỉ xuất hiện khi thao tác thực sự kéo dài,
 * tránh gây nhiễu với các lần chờ nhanh thông thường.
 */
export function useDelayedNotice(active: boolean, delayMs = 10_000): boolean {
  const [elapsed, setElapsed] = useState(false)

  useEffect(() => {
    if (!active) {
      setElapsed(false)
      return
    }
    const timer = setTimeout(() => setElapsed(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])

  return elapsed
}
