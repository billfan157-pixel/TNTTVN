import { describe, it, expect } from 'vitest'
import {
  calculateEaster,
  getLiturgicalCycles,
  getLiturgicalDay,
  getUpcomingSolemnities,
} from '../../utils/liturgicalEngine'

describe('liturgicalEngine Unit Tests (HĐGMVN & IGMR Standard)', () => {
  it('calculateEaster tính chính xác ngày Lễ Phục Sinh theo thuật toán Computus', () => {
    // 2025: 20 Tháng 4
    const easter2025 = calculateEaster(2025)
    expect(easter2025.getUTCFullYear()).toBe(2025)
    expect(easter2025.getUTCMonth() + 1).toBe(4)
    expect(easter2025.getUTCDate()).toBe(20)

    // 2026: 05 Tháng 4
    const easter2026 = calculateEaster(2026)
    expect(easter2026.getUTCFullYear()).toBe(2026)
    expect(easter2026.getUTCMonth() + 1).toBe(4)
    expect(easter2026.getUTCDate()).toBe(5)

    // 2027: 28 Tháng 3
    const easter2027 = calculateEaster(2027)
    expect(easter2027.getUTCFullYear()).toBe(2027)
    expect(easter2027.getUTCMonth() + 1).toBe(3)
    expect(easter2027.getUTCDate()).toBe(28)
  })

  it('getLiturgicalCycles xác định đúng Năm A/B/C và Năm I/II', () => {
    // Tháng 8/2026 -> Thuộc Năm Phụng Vụ 2025-2026 (Năm A / Năm II)
    const aug2026 = getLiturgicalCycles(new Date(Date.UTC(2026, 7, 15)))
    expect(aug2026.sundayCycle).toBe('A')
    expect(aug2026.weekdayCycle).toBe('II')

    // Tháng 12/2026 (sau Mùa Vọng) -> Thuộc Năm Phụng Vụ 2026-2027 (Năm B / Năm I)
    const dec2026 = getLiturgicalCycles(new Date(Date.UTC(2026, 11, 15)))
    expect(dec2026.sundayCycle).toBe('B')
    expect(dec2026.weekdayCycle).toBe('I')
  })

  it('getLiturgicalDay nhận diện đúng các Lễ Trọng và Lễ Riêng Việt Nam', () => {
    // 1. Lễ Đức Mẹ Hồn Xác Lên Trời (15/8)
    const aug15 = getLiturgicalDay('2026-08-15')
    expect(aug15.title).toContain('Đức Mẹ Hồn Xác Lên Trời')
    expect(aug15.rank).toBe('SOLEMNITY')
    expect(aug15.color).toBe('WHITE')
    expect(aug15.isHolyDayOfObligation).toBe(true)

    // 2. Lễ Các Thánh Tử Đạo Việt Nam (24/11 - Lễ Trọng màu Đỏ)
    const nov24 = getLiturgicalDay('2026-11-24')
    expect(nov24.title).toContain('Các Thánh Tử Đạo Việt Nam')
    expect(nov24.rank).toBe('SOLEMNITY')
    expect(nov24.color).toBe('RED')

    // 3. Lễ Thánh Giuse (19/3 - Bổn Mạng Giáo Hội VN)
    const mar19 = getLiturgicalDay('2026-03-19')
    expect(mar19.title).toContain('Thánh Giuse')
    expect(mar19.rank).toBe('SOLEMNITY')
    expect(mar19.color).toBe('WHITE')

    // 4. Lễ Giáng Sinh (25/12)
    const dec25 = getLiturgicalDay('2026-12-25')
    expect(dec25.title).toContain('Chúa Giáng Sinh')
    expect(dec25.season).toBe('CHRISTMAS')
    expect(dec25.color).toBe('WHITE')
    expect(dec25.rank).toBe('SOLEMNITY')
  })

  it('getUpcomingSolemnities trả về danh sách các Lễ Trọng tiếp theo', () => {
    const list = getUpcomingSolemnities(new Date(Date.UTC(2026, 7, 1)), 5)
    expect(list.length).toBeGreaterThan(0)
    expect(list[0].rank).toBe('SOLEMNITY')
  })
})
