import { describe, it, expect } from 'vitest'
import { generateId } from '../../lib/id'

describe('generateId (client)', () => {
  it('returns an ID with the given prefix', () => {
    const id = generateId('ST')
    expect(id).toMatch(/^ST-[a-f0-9]+$/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('GR')))
    expect(ids.size).toBe(100)
  })

  it('handles different prefixes', () => {
    expect(generateId('USR')).toMatch(/^USR-/)
    expect(generateId('CLS')).toMatch(/^CLS-/)
  })
})
