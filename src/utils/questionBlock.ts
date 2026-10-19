import { parseClassHierarchy } from './classSort'
import type { QuestionClassOption } from './questionEditorModel'

/**
 * Khối nội dung của Ngân hàng đề thi (VD "Thiếu Nhi 1" gồm các lớp 1A, 1B).
 * Khối được suy ra từ catalog lớp hiện có, không phải một entity mới trong DB:
 * taxonomy vẫn chỉ lưu `branchId + curriculum_level` dạng text (ADR-096).
 */
export interface QuestionBlockOption {
  id: string
  branchId: string
  label: string
  classNames: string[]
  academicYear: string | null
}

/**
 * Khối của một tên lớp = tên lớp bỏ hậu tố phân ban sau số khối.
 * "Thiếu Nhi 1A" → "Thiếu Nhi 1"; "Thiếu Nhi 1" → "Thiếu Nhi 1";
 * "Chiên Con" (không có số) → "Chiên Con".
 * Phải khớp quy tắc server: `server/src/utils/questionBlock.ts`.
 */
export function deriveQuestionBlockLabel(className: string): string {
  const trimmed = className.trim()
  const match = trimmed.match(/(\d+)\s*[A-Za-zÀ-ỹ]*/)
  if (!match || match.index === undefined) return trimmed
  return trimmed.slice(0, match.index + match[1].length).trimEnd()
}

function pickMajorityLabel(labels: Map<string, number>): string {
  return [...labels.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'))[0][0]
}

/**
 * Gộp catalog lớp thành các lựa chọn khối theo (ngành, số khối).
 * Các lớp cùng ngành cùng số khối (1A, 1B) dùng chung một lựa chọn khối.
 */
export function buildQuestionBlockOptions(classes: QuestionClassOption[]): QuestionBlockOption[] {
  const groups = new Map<string, {
    branchId: string
    gradeNumber: number
    members: Set<string>
    years: Set<string>
    labels: Map<string, number>
  }>()

  for (const cls of classes) {
    const name = cls.name.trim()
    if (!name) continue
    const parsed = parseClassHierarchy(name, cls.branchId)
    const key = parsed.gradeNumber === 999
      ? `name:${name.toLowerCase()}`
      : `grade:${parsed.gradeNumber}`
    const groupId = `${cls.branchId}::${key}`
    let group = groups.get(groupId)
    if (!group) {
      group = { branchId: cls.branchId, gradeNumber: parsed.gradeNumber, members: new Set(), years: new Set(), labels: new Map() }
      groups.set(groupId, group)
    }
    group.members.add(name)
    if (cls.academicYear) group.years.add(cls.academicYear)
    const label = deriveQuestionBlockLabel(name)
    group.labels.set(label, (group.labels.get(label) ?? 0) + 1)
  }

  return [...groups.entries()]
    .map(([id, group]) => ({
      id,
      branchId: group.branchId,
      label: pickMajorityLabel(group.labels),
      classNames: [...group.members].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })),
      academicYear: [...group.years].sort((a, b) => b.localeCompare(a, 'vi', { numeric: true }))[0] ?? null,
      gradeNumber: group.gradeNumber,
    }))
    .sort((a, b) => a.gradeNumber - b.gradeNumber || a.label.localeCompare(b.label, 'vi'))
    .map(({ gradeNumber: _gradeNumber, ...block }) => block)
}

/**
 * Tìm khối tương ứng với taxonomy đã lưu. Khớp theo tên khối trước, sau đó
 * theo tên lớp (dữ liệu cũ gắn theo từng lớp 1A/1B vẫn mở sửa đúng khối).
 */
export function findQuestionBlockForLevel(
  blocks: QuestionBlockOption[],
  curriculumLevel: string | null | undefined,
): QuestionBlockOption | undefined {
  const level = curriculumLevel?.trim()
  if (!level) return undefined
  return blocks.find(block => block.label === level)
    ?? blocks.find(block => block.classNames.includes(level))
}
