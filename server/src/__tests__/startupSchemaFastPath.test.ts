import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@libsql/client'
import { INDICES, applyIndices } from '../db/bootstrapIndices.js'
import { DEFENSIVE_ALTERS, applyDefensiveSync } from '../db/defensiveSync.js'

function definitionName(statement: string): string {
  const name = statement.match(/^CREATE\s+(?:UNIQUE\s+)?(?:INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+([A-Za-z0-9_]+)/i)?.[1]
  if (!name) throw new Error(`Unrecognized bootstrap definition: ${statement}`)
  return name
}

describe('existing production schema startup', () => {
  it('checks existing indices and triggers in one database call', async () => {
    const names = INDICES.map(definitionName)
    const execute = vi.fn().mockResolvedValue({ rows: names.map(name => ({ name })) })
    await applyIndices({ execute } as unknown as Client)
    expect(execute).toHaveBeenCalledOnce()
    expect(names).toHaveLength(76)
  })

  it('still creates a missing index', async () => {
    const missing = definitionName(INDICES[0])
    const execute = vi.fn().mockResolvedValueOnce({ rows: INDICES.slice(1).map(name => ({ name: definitionName(name) })) })
      .mockResolvedValue({ rows: [] })
    await applyIndices({ execute } as unknown as Client)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute.mock.calls[1][0]).toContain(missing)
  })

  it('checks existing defensive columns in one database call', async () => {
    const rows = DEFENSIVE_ALTERS.map(statement => {
      const match = statement.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i)
      if (!match) throw new Error(`Unrecognized defensive ALTER: ${statement}`)
      return { table_name: match[1], column_name: match[2] }
    })
    const execute = vi.fn().mockResolvedValue({ rows })
    await applyDefensiveSync({ execute } as unknown as Client)
    expect(execute).toHaveBeenCalledOnce()
  })
})
