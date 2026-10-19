/**
 * Khối nội dung của Ngân hàng đề thi (VD "Thiếu Nhi 1" gồm các lớp 1A, 1B).
 * Khối được suy ra từ catalog lớp hiện có, không phải một entity mới trong DB:
 * taxonomy vẫn chỉ lưu `branchId + curriculum_level` dạng text (ADR-096).
 */
export function deriveQuestionBlockLabel(className: string): string {
  const trimmed = className.trim()
  const match = trimmed.match(/(\d+)\s*[A-Za-zÀ-ỹ]*/)
  if (!match || match.index === undefined) return trimmed
  return trimmed.slice(0, match.index + match[1].length).trimEnd()
}
