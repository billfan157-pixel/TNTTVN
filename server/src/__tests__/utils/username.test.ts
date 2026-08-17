import { describe, it, expect } from 'vitest'
import { buildAutoUsername, removeDiacritics, isValidVnPhone, ROLE_USERNAME_PREFIX } from '../../utils/username.js'

// ADR-027 (2026-08-12): username tự sinh `chức vụ_Tên thánh + Họ và tên`.
describe('buildAutoUsername (ADR-027)', () => {
  it('phuta → prefix glv; ví dụ real: Phê-rô + Phan Văn Bảo → glv_pherophanvanbao', () => {
    expect(buildAutoUsername('phuta', 'Phê-rô', 'Phan Văn Bảo')).toBe('glv_pherophanvanbao')
  })

  it('chunhiem → cn, admin → ad (prefix theo role thật)', () => {
    expect(ROLE_USERNAME_PREFIX).toEqual({ chunhiem: 'cn', phuta: 'glv', admin: 'ad' })
    expect(buildAutoUsername('chunhiem', 'Giuse', 'Trần Thị Hoa')).toBe('cn_giusetranthihoa')
    expect(buildAutoUsername('admin', 'Anna', 'Nguyễn Kim')).toBe('ad_annanguyenkim')
  })

  it('bỏ dấu tiếng Việt + nối liền + viết thường (đ→d, ô→o, ư/ự→u)', () => {
    expect(removeDiacritics('Phêrô Vũ Đức Ước Thượng')).toBe('Phero Vu Duc Uoc Thuong')
    expect(buildAutoUsername('phuta', 'Phêrô', 'Vũ Đức Ước')).toBe('glv_pherovuducuoc')
  })

  it('loại ký tự đặc biệt/space (dấu "-" trong "Phê-rô", dấu cách, dấu nháy)', () => {
    expect(buildAutoUsername('phuta', 'Phê-rô', "Maria Mary's Nguyễn")).toBe('glv_pheromariamarysnguyen')
    expect(buildAutoUsername('phuta', '  Tô-ma  ', '  Nguyễn   Văn  A  ')).toBe('glv_tomanguyenvana')
  })

  it('chữ hoa vẫn bỏ dấu đúng (PHÊ-RÔ → phero)', () => {
    expect(buildAutoUsername('phuta', 'PHÊ-RÔ', 'NGUYỄN ĐỨC HẢI')).toBe('glv_pheronguyenduchai')
  })

  it('phuhuynh KHÔNG dùng cú pháp này — trả rỗng (username = SĐT, ADR-026)', () => {
    expect(buildAutoUsername('phuhuynh', 'Giuse', 'Nguyễn Văn A')).toBe('')
  })

  it('thiếu holyName/fullName → trả rỗng (không sinh username rác)', () => {
    expect(buildAutoUsername('phuta', '', 'Nguyễn A')).toBe('')
    expect(buildAutoUsername('phuta', 'Giuse', '')).toBe('')
  })
})

describe('isValidVnPhone (ADR-027 mirror ADR-026 PARENT_PHONE_RE)', () => {
  it('chỉ chấp nhận 10 số bắt đầu 0', () => {
    expect(isValidVnPhone('0901234567')).toBe(true)
    expect(isValidVnPhone('090123456')).toBe(false)
    expect(isValidVnPhone('1901234567')).toBe(false)
    expect(isValidVnPhone('09012345678')).toBe(false)
    expect(isValidVnPhone('')).toBe(false)
  })
})