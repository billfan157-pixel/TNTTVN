import { describe, it, expect } from 'vitest'
import { scoreToCell, allCells, CORNER_MARKERS, GRID_COLS } from '../answerSheetTemplate'

describe('answerSheetTemplate — SSOT printer + detector', () => {
  it('allCells sinh đủ 11 ô 0..10, vị trí unique', () => {
    const cells = allCells()
    expect(cells).toHaveLength(11)
    expect(cells[0].score).toBe(0)
    expect(cells[10].score).toBe(10)
    const keys = cells.map(c => `${c.x.toFixed(4)}_${c.y.toFixed(4)}`)
    expect(new Set(keys).size).toBe(11)
  })

  it('scoreToCell phân bố 2 hàng: hàng 1 = 0..5, hàng 2 = 6..10', () => {
    expect(scoreToCell(0).row).toBe(0)
    expect(scoreToCell(5).row).toBe(0)
    expect(scoreToCell(6).row).toBe(1)
    expect(scoreToCell(10).row).toBe(1)
    expect(scoreToCell(10).col).toBe(4) // 6..10 → cột 0..4
  })

  it('reject score ngoài 0..10', () => {
    expect(() => scoreToCell(11)).toThrow()
    expect(() => scoreToCell(-1)).toThrow()
  })

  it('4 marker góc không trùng cell — anchor homography tách biệt', () => {
    const cells = allCells()
    for (const m of CORNER_MARKERS) {
      const clash = cells.some(c => Math.abs(c.x - m.x) < 0.10 && Math.abs(c.y - m.y) < 0.10)
      expect(clash, `marker ${m.id} không được trùng ô điểm`).toBe(false)
    }
  })

  it('GRID_COLS = 6 đủ cho hàng dưới 5 ô (6..10)', () => {
    expect(GRID_COLS).toBe(6)
  })
})