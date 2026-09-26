import { describe, expect, it } from 'vitest'
import {
  scopeClassesForAssignedWrites,
  getAssignedClassIds,
  canUserAccessClass,
  canUserEditStudent,
  type ClassListItem,
} from '../stores/classStore'

const classes = [
  { id: 'assigned', name: 'Assigned', assignedToCurrentUser: true },
  { id: 'foreign', name: 'Foreign', assignedToCurrentUser: false },
] as ClassListItem[]

describe('class assignment write scope', () => {
  it('keeps every class for admin writers', () => {
    expect(scopeClassesForAssignedWrites(classes, 'admin')).toEqual(classes)
  })

  it('fails closed to assigned classes for catechists when markers are present', () => {
    expect(scopeClassesForAssignedWrites(classes, 'chunhiem').map(item => item.id)).toEqual(['assigned'])
  })

  it('keeps compatibility with legacy already-scoped class responses', () => {
    const legacy = classes.map(({ assignedToCurrentUser: _marker, ...item }) => item) as ClassListItem[]
    expect(scopeClassesForAssignedWrites(legacy, 'phuta')).toEqual(legacy)
  })

  it('enforces class access and student editing boundaries for catechists', () => {
    expect(getAssignedClassIds(classes, 'chunhiem')).toEqual(new Set(['assigned']))
    expect(canUserAccessClass('assigned', classes, 'chunhiem')).toBe(true)
    expect(canUserAccessClass('foreign', classes, 'chunhiem')).toBe(false)
    expect(canUserAccessClass('foreign', classes, 'admin')).toBe(true)

    expect(canUserEditStudent({ classId: 'assigned' }, classes, 'chunhiem')).toBe(true)
    expect(canUserEditStudent({ classId: 'foreign' }, classes, 'chunhiem')).toBe(false)
    expect(canUserEditStudent({ classId: 'foreign' }, classes, 'admin')).toBe(true)
    expect(canUserEditStudent(null, classes, 'chunhiem')).toBe(false)
  })
})
