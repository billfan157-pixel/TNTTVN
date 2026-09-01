import { describe, expect, it } from 'vitest'
import { normalizeExamSessionClassFilter, scopeExamWorkspaceClasses } from '../examSessionScope'

describe('normalizeExamSessionClassFilter', () => {
  it('chuyển sentinel all thành null để tải các phiên được phép xem', () => {
    expect(normalizeExamSessionClassFilter('all')).toBeNull()
  })

  it('giữ lại ID lớp thật và xử lý null/undefined', () => {
    expect(normalizeExamSessionClassFilter('CL-1')).toBe('CL-1')
    expect(normalizeExamSessionClassFilter(null)).toBeNull()
    expect(normalizeExamSessionClassFilter(undefined)).toBeNull()
  })
})

describe('scopeExamWorkspaceClasses', () => {
  const classCatalog = [
    { id: 'CL-1', assignedToCurrentUser: true },
    { id: 'CL-2', assignedToCurrentUser: false },
    { id: 'CL-3' },
  ]

  it('keeps the full class catalog for admin', () => {
    expect(scopeExamWorkspaceClasses(classCatalog, true)).toEqual(classCatalog)
  })

  it('keeps only explicit assignments for non-admin once the server sends markers', () => {
    expect(scopeExamWorkspaceClasses(classCatalog, false)).toEqual([
      { id: 'CL-1', assignedToCurrentUser: true },
    ])
  })

  it('accepts the legacy server contract because that response was already scoped', () => {
    const legacyAssignedClasses = [{ id: 'CL-1' }, { id: 'CL-2' }]
    expect(scopeExamWorkspaceClasses(legacyAssignedClasses, false)).toEqual(legacyAssignedClasses)
  })
})
