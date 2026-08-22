/**
 * PROMO-FIX (2026-08-22): tính lớp đích khi xét lên lớp cuối năm (server-side).
 *
 * Quy tắc TNTT chuẩn:
 *   1. Cùng ngành, khối lớp +1 — ưu tiên cùng hậu tố phân ban (TN 1A → TN 2A;
 *      nếu năm mới chỉ có TN 2B thì dùng TN 2B).
 *   2. Hết cấp trong ngành (không có khối N+1) → lớp nhập môn của ngành kế tiếp
 *      theo trọng số (AN 3 → TN 1A; TN 5 → NS 1...).
 *   3. Không có lớp phù hợp → null (caller quyết định fallback/giữ nguyên).
 *
 * Trước đây promoteYear map MỌI học sinh về lớp CÙNG MÃ của năm mới — học sinh
 * đạt điều kiện cũng bị giữ nguyên khối thay vì lên lớp.
 */

const KEYWORD_WEIGHTS: Array<[RegExp, number]> = [
  [/chiên|chien/i, 1],
  [/ấu|au/i, 2],
  [/thiếu|thieu/i, 3],
  [/nghĩa|nghia/i, 4],
  [/hiệp|hiep/i, 5],
]

const BRANCH_TYPE_BY_WEIGHT: Record<number, string> = {
  1: 'ChienCon',
  2: 'AuNhi',
  3: 'ThieuNhi',
  4: 'NghiaSi',
  5: 'HiepSi',
}

export interface ParsedPromotionClass {
  weight: number // 1..5, 99 = không xác định
  grade: number // 999 = không có số trong tên
  suffix: string // 'A' | 'B' | '' ...
}

export function parsePromotionClassName(name: string): ParsedPromotionClass {
  const lower = (name || '').toLowerCase()
  let weight = 99
  for (const [re, w] of KEYWORD_WEIGHTS) {
    if (re.test(lower)) {
      weight = w
      break
    }
  }

  const m = lower.match(/(\d+)\s*([a-zà-ỹ]*)/)
  const grade = m ? parseInt(m[1], 10) : 999
  const suffix = (m?.[2] || '').toUpperCase()

  return { weight, grade, suffix }
}

export function branchTypeByWeight(weight: number): string | null {
  return BRANCH_TYPE_BY_WEIGHT[weight] ?? null
}

export interface PromotionCandidateClass {
  id: string
  name: string
}

export interface PromotionTarget {
  id: string
  branchWeight: number
}

/**
 * Tìm lớp đích trong DANH SÁCH LỚP NĂM MỚI cho một lớp nguồn.
 * Ưu tiên: khối+1 cùng hậu tố → khối+1 bất kỳ hậu tố (tên nhỏ trước) →
 * nhập môn ngành kế tiếp (khối thấp nhất). Không tìm thấy → null.
 */
export function findNextClassInYear(
  sourceClassName: string,
  newYearClasses: PromotionCandidateClass[]
): PromotionTarget | null {
  const cur = parsePromotionClassName(sourceClassName)

  if (cur.weight >= 1 && cur.weight <= 5) {
    const sameBranch = newYearClasses.filter((c) => {
      const p = parsePromotionClassName(c.name)
      return p.weight === cur.weight
    })

    const nextGrade = sameBranch.filter((c) => parsePromotionClassName(c.name).grade === cur.grade + 1)
    if (nextGrade.length > 0) {
      const exactSuffix =
        cur.suffix !== '' ? nextGrade.find((c) => parsePromotionClassName(c.name).suffix === cur.suffix) : undefined
      const chosen =
        exactSuffix ||
        [...nextGrade].sort((a, b) => {
          const pa = parsePromotionClassName(a.name)
          const pb = parsePromotionClassName(b.name)
          return pa.suffix.localeCompare(pb.suffix, 'vi') || a.name.localeCompare(b.name, 'vi')
        })[0]
      return { id: chosen.id, branchWeight: cur.weight }
    }

    const nextWeight = cur.weight + 1
    if (nextWeight <= 5) {
      const entry = newYearClasses
        .filter((c) => parsePromotionClassName(c.name).weight === nextWeight)
        .sort((a, b) => {
          const pa = parsePromotionClassName(a.name)
          const pb = parsePromotionClassName(b.name)
          return pa.grade - pb.grade || pa.suffix.localeCompare(pb.suffix, 'vi') || a.name.localeCompare(b.name, 'vi')
        })
      if (entry.length > 0) {
        return { id: entry[0].id, branchWeight: nextWeight }
      }
    }
  }

  return null
}
