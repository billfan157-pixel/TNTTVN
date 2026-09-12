export const OPERATIONS_POSITION_CODES = [
  'PARISH_LEADER',
  'PARISH_SECRETARY',
  'PARISH_DEPUTY',
  'BRANCH_LEADER',
  'BRANCH_DEPUTY',
  'COMMITTEE_LEADER',
  'COMMITTEE_DEPUTY',
] as const

export type OperationsPositionCode = (typeof OPERATIONS_POSITION_CODES)[number]
export type OperationsPositionUnitType = 'BOARD' | 'COMMITTEE' | 'BRANCH' | 'CHAPTER' | 'OTHER'

/** Vietnamese UI labels — backend keeps stable English codes (O8). */
export const OPERATIONS_POSITION_CODE_LABELS_VI: Record<OperationsPositionCode, string> = {
  PARISH_LEADER: 'Xứ đoàn trưởng',
  PARISH_SECRETARY: 'Thư ký Xứ đoàn',
  PARISH_DEPUTY: 'Phó Xứ đoàn',
  BRANCH_LEADER: 'Trưởng Ngành',
  BRANCH_DEPUTY: 'Phó Ngành',
  COMMITTEE_LEADER: 'Trưởng Ban',
  COMMITTEE_DEPUTY: 'Phó Ban',
}

export function isOperationsPositionValidForUnit(
  positionCode: OperationsPositionCode,
  unitType: OperationsPositionUnitType | null,
): boolean {
  if (positionCode === 'PARISH_LEADER') return unitType === null || unitType === 'BOARD'
  if (positionCode === 'PARISH_SECRETARY') return unitType === null || unitType === 'BOARD'
  if (positionCode === 'PARISH_DEPUTY') return unitType === null || unitType === 'BOARD'
  if (positionCode === 'BRANCH_LEADER') return unitType === 'BRANCH'
  if (positionCode === 'BRANCH_DEPUTY') return unitType === 'BRANCH'
  if (positionCode === 'COMMITTEE_LEADER') return unitType === 'COMMITTEE'
  return unitType === 'COMMITTEE'
}
