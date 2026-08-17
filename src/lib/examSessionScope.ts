/** Chuẩn hóa filter toàn cục dùng sentinel `all` cho luồng phiên chấm.
 * `null` có nghĩa tải toàn bộ phiên mà server cho phép xem. */
export function normalizeExamSessionClassFilter(classId: string | null | undefined): string | null {
  return classId && classId !== 'all' ? classId : null
}
