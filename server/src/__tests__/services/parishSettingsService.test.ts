import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db, type DbExecutor } from '../../db/index.js'
import { systemSettings } from '../../db/schema.js'
import {
  DEFAULT_ATTENDANCE_POLICY,
  DEFAULT_CLASSIFICATION_THRESHOLDS,
  getCurrentPolicyVersionId,
  getParishAttendancePolicy,
  getParishClassificationThresholds,
  getParishGradeWeights,
  getParishPromotionPolicy,
} from '../../services/parishSettingsService.js'
import { getAcademicYearDateRange } from '../../services/academicYearService.js'
import { DEFAULT_PROMOTION_POLICY } from '../../domain/PromotionSpecifications.js'
import { DEFAULT_GRADE_WEIGHTS } from '../../utils/gradeCalculation.js'
import { computeAcademicYearDateRange } from '../../utils/academicYear.js'

describe('Parish settings policy reads — fail-closed infrastructure boundary', () => {
  const parishId = 'parish-settings-fail-closed'

  async function cleanup(): Promise<void> {
    await db.delete(systemSettings).where(and(
      eq(systemSettings.key, 'parish_system_settings'),
      eq(systemSettings.parishId, parishId),
    ))
  }

  beforeEach(cleanup)
  afterEach(cleanup)

  it('keeps documented defaults for an absent row or malformed business configuration', async () => {
    expect(await getParishGradeWeights(parishId)).toEqual(DEFAULT_GRADE_WEIGHTS)
    expect(await getParishAttendancePolicy(parishId)).toEqual(DEFAULT_ATTENDANCE_POLICY)
    expect(await getParishPromotionPolicy(parishId)).toEqual(DEFAULT_PROMOTION_POLICY)
    expect(await getParishClassificationThresholds(parishId)).toEqual(DEFAULT_CLASSIFICATION_THRESHOLDS)
    expect(await getCurrentPolicyVersionId(parishId)).toBeNull()

    const updatedAt = '2026-09-04T01:02:03.000Z'
    await db.insert(systemSettings).values({
      key: 'parish_system_settings',
      parishId,
      value: '{invalid-json',
      updatedAt,
    })

    expect(await getParishGradeWeights(parishId)).toEqual(DEFAULT_GRADE_WEIGHTS)
    expect(await getParishAttendancePolicy(parishId)).toEqual(DEFAULT_ATTENDANCE_POLICY)
    expect(await getParishPromotionPolicy(parishId)).toEqual(DEFAULT_PROMOTION_POLICY)
    expect(await getParishClassificationThresholds(parishId)).toEqual(DEFAULT_CLASSIFICATION_THRESHOLDS)
    expect(await getCurrentPolicyVersionId(parishId)).toBe(`policy-settings-${parishId}-${updatedAt}`)
  })

  it('propagates database failures instead of converting them into policy defaults or null', async () => {
    const failingExecutor = {
      select: () => {
        throw new Error('database unavailable')
      },
    } as unknown as DbExecutor

    const policyReads = [
      () => getParishGradeWeights(parishId, failingExecutor),
      () => getParishAttendancePolicy(parishId, failingExecutor),
      () => getParishPromotionPolicy(parishId, failingExecutor),
      () => getParishClassificationThresholds(parishId, failingExecutor),
      () => getCurrentPolicyVersionId(parishId, failingExecutor),
      () => getAcademicYearDateRange(parishId, '2025-2026', failingExecutor),
    ]

    for (const readPolicy of policyReads) {
      await expect(readPolicy()).rejects.toThrow('database unavailable')
    }
  })

  it('keeps the calendar fallback only when the academic-year row is absent', async () => {
    await expect(getAcademicYearDateRange(parishId, '2025-2026'))
      .resolves.toEqual(computeAcademicYearDateRange('2025-2026'))
  })
})
