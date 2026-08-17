import { describe, it, expect } from 'vitest'
import { computeHomography, applyHomography, invertHomography, matMul3, type Mat3, type Vec2 } from '../homography'

function approx(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) < eps
}

function expectVecEq(a: Vec2, b: Vec2, eps = 1e-4) {
  expect(approx(a.x, b.x, eps), `x: ${a.x} vs ${b.x}`).toBe(true)
  expect(approx(a.y, b.y, eps), `y: ${a.y} vs ${b.y}`).toBe(true)
}

describe('homography — Phase 2 OMR core', () => {
  it('identity: 4 điểm không đổi → H ~ I', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ]
    const H = computeHomography(pts, pts)
    expect(H).not.toBeNull()
    for (const p of pts) {
      const q = applyHomography(H!, p)
      expectVecEq(q, p, 1e-6)
    }
  })

  it('đổi 4 điểm → homography 2D affine đúng (scale+shift)', () => {
    const src = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ]
    const dst = [
      { x: 10, y: 5 }, { x: 30, y: 5 }, { x: 30, y: 25 }, { x: 10, y: 25 },
    ]
    const H = computeHomography(src, dst)
    expect(H).not.toBeNull()
    // center: (0.5, 0.5) → (20, 15)
    const c = applyHomography(H!, { x: 0.5, y: 0.5 })
    expectVecEq(c, { x: 20, y: 15 }, 1e-6)
  })

  it('perspective: skew quad → các điểm trong quad map đúng xấp xỉ', () => {
    const src: Vec2[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ]
    const dst: Vec2[] = [
      { x: 0, y: 0 }, { x: 1, y: 0.1 }, { x: 0.9, y: 1 }, { x: 0, y: 1 },
    ]
    const H = computeHomography(src, dst)
    expect(H).not.toBeNull()
    src.forEach((p, i) => {
      const q = applyHomography(H!, p)
      expectVecEq(q, dst[i], 1e-4)
    })
    // inside → vẫn inside
    const mid = applyHomography(H!, { x: 0.5, y: 0.5 })
    expect(mid.x).toBeGreaterThan(0)
    expect(mid.x).toBeLessThan(1)
    expect(mid.y).toBeGreaterThan(0)
    expect(mid.y).toBeLessThan(1)
  })

  it('invertHomography: H·H⁻¹ ≈ I (roundtrip điểm)', () => {
    const src: Vec2[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ]
    const dst: Vec2[] = [
      { x: 0.2, y: -0.1 }, { x: 1.1, y: 0.3 }, { x: 0.8, y: 1.2 }, { x: -0.1, y: 0.9 },
    ]
    const H = computeHomography(src, dst)!
    const Hinv = invertHomography(H)
    expect(Hinv).not.toBeNull()
    for (const p of src) {
      const roundTrip = applyHomography(Hinv!, applyHomography(H, p))
      expectVecEq(roundTrip, p, 1e-6)
    }
  })

  it('matMul3 mang đúng phép hợp', () => {
    const A: Mat3 = [2, 0, 1, 0, 2, 1, 0, 0, 1]
    const B: Mat3 = [1, 0, 3, 0, 1, 4, 0, 0, 1]
    const C = matMul3(A, B)
    expect(C[0]).toBe(2)
    expect(C[1]).toBe(0)
    expect(C[2]).toBe(2 * 3 + 1)
    expect(C[4]).toBe(2)
    expect(C[5]).toBe(2 * 4 + 1)
  })

  it('suy biến: 3 điểm thẳng hàng → null', () => {
    const line: Vec2[] = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0.1 },
    ]
    const dst: Vec2[] = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 1 },
    ]
    const H = computeHomography(line, dst)
    expect(H).toBeNull()
  })
})