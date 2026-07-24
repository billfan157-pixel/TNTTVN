import { describe, it, expect, beforeEach } from 'vitest'
import { useDailyGradeStore } from '../../stores/dailyGradeStore'

describe('DailyGradeStore', () => {
  beforeEach(() => {
    useDailyGradeStore.setState({ entries: [] })
  })

  it('adds a daily grade entry', () => {
    useDailyGradeStore.getState().addEntry('ST-001', 'oral', 8, 1)
    const entries = useDailyGradeStore.getState().entries
    expect(entries).toHaveLength(1)
    expect(entries[0].studentId).toBe('ST-001')
    expect(entries[0].scoreType).toBe('oral')
    expect(entries[0].value).toBe(8)
    expect(entries[0].semester).toBe(1)
    expect(entries[0].id).toBeTruthy()
    expect(entries[0].date).toBeTruthy()
  })

  it('clamps value between 0 and 10', () => {
    useDailyGradeStore.getState().addEntry('ST-001', 'oral', 15, 1)
    expect(useDailyGradeStore.getState().entries[0].value).toBe(10)

    useDailyGradeStore.getState().addEntry('ST-001', 'oral', -5, 1)
    expect(useDailyGradeStore.getState().entries[1].value).toBe(0)
  })

  it('removes an entry by id', () => {
    useDailyGradeStore.getState().addEntry('ST-001', 'oral', 7, 1)
    const id = useDailyGradeStore.getState().entries[0].id
    useDailyGradeStore.getState().removeEntry(id)
    expect(useDailyGradeStore.getState().entries).toHaveLength(0)
  })

  it('computes average correctly', () => {
    const store = useDailyGradeStore.getState()
    store.addEntry('ST-001', 'oral', 8, 1)
    store.addEntry('ST-001', 'oral', 6, 1)
    store.addEntry('ST-001', 'oral', 10, 1)
    store.addEntry('ST-001', 'oral', 7, 1)

    const avg = store.getAverageForStudent('ST-001', 1, 'oral')
    expect(avg).toBe(7.8) // (8+6+10+7)/4 = 7.75 -> rounded to 7.8
  })

  it('returns null for no entries', () => {
    const avg = useDailyGradeStore.getState().getAverageForStudent('ST-999', 1, 'oral')
    expect(avg).toBeNull()
  })

  it('filters by score type', () => {
    const store = useDailyGradeStore.getState()
    store.addEntry('ST-001', 'oral', 8, 1)
    store.addEntry('ST-001', '15m', 9, 1)
    store.addEntry('ST-001', 'oral', 7, 1)

    const oralEntries = store.getEntriesForStudent('ST-001', 1, 'oral')
    expect(oralEntries).toHaveLength(2)

    const allEntries = store.getEntriesForStudent('ST-001', 1)
    expect(allEntries).toHaveLength(3)
  })

  it('does not mix semesters', () => {
    const store = useDailyGradeStore.getState()
    store.addEntry('ST-001', 'oral', 8, 1)
    store.addEntry('ST-001', 'oral', 9, 2)

    const sem1 = store.getEntriesForStudent('ST-001', 1, 'oral')
    expect(sem1).toHaveLength(1)
    expect(sem1[0].value).toBe(8)

    const sem2 = store.getEntriesForStudent('ST-001', 2, 'oral')
    expect(sem2).toHaveLength(1)
    expect(sem2[0].value).toBe(9)
  })
})
