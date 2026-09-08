export const OPERATIONS_POSITION_CODES = [
  'PARISH_LEADER',
  'BRANCH_LEADER',
  'COMMITTEE_LEADER',
] as const

export type OperationsPositionCode = (typeof OPERATIONS_POSITION_CODES)[number]
export type OperationsPositionUnitType = 'BOARD' | 'COMMITTEE' | 'BRANCH' | 'CHAPTER' | 'OTHER'

export function isOperationsPositionValidForUnit(
  positionCode: OperationsPositionCode,
  unitType: OperationsPositionUnitType | null,
): boolean {
  if (positionCode === 'PARISH_LEADER') return unitType === null || unitType === 'BOARD'
  if (positionCode === 'BRANCH_LEADER') return unitType === 'BRANCH'
  return unitType === 'COMMITTEE'
}
