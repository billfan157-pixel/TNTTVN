import { describe, expect, it } from 'vitest'
import {
  buildGradePolicyAuditRecord,
  buildGradePolicySnapshot,
  diffGradePolicies,
  summarizeGradeDelta,
  DEFAULT_GRADE_POLICY_WEIGHTS,
} from '../../utils/gradePolicy'

describe('grade policy versioning', () => {
  it('creates a versioned snapshot with the active weights and thresholds', () => {
    const snapshot = buildGradePolicySnapshot({
      ...DEFAULT_GRADE_POLICY_WEIGHTS,
      weightFinal: 4,
      roundingDecimal: 2,
    }, 'policy-2026-09')

    expect(snapshot.versionId).toBe('policy-2026-09')
    expect(snapshot.weights.weightFinal).toBe(4)
    expect(snapshot.weights.roundingDecimal).toBe(2)
    expect(snapshot.thresholds.gioiThreshold).toBe(8)
  })

  it('detects the exact fields that changed between two policy versions', () => {
    const before = { ...DEFAULT_GRADE_POLICY_WEIGHTS }
    const after = { ...DEFAULT_GRADE_POLICY_WEIGHTS, weightFinal: 4, gioiThreshold: 7.5 }

    const diff = diffGradePolicies(before, after)

    expect(diff.changed).toBe(true)
    expect(diff.fields).toContain('weightFinal')
    expect(diff.fields).toContain('gioiThreshold')
    expect(diff.fieldCount).toBe(2)
  })

  it('summarizes the GPA and label delta caused by a policy change', () => {
    const grade = {
      scoreOral: 8,
      score15m: 8,
      score1Period: 8,
      scoreMidterm: 8,
      scoreFinal: 8,
    }

    const before = { ...DEFAULT_GRADE_POLICY_WEIGHTS }
    const after = { ...DEFAULT_GRADE_POLICY_WEIGHTS, weightFinal: 5, gioiThreshold: 8.5 }

    const summary = summarizeGradeDelta(grade, before, after)

    expect(summary.changed).toBe(true)
    expect(summary.gpaBefore).toBe(8)
    expect(summary.gpaAfter).toBe(8)
    expect(summary.labelBefore).toBe('Giỏi')
    expect(summary.labelAfter).toBe('Khá')
  })

  it('packages policy version and delta info for an override audit record', () => {
    const grade = {
      scoreOral: 8,
      score15m: 8,
      score1Period: 8,
      scoreMidterm: 8,
      scoreFinal: 8,
    }

    const before = { ...DEFAULT_GRADE_POLICY_WEIGHTS }
    const after = { ...DEFAULT_GRADE_POLICY_WEIGHTS, gioiThreshold: 8.5 }

    const audit = buildGradePolicyAuditRecord({
      grade,
      previousPolicy: before,
      currentPolicy: after,
      previousVersionId: 'policy-2026-hk1',
      currentVersionId: 'policy-2026-hk2',
      actor: 'admin-001',
      action: 'manual_override',
      reason: 'BGL điều chỉnh ngưỡng học lực sau kiểm tra',
    })

    expect(audit.previousPolicyVersion).toBe('policy-2026-hk1')
    expect(audit.currentPolicyVersion).toBe('policy-2026-hk2')
    expect(audit.changedFields).toContain('gioiThreshold')
    expect(audit.summary.labelBefore).toBe('Giỏi')
    expect(audit.summary.labelAfter).toBe('Khá')
    expect(audit.actor).toBe('admin-001')
    expect(audit.action).toBe('manual_override')
  })
})
