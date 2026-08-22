/**
 * A16 (2026-08-10): che PII khi ghi audit_logs — không lưu dữ liệu nhạy cảm
 * nguyên vẹn vào bảng audit (admin mới đọc được, nhưng PII thừa = rủi ro khi
 * backup/export/leak sau này).
 *
 * Nguyên tắc: che tối thiểu trường liên hệ (parentPhone → giữ 4 số cuối,
 * address → '***'), giữ nguyên phần còn lại để audit truy vết được nghiệp vụ.
 * Áp dụng cho mọi điểm ghi audit chứa row entity học sinh:
 *   - studentService CREATE/UPDATE/SOFT_DELETE
 *   - importService IMPORT_CREATE / IMPORT_UPDATE
 */
const SENSITIVE_STUDENT_FIELDS: Record<string, (value: unknown) => unknown> = {
  parentPhone: maskPhone,
  address: () => '***',
}

function maskPhone(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) return value
  const trimmed = value.trim()
  return trimmed.length > 4 ? `****${trimmed.slice(-4)}` : '****'
}

/** AUDIT-F5 (2026-08-22): che SĐT dùng chung cho mọi loại audit row có liên hệ
 * (student parentPhone, finance personPhone...). Export để service khác tái dùng
 * thay vì lưu plaintext vi phạm A16. */
export function maskPhoneForAudit(value: unknown): unknown {
  return maskPhone(value)
}

export function redactStudentForAudit(row: unknown): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) }
  for (const [field, mask] of Object.entries(SENSITIVE_STUDENT_FIELDS)) {
    if (field in out) out[field] = mask(out[field])
  }
  return out
}