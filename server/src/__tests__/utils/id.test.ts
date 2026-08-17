import { describe, it, expect } from 'vitest'
import { generateId } from '../../utils/id.js'

describe('generateId (server)', () => {
  it('returns an ID with the given prefix', () => {
    const id = generateId('ST')
    expect(id).toMatch(/^ST-[a-f0-9]+$/)
  })

  it('supports all IdPrefix values', () => {
    const prefixes = ['ST', 'GR', 'AT', 'NC', 'USR', 'AUD', 'NOT', 'CLS', 'ASG', 'IMP', 'CNM', 'IBS', 'GIH', 'MM', 'SA', 'GROV', 'OUT'] as const
    for (const p of prefixes) {
      expect(generateId(p)).toMatch(new RegExp(`^${p}-[a-f0-9]+$`))
    }
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId('AUD')))
    expect(ids.size).toBe(200)
  })
})
