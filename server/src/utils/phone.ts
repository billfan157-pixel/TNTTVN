// Chuẩn hóa số điện thoại VN để khớp phụ huynh: bỏ khoảng trắng/gạch nối/dấu,
// đổi đầu +84 thành 0. Dùng cho liên kết phụ huynh ↔ học sinh (users.phone vs students.parentPhone).
export function normalizePhone(phone: string): string {
  return (phone || '')
    .replace(/[\s\-().]/g, '')
    .replace(/^\+84/, '0')
    .trim()
}

// Các dạng biến thể của 1 số điện thoại để truy vấn khớp linh hoạt (0… vs +84…).
export function phoneMatchVariants(phone: string): string[] {
  const normalized = normalizePhone(phone)
  if (!normalized) return []
  const variants = [normalized]
  if (normalized.startsWith('0')) {
    variants.push('+84' + normalized.slice(1))
  } else if (normalized.startsWith('+84')) {
    variants.push('0' + normalized.slice(3))
  }
  return [...new Set(variants)]
}
