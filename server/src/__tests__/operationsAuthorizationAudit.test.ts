// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  peekOperationsAuthorizationReason,
  rememberOperationsAuthorization,
} from '../services/operationsAuthorization.js'
import type { OperationsDecision } from '../services/operationsAuthorization.js'

function decision(reason: OperationsDecision['reason']): OperationsDecision {
  return { allowed: true, reason, positionTitles: [], unitIds: [], operationRoles: [] }
}

describe('P1-3 authorizationReason tracking per executor', () => {
  it('returns undefined before anything is remembered', () => {
    expect(peekOperationsAuthorizationReason({})).toBeUndefined()
  })

  it('keeps ADMIN_OVERRIDE once recorded on the same executor (multi-assert sticky)', () => {
    const tx = {}
    rememberOperationsAuthorization(tx, decision('ADMIN_OVERRIDE'))
    // A later non-override assert in the same transaction must not hide the override.
    rememberOperationsAuthorization(tx, decision('OPERATION_ROLE'))
    expect(peekOperationsAuthorizationReason(tx)).toBe('ADMIN_OVERRIDE')
  })

  it('records a later ADMIN_OVERRIDE over an earlier business reason', () => {
    const tx = {}
    rememberOperationsAuthorization(tx, decision('POSITION_SCOPE'))
    rememberOperationsAuthorization(tx, decision('ADMIN_OVERRIDE'))
    expect(peekOperationsAuthorizationReason(tx)).toBe('ADMIN_OVERRIDE')
  })

  it('last business decision wins when no override is involved', () => {
    const tx = {}
    rememberOperationsAuthorization(tx, decision('OPERATION_ROLE'))
    rememberOperationsAuthorization(tx, decision('POSITION_SCOPE'))
    expect(peekOperationsAuthorizationReason(tx)).toBe('POSITION_SCOPE')
  })

  it('tracks executors independently', () => {
    const first = {}
    const second = {}
    rememberOperationsAuthorization(first, decision('ADMIN_OVERRIDE'))
    expect(peekOperationsAuthorizationReason(second)).toBeUndefined()
    expect(peekOperationsAuthorizationReason(first)).toBe('ADMIN_OVERRIDE')
  })
})
