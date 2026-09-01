/** Chuẩn hóa filter toàn cục dùng sentinel `all` cho luồng phiên chấm.
 * `null` có nghĩa tải toàn bộ phiên mà server cho phép xem. */
export function normalizeExamSessionClassFilter(classId: string | null | undefined): string | null {
  return classId && classId !== 'all' ? classId : null
}

type ExamWorkspaceClass = {
  id: string
  assignedToCurrentUser?: boolean
}

/**
 * Restrict class-scoped exam controls to the signed-in staff member's own
 * assignments while keeping compatibility with the previous API, which
 * returned an already-filtered class list without assignment markers.
 * Once any marker is present, unmarked rows are excluded (fail closed).
 */
export function scopeExamWorkspaceClasses<T extends ExamWorkspaceClass>(classes: T[], isAdmin: boolean): T[] {
  if (isAdmin) return classes
  const hasAssignmentMarkers = classes.some(item => typeof item.assignedToCurrentUser === 'boolean')
  return hasAssignmentMarkers
    ? classes.filter(item => item.assignedToCurrentUser === true)
    : classes
}
