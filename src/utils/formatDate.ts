/**
 * Định dạng ngày chuẩn vi-VN cho toàn app (PHA 3 — audit desktop 2026-08-22).
 *
 * Trước đây các màn hình render raw ISO string (`2026-08-22`) lẫn lộn với
 * vi-VN format — audit flag 5 site (Dashboard notices, LeaveRequests,
 * FinancePage ledger, UserManagement lastLoginAt, DesktopNotices).
 *
 * An toàn với: ISO date (`2026-08-22`), ISO datetime, Date object, null/undefined.
 */
export function formatDateVi(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Ngày + giờ (cho timestamp như lastLoginAt, audit log). */
export function formatDateTimeVi(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
