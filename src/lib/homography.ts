/**
 * Smart Exam Grading — Homography (Phase 2 OMR POC).
 * Ma trận 3×3 biến đổi phối cảnh từ 4 điểm tương ứng (DLT — Direct Linear Transform),
 * giải hệ 8×8 bằng Gaussian elimination (chuẩn hóa điểm trước để ổn định số).
 * KHÔNG dùng bilinear "interpolation" tay — perspective transform đúng chuẩn (plan §12).
 */

export type Mat3 = [number, number, number, number, number, number, number, number, number]
export type Vec2 = { x: number; y: number }

interface Pt { x: number; y: number }

export function matMul3(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ]
}

/** Áp dụng homography lên điểm (phép chia projective). */
export function applyHomography(H: Mat3, p: Pt): Pt {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  if (Math.abs(w) < 1e-12) return { x: NaN, y: NaN }
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  }
}

/**
 * Đảo homography: nghịch đảo ma trận 3×3 (adjugate / det), chuẩn hóa h33=1.
 * H·H⁻¹ = I. Trả null nếu suy biến.
 */
export function invertHomography(H: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = H
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const D = -(b * i - c * h)
  const E = a * i - c * g
  const F = -(a * h - b * g)
  const G = b * f - c * e
  const H_ = -(a * f - c * d)
  const I = a * e - b * d
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) return null
  const inv = [A, D, G, B, E, H_, C, F, I].map(v => v / det) as Mat3
  if (Math.abs(inv[8]) < 1e-12) return null
  return inv.map(v => v / inv[8]) as Mat3
}

/**
 * Tính ma trận homography H: src → dst từ 4 điểm tương ứng.
 * DLT chuẩn hóa đối xứng (scale points về ~1 quanh centroid) để ổn định số,
 * solve 8×8 bằng Gaussian elimination, H maps src normalized → dst normalized
 * rồi denormalize lại.
 */
export function computeHomography(src: Pt[], dst: Pt[]): Mat3 | null {
  if (src.length !== 4 || dst.length !== 4) return null

  // Chuẩn hóa: T_src (affine scale+shift), T_dst tương ứng → cả hai về centroid+scale 1
  const sC = centroid(src)
  const dC = centroid(dst)
  let sScale = 0
  let dScale = 0
  for (const p of src) sScale = Math.max(sScale, dist(p, sC))
  for (const p of dst) dScale = Math.max(dScale, dist(p, dC))
  if (sScale < 1e-9 || dScale < 1e-9) return null

  const nsrc = src.map(p => ({ x: (p.x - sC.x) / sScale, y: (p.y - sC.y) / sScale }))
  const ndst = dst.map(p => ({ x: (p.x - dC.x) / dScale, y: (p.y - dC.y) / dScale }))

  // DLT: với mỗi cặp (u,v)→(x,y):
  //   (x)[ -u, -v, -1, 0,  0,  0, x*u, x*v ]h = -x
  //   (y)[  0,  0,  0, -u, -v, -1, y*u, y*v ]h = -y
  // 8 ẩn, lấy h33 = 1 (điều kiện chuẩn hóa còn lại qua ma trận Ĥ).
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = nsrc[i]
    const { x, y } = ndst[i]
    A.push([-u, -v, -1, 0, 0, 0, x * u, x * v])
    b.push(-x)
    A.push([0, 0, 0, -u, -v, -1, y * u, y * v])
    b.push(-y)
  }
  const h9 = solveLinearN(A, b)
  if (!h9) return null

  // Ĥ maps normalized src → normalized dst
  const Hhat: Mat3 = [h9[0], h9[1], h9[2], h9[3], h9[4], h9[5], h9[6], h9[7], 1]

  // H = D⁻¹ · Ĥ · S
  // S: src_real → src_norm (chia scale, trừ centroid); D⁻¹: dst_norm → dst_real (nhân scale, cộng centroid)
  const S: Mat3 = [1 / sScale, 0, -sC.x / sScale, 0, 1 / sScale, -sC.y / sScale, 0, 0, 1]
  const Dinv: Mat3 = [dScale, 0, dC.x, 0, dScale, dC.y, 0, 0, 1]
  const H = matMul3(Dinv, matMul3(Hhat, S))
  if (Math.abs(H[8]) < 1e-9) return null
  return H.map(v => v / H[8]) as Mat3
}

function centroid(pts: Pt[]): Pt {
  return {
    x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
    y: pts.reduce((a, p) => a + p.y, 0) / pts.length,
  }
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Gaussian elimination N×N with partial pivot — trả vector nghiệm | null. */
function solveLinearN(rows: number[][], rhs: number[]): number[] | null {
  const n = rows.length
  const M = rows.map((row, i) => [...row, rhs[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    }
    if (Math.abs(M[piv][col]) < 1e-12) return null
    ;[M[col], M[piv]] = [M[piv], M[col]]
    const pivot = M[col][col]
    for (let c = 0; c <= n; c++) M[col][c] /= pivot
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = M[r][col]
      if (f === 0) continue
      for (let c = 0; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  return M.map(row => row[n])
}