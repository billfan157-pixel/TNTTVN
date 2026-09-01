import { describe, expect, it } from 'vitest'
import { scopeClassesForAssignedWrites, type ClassListItem } from '../stores/classStore'

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
})
