import { describe, expect, it } from 'vitest'
import { isSqliteBusyError } from '../db/sqliteErrors.js'

describe('SQLite contention error detection', () => {
  it('detects a direct SQLITE_BUSY error', () => {
    expect(isSqliteBusyError({ code: 'SQLITE_BUSY' })).toBe(true)
  })

  it('detects a Drizzle-style wrapped LibsqlError through cause', () => {
    const driverError = Object.assign(new Error('database is locked'), {
      code: 'SQLITE_BUSY',
      extendedCode: 'SQLITE_BUSY_SNAPSHOT',
    })
    const queryError = Object.assign(new Error('Failed query: UPDATE ...'), {
      cause: driverError,
    })

    expect(isSqliteBusyError(queryError)).toBe(true)
  })

  it('does not classify unrelated wrapped errors as contention', () => {
    const constraint = Object.assign(new Error('constraint'), { code: 'SQLITE_CONSTRAINT' })
    const queryError = Object.assign(new Error('Failed query'), { cause: constraint })

    expect(isSqliteBusyError(queryError)).toBe(false)
  })
})
