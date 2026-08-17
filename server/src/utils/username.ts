// ADR-027 (2026-08-12): username tự sinh cho tài khoản GLV/Admin —
// cú pháp `chức vụ_Tên thánh + Họ và tên`, bỏ dấu tiếng Việt, nối liền, viết thường.
// Ví dụ: phuta + Tên thánh "Phê-rô" + Họ tên "Phan Văn Bảo" → `glv_pherophanvanbao`.
// Phụ huynh không dùng cú pháp này — username = SĐT chuẩn hóa (quy ước ADR-026).

// SSOT server (mirror client: src/utils/username.ts) — KHÔNG được lệch 2 nơi.
export const ROLE_USERNAME_PREFIX: Record<'chunhiem' | 'phuta' | 'admin', string> = {
  chunhiem: 'cn',
  phuta: 'glv',
  admin: 'ad',
}

const VIETNAMESE_MAP: Record<string, string> = {
  à: 'a', á: 'a', ả: 'a', ã: 'a', ạ: 'a', ă: 'a', ắ: 'a', ằ: 'a', ẳ: 'a', ẵ: 'a', ặ: 'a', â: 'a', ấ: 'a', ầ: 'a', ẩ: 'a', ẫ: 'a', ậ: 'a',
  è: 'e', é: 'e', ẻ: 'e', ẽ: 'e', ẹ: 'e', ê: 'e', ế: 'e', ề: 'e', ể: 'e', ễ: 'e', ệ: 'e',
  ì: 'i', í: 'i', ỉ: 'i', ĩ: 'i', ị: 'i',
  ò: 'o', ó: 'o', ỏ: 'o', õ: 'o', ọ: 'o', ô: 'o', ố: 'o', ồ: 'o', ổ: 'o', ỗ: 'o', ộ: 'o', ơ: 'o', ớ: 'o', ờ: 'o', ở: 'o', ỡ: 'o', ợ: 'o',
  ù: 'u', ú: 'u', ủ: 'u', ũ: 'u', ụ: 'u', ư: 'u', ứ: 'u', ừ: 'u', ử: 'u', ữ: 'u', ự: 'u',
  ý: 'y', ỳ: 'y', ỷ: 'y', ỹ: 'y', ỵ: 'y',
  đ: 'd',
}

/** Bỏ dấu tiếng Việt (kể cả ký tự hoa) → chữ cái latin thuần. */
export function removeDiacritics(input: string): string {
  return (input || '')
    .normalize('NFC')
    .split('')
    .map((ch) => {
      const lower = ch.toLowerCase()
      const mapped = VIETNAMESE_MAP[lower]
      if (mapped) return ch === lower ? mapped : mapped.toUpperCase()
      return ch
    })
    .join('')
}

/**
 * Xây username tự động theo ADR-027:
 * `prefix + '_' + TênThánh + ToànBộHọTên` — chỉ giữ [a-z0-9] (bỏ dấu, khoảng trắng,
 * dấu '-'/'’' như "Phê-rô", ký tự đặc biệt). BẮT BUỘC đủ cả Tên Thánh lẫn Họ tên —
 * thiếu một trong hai → '' (server trả HOLY_NAME_REQUIRED).
 */
export function buildAutoUsername(
  role: 'admin' | 'chunhiem' | 'phuta' | 'phuhuynh',
  holyName: string,
  fullName: string,
): string {
  if (role === 'phuhuynh') return ''
  const prefix = ROLE_USERNAME_PREFIX[role]
  const holy = removeDiacritics(holyName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const name = removeDiacritics(fullName || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!prefix || !holy || !name) return ''
  return `${prefix}_${holy}${name}`
}

/** SĐT hợp lệ dùng làm username phụ huynh (chuẩn ADR-026/PARENT_PHONE_RE). */
export function isValidVnPhone(phone: string): boolean {
  return /^0\d{9}$/.test(phone)
}
