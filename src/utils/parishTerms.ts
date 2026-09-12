import type { ParishServiceTerm, ParishUnitType } from '../types/parishProfile'

// Shared display helpers for service terms (nhiệm kỳ).
// Authority truth stays server-side: `positionTitle` never grants rights,
// only `positionCode` + active term + matching unit type does.
// These helpers only decide display order/badges from already-fetched data.

export function hasCoordinationRole(term: Pick<ParishServiceTerm, 'positionCode'>): boolean {
  return Boolean(term.positionCode)
}

export const PARISH_POSITION_TITLE_OPTIONS: Record<ParishUnitType, readonly string[]> = {
  BOARD: ['Trưởng Xứ đoàn', 'Phó đặc trách Huấn luyện', 'Phó đặc trách Quản trị', 'Phó Xứ đoàn 1', 'Phó Xứ đoàn 2', 'Thư ký', 'Thủ quỹ', 'Ủy viên'],
  BRANCH: ['Trưởng ngành', 'Phó ngành', 'GLV Ngành'],
  COMMITTEE: ['Trưởng ban', 'Phó ban', 'Thành viên ban', 'Ủy viên'],
  CHAPTER: ['Chi đoàn trưởng / GLV Chủ nhiệm', 'GLV Phụ tá', 'Huynh trưởng Chi đoàn'],
  OTHER: ['Trợ tá', 'Cộng tác viên', 'Ban Phụ huynh'],
}

export const PARISH_RANK_TITLE_SUGGESTIONS: readonly string[] = [
  'Dự trưởng',
  'Huynh trưởng Cấp I',
  'Huynh trưởng Cấp II',
  'Huynh trưởng Cấp III',
  'Huấn luyện viên',
  'Trợ tá',
]

const CODE_RANK: Record<string, number> = {
  PARISH_LEADER: 0,
  PARISH_SECRETARY: 1,
  PARISH_DEPUTY: 2,
  BRANCH_LEADER: 10,
  BRANCH_DEPUTY: 11,
  COMMITTEE_LEADER: 10,
  COMMITTEE_DEPUTY: 11,
}

const TITLE_RANK: Record<string, number> = {
  'phó đặc trách huấn luyện': 1,
  'phó huấn luyện': 1,
  'phó xứ đoàn 1': 1,
  'phó 1': 1,
  'phó đặc trách quản trị': 2,
  'phó quản trị': 2,
  'phó xứ đoàn 2': 2,
  'phó 2': 2,
  'thư ký': 3,
  'thủ quỹ': 4,
  'ủy viên': 5,
  'phó ngành': 11,
  'phó ban': 11,
  'chi đoàn trưởng / glv chủ nhiệm': 12,
  'chi đoàn trưởng': 12,
  'glv chủ nhiệm': 12,
  'glv phụ tá': 13,
}

function codeRank(term: Pick<ParishServiceTerm, 'positionCode' | 'positionTitle'>): number {
  if (!hasCoordinationRole(term)) return TITLE_RANK[term.positionTitle.trim().toLocaleLowerCase('vi')] ?? 20
  return CODE_RANK[term.positionCode as string] ?? 1
}

/** Sort leaders with coordination rights first, then by newest start, then title. */
export function compareTermsByAuthority(
  a: Pick<ParishServiceTerm, 'positionCode' | 'startDate' | 'positionTitle'>,
  b: Pick<ParishServiceTerm, 'positionCode' | 'startDate' | 'positionTitle'>,
): number {
  const rank = codeRank(a) - codeRank(b)
  if (rank !== 0) return rank
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? 1 : -1
  return a.positionTitle.localeCompare(b.positionTitle, 'vi')
}

export function sortTermsByAuthority<T extends Pick<ParishServiceTerm, 'positionCode' | 'startDate' | 'positionTitle'>>(terms: T[]): T[] {
  return [...terms].sort(compareTermsByAuthority)
}

/** A term is in effect on `today` (YYYY-MM-DD) when started and not yet ended. */
export function isTermActiveOn(
  term: Pick<ParishServiceTerm, 'startDate' | 'endDate'>,
  today: string,
): boolean {
  return term.startDate <= today && (!term.endDate || term.endDate >= today)
}
