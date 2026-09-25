/**
 * Global backend-activity tracker — tín hiệu UX "đang chờ máy chủ".
 *
 * Vì sao cần: mỗi màn hình tự quản busy state cục bộ (Button `loading`,
 * skeleton…) nhưng chỉ khi call site nhớ bật. Một call site quên → người dùng
 * bấm nút và màn hình "đơ" không phản hồi gì. Tracker này nằm ở tầng transport
 * (`src/lib/api/core.ts`) nên MỌI request backend đều đóng góp tín hiệu, kể cả
 * các call site chưa có busy state riêng.
 *
 * Đây thuần tuý là tín hiệu hiển thị:
 * - không tham gia authorization, retry, tenant continuity hay idempotency;
 * - không giữ dữ liệu nghiệp vụ, chỉ giữ một bộ đếm request đang bay;
 * - module thuần (không import store/hook) để `lib/api/core.ts` không tạo chu
 *   kỳ import — cùng kiểu seam như `src/lib/syncTrigger.ts`.
 */

type BackendActivityListener = () => void

let pendingCount = 0
const listeners = new Set<BackendActivityListener>()

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Một listener lỗi không được phá request đang bay.
    }
  }
}

/** Bắt đầu một request backend đang chờ máy chủ phản hồi. */
export function beginBackendActivity(): void {
  pendingCount += 1
  notifyListeners()
}

/** Kết thúc một request (resolve, reject, abort hay retry đều phải gọi). */
export function endBackendActivity(): void {
  if (pendingCount > 0) pendingCount -= 1
  notifyListeners()
}

/** Số request backend đang bay tại thời điểm gọi. */
export function getBackendActivityCount(): number {
  return pendingCount
}

/** Subscribe cho `useSyncExternalStore`; trả về hàm huỷ đăng ký. */
export function subscribeBackendActivity(listener: BackendActivityListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Bao một logical request bằng begin/end. Dùng `finally` nên request bị abort,
 * lỗi mạng, hay retry nội bộ vẫn luôn nhả bộ đếm — chỉ báo không bị kẹt.
 */
export async function runWithBackendActivity<T>(task: () => Promise<T>): Promise<T> {
  beginBackendActivity()
  try {
    return await task()
  } finally {
    endBackendActivity()
  }
}

/**
 * Reset bộ đếm về 0. Chỉ dùng cho test (mỗi test tự cô lập state module-level).
 * Không gọi trong luồng nghiệp vụ: mọi request thật đều tự nhả bộ đếm qua
 * `runWithBackendActivity` hoặc timeout của transport.
 */
export function resetBackendActivity(): void {
  if (pendingCount === 0) return
  pendingCount = 0
  notifyListeners()
}
