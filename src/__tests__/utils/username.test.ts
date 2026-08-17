import { describe, it, expect } from 'vitest'
import { buildAutoUsername, removeDiacritics, parentUsername, isValidVnPhone } from '../../utils/username'

// ADR-027 (2026-08-12): mirror client của server utils/username.ts (SSOT server).
// Preview realtime trong form tạo tài khoản — kết quả PHẢI khớp server.
describe('buildAutoUsername (client mirror, ADR-027)', () => {
  it('khớp ví dụ real: Phê-rô + Phan Văn Bảo → glv_pherophanvanbao', () => {
    expect(buildAutoUsername('phuta', 'Phê-rô', 'Phan Văn Bảo')).toBe('glv_pherophanvanbao')
  })

  it('prefix theo role: cn_/ad_/glv_', () => {
    expect(buildAutoUsername('chunhiem', 'Giuse', 'Trần Hoa')).toBe('cn_giusetranhoa')
    expect(buildAutoUsername('admin', 'Anna', 'Nguyễn Kim')).toBe('ad_annanguyenkim')
    expect(buildAutoUsername('phuta', 'Phê-rô', 'Phan Bảo')).toBe('glv_pherophanbao')
  })

  it('bỏ dấu + ký tự đặc biệt + viết thường (Phê-rô → phero, đ→d)', () => {
    expect(removeDiacritics('Phê-rô Đức')).toBe('Phe-ro Duc')
    expect(buildAutoUsername('phuta', 'PHÊ-RÔ', 'NGUYỄN ĐỨC HẢI')).toBe('glv_pheronguyenduchai')
  })

  it('phuhuynh không dùng cú pháp này; thiếu dữ liệu → rỗng', () => {
    expect(buildAutoUsername('phuhuynh', 'Giuse', 'Nguyễn A')).toBe('')
    expect(buildAutoUsername('phuta', '', 'Nguyễn A')).toBe('')
    expect(buildAutoUsername('phuta', 'Giuse', '')).toBe('')
  })
})

describe('parentUsername (ADR-026/027)', () => {
  it('username phụ huynh = SĐT chuẩn hóa (+84 → 0, bỏ khoảng trắng/dấu)', () => {
    expect(parentUsername('+84 955 111 333')).toBe('0955111333')
    expect(parentUsername('0955-111-333')).toBe('0955111333')
    expect(parentUsername('')).toBe('')
    expect(isValidVnPhone('0955111333')).toBe(true)
    expect(isValidVnPhone('955111333')).toBe(false)
  })
})