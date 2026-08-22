/**
 * Registry toàn cục cho các modal đang mở (PHA 1 — audit desktop 2026-08-22).
 *
 * Vấn đề trước đây: mỗi modal tự gắn document-level Escape listener riêng,
 * không có arbitration → khi ConfirmDialog chồng trên một modal khác, MỘT lần
 * nhấn Esc đóng CẢ HAI (audit finding A20).
 *
 * Giải pháp: mọi dialog đăng ký vào stack khi mở. Escape chỉ được xử lý bởi
 * dialog ở ĐỈNH stack (top-most). Thứ tự push/pop tuân theo lifecycle effect,
 * an toàn với StrictMode double-invoke và trùng lặp id.
 */
const stack: string[] = []

/** Đăng ký modal khi mở. Gọi trong effect setup, đi kèm `popModal` trong cleanup. */
export function pushModal(id: string): void {
  stack.push(id)
}

/** Hủy đăng ký khi đóng/unmount (xóa đúng slot của id, giữ slot khác nguyên vẹn). */
export function popModal(id: string): void {
  const idx = stack.lastIndexOf(id)
  if (idx !== -1) stack.splice(idx, 1)
}

/** true nếu id này là modal đang ở đỉnh stack — chỉ top-most được nhận Escape. */
export function isTopModal(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id
}
