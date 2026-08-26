export const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=[\]{};:'",.<>?/\\|`~]/

export function validatePassword(pass: string): string | null {
  if (pass.length < 8) return 'Mật khẩu phải có ít nhất 8 ký tự'
  if (!/[A-Z]/.test(pass)) return 'Mật khẩu phải có ít nhất 1 chữ HOA'
  if (!/[0-9]/.test(pass)) return 'Mật khẩu phải có ít nhất 1 chữ số'
  if (!SPECIAL_CHAR_REGEX.test(pass)) return 'Mật khẩu phải có ít nhất 1 ký tự đặc biệt'
  return null
}
