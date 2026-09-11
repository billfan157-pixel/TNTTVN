import { describe, expect, it } from 'vitest'
import { PARISH_POSITION_TITLE_OPTIONS, sortTermsByAuthority } from '../../utils/parishTerms'
import type { ParishServiceTerm } from '../../types/parishProfile'

function term(id: string, positionTitle: string, positionCode: ParishServiceTerm['positionCode']): ParishServiceTerm {
  return {
    id, parishId: 'p', personId: `person-${id}`, unitId: 'unit', positionTitle, positionCode,
    rankTitle: null, startDate: '2026-01-01', endDate: null, notes: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  }
}

describe('parish organization position presentation', () => {
  it('keeps the approved Executive Board order without granting display titles authority', () => {
    expect(PARISH_POSITION_TITLE_OPTIONS.BOARD).toEqual([
      'Trưởng Xứ đoàn', 'Phó đặc trách Huấn luyện', 'Phó đặc trách Quản trị', 'Phó Xứ đoàn 1', 'Phó Xứ đoàn 2', 'Thư ký', 'Thủ quỹ', 'Ủy viên',
    ])
    const sorted = sortTermsByAuthority([
      term('member', 'Ủy viên', null),
      term('treasurer', 'Thủ quỹ', null),
      term('leader', 'Trưởng Xứ đoàn', 'PARISH_LEADER'),
      term('deputy-2', 'Phó Xứ đoàn 2', null),
      term('secretary', 'Thư ký', null),
      term('deputy-1', 'Phó Xứ đoàn 1', null),
    ])
    expect(sorted.map(item => item.id)).toEqual(['leader', 'deputy-1', 'deputy-2', 'secretary', 'treasurer', 'member'])
    expect(sorted.filter(item => item.positionCode !== null).map(item => item.id)).toEqual(['leader'])
  })

  it('models Branch Leader and Committee Leader as equal-rank parallel positions', () => {
    const sorted = sortTermsByAuthority([
      term('committee', 'Trưởng ban', 'COMMITTEE_LEADER'),
      term('branch', 'Trưởng ngành', 'BRANCH_LEADER'),
    ])
    expect(new Set(sorted.map(item => item.positionCode))).toEqual(new Set(['BRANCH_LEADER', 'COMMITTEE_LEADER']))
    expect(PARISH_POSITION_TITLE_OPTIONS.COMMITTEE).toContain('Phó ban')
  })
})
