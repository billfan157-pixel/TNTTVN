import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

// A-NEW-19 (2026-08-11): chính sách mật khẩu tập trung.
// - BCRYPT_COST = 12: OWASP khuyến nghị 12+ cho production (10 là tối thiểu/legacy).
//   bcryptjs pure JS: cost 12 ≈ 550ms/compare (benchmark local) — chấp nhận được vì
//   login hiếm + loginRateLimiter 10/60s/IP giới hạn DoS surface.
// - DUMMY_PASSWORD_HASH: precompute lúc boot — consumeDummyPassword() làm cho thời gian
//   response của login "user không tồn tại" ≈ "user tồn tại nhưng sai mật khẩu"
//   (cả 2 đều chạy bcrypt.compare ~cùng cost) → đóng timing oracle username enumeration.
//   Đã kiểm chứng: trước fix gap ≈ 126ms vs <1ms; sau fix gap ≈ 0 (cùng cost 12).
export const BCRYPT_COST = 12

const dummyPasswordHash = bcrypt.hashSync(randomBytes(16).toString('hex'), BCRYPT_COST)

export async function consumeDummyPassword(password: string): Promise<void> {
  await bcrypt.compare(password, dummyPasswordHash)
}

export function isLegacyCostHash(hash: string): boolean {
  // Hash cũ ($2a$10$...) được tạo trước A-NEW-19 → rehash-on-login khi user đăng nhập
  // thành công (migrate dần lên cost 12, pattern OWASP Password Storage §Rehashing).
  return hash.startsWith('$2a$10$') || hash.startsWith('$2b$10$') || hash.startsWith('$2y$10$')
}
