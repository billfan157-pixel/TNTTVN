import { describe, expect, it } from 'vitest'
import { evaluateOmrSequenceGate, type OmrSequenceProfile, type OmrSequenceRun, type OmrSequenceTargets } from '../omrSequenceBenchmark'

const profile: OmrSequenceProfile = {
  engineVersion: 'omr-v4-live', releaseId: 'sha-abcdef123456', deviceProfile: 'iphone-13', browser: 'safari-18',
  frameWidth: 960, frameHeight: 1280, templateMode: 'integrated', questionCount: 20,
}

function run(runId: string, sheets: number): OmrSequenceRun {
  return {
    runId, profile, sheets, unresolvedSamples: 1, routedUnresolved: 1, reloadAttempts: 1, reloadRecovered: 1,
    falseRearmCount: 0, staleIdentityCount: 0, duplicateProposalCount: 0, duplicateDurableMutationCount: 0,
    lostMutationCount: 0, acknowledgementCorruptionCount: 0,
    proposalDurationsMs: Array(sheets).fill(80), durableDurationsMs: Array(sheets).fill(20),
    acknowledgementDurationsMs: Array(sheets).fill(300), longTaskCount: 0, longTaskTotalMs: 0,
    responsivenessObserver: 'longtask', memoryMeasurement: 'performance-memory',
    memoryStartMb: 100, memoryEndMb: 104, memoryPeakMb: 108,
    runElapsedMs: sheets * 5_000,
  }
}

const targets: OmrSequenceTargets = {
  version: 2, requiredProfiles: [profile], proposalP95Ms: 150, durableP95Ms: 50,
  acknowledgementP95Ms: 1_000, longTasksPer100SheetsMax: 2, memoryGrowthMbMax: 20,
  papersPerMinuteMin: 10, proposalLatencyDriftRatioMax: 1.5,
}

describe('OMR continuous sequence corpus gate', () => {
  it('chỉ pass khi có cả run 30 và 100 bài, routing/reload đủ và zero integrity failure', () => {
    const report = evaluateOmrSequenceGate({ version: 2, runs: [run('r30', 30), run('r100', 100)] }, targets)
    expect(report.passed).toBe(true)
    expect(report.profiles[0]).toMatchObject({ sheetCount: 130, has30SheetRun: true, has100SheetRun: true, safetyFailures: 0 })
  })

  it('fail closed khi thiếu target thực địa hoặc có duplicate durable mutation', () => {
    const unsafe = run('unsafe', 100)
    unsafe.duplicateDurableMutationCount = 1
    const report = evaluateOmrSequenceGate(
      { version: 2, runs: [run('r30', 30), unsafe] },
      { ...targets, proposalP95Ms: null },
    )
    expect(report.passed).toBe(false)
    expect(report.reasons).toContain('performance_targets_not_configured')
    expect(report.reasons.some(reason => reason.startsWith('safety_failure:'))).toBe(true)
  })

  it('reject run thiếu latency sample thay vì tự suy diễn dữ liệu', () => {
    const invalid = run('invalid', 100)
    invalid.proposalDurationsMs.pop()
    const report = evaluateOmrSequenceGate({ version: 2, runs: [invalid] }, targets)
    expect(report.reasons).toContain('invalid_run:invalid')
    expect(report.passed).toBe(false)
  })

  it('không dùng một run 100 bài để thay cho lượt kiểm tra 30 bài riêng', () => {
    const report = evaluateOmrSequenceGate({ version: 2, runs: [run('r100', 100)] }, targets)
    expect(report.passed).toBe(false)
    expect(report.reasons.some(reason => reason.startsWith('missing_30_sheet_run:'))).toBe(true)
  })

  it('reject required profile trùng hoặc malformed', () => {
    const malformed = { ...profile, engineVersion: 'dev-latest' }
    const report = evaluateOmrSequenceGate(
      { version: 2, runs: [run('r30', 30), run('r100', 100)] },
      { ...targets, requiredProfiles: [profile, profile, malformed] },
    )
    expect(report.passed).toBe(false)
    expect(report.reasons.some(reason => reason.startsWith('duplicate_required_profile:'))).toBe(true)
    expect(report.reasons.some(reason => reason.startsWith('invalid_required_profile:'))).toBe(true)
  })

  it('không cho routing/reload vacuous pass khi profile chưa có case kiểm chứng', () => {
    const noCases30 = run('no-cases-30', 30)
    const noCases100 = run('no-cases-100', 100)
    for (const item of [noCases30, noCases100]) {
      item.unresolvedSamples = 0
      item.routedUnresolved = 0
      item.reloadAttempts = 0
      item.reloadRecovered = 0
    }
    const report = evaluateOmrSequenceGate({ version: 2, runs: [noCases30, noCases100] }, targets)
    expect(report.passed).toBe(false)
    expect(report.reasons.some(reason => reason.startsWith('unresolved_evidence_missing:'))).toBe(true)
    expect(report.reasons.some(reason => reason.startsWith('reload_evidence_missing:'))).toBe(true)
  })

  it('fail khi release trộn, throughput thấp hoặc proposal latency drift', () => {
    const slow = run('slow-100', 100)
    slow.runElapsedMs = 1_000_000
    slow.proposalDurationsMs = [...Array(75).fill(80), ...Array(25).fill(160)]
    const report = evaluateOmrSequenceGate({ version: 2, runs: [run('r30', 30), slow] }, targets)
    expect(report.passed).toBe(false)
    expect(report.reasons.some(reason => reason.startsWith('throughput_below_target:'))).toBe(true)
    expect(report.reasons.some(reason => reason.startsWith('proposal_drift_exceeded:'))).toBe(true)

    const wrongRelease = run('wrong-release', 100)
    wrongRelease.profile = { ...profile, releaseId: 'sha-other654321' }
    const mixed = evaluateOmrSequenceGate({ version: 2, runs: [run('r30b', 30), wrongRelease] }, targets)
    expect(mixed.reasons.some(reason => reason.startsWith('missing_100_sheet_run:'))).toBe(true)
    expect(mixed.reasons.some(reason => reason.startsWith('unexpected_profile:'))).toBe(true)
  })

  it('không cho một qualification target trộn nhiều release', () => {
    const other = { ...profile, releaseId: 'sha-fedcba654321' }
    const report = evaluateOmrSequenceGate(
      { version: 2, runs: [run('r30', 30), run('r100', 100)] },
      { ...targets, requiredProfiles: [profile, other] },
    )
    expect(report.reasons).toContain('mixed_required_releases')
  })

  it('reject target throughput bằng 0 hoặc drift ratio dưới 1', () => {
    for (const invalidTargets of [
      { ...targets, papersPerMinuteMin: 0 },
      { ...targets, proposalLatencyDriftRatioMax: 0.99 },
    ]) {
      const report = evaluateOmrSequenceGate({ version: 2, runs: [run('r30', 30), run('r100', 100)] }, invalidTargets)
      expect(report.reasons).toContain('performance_targets_not_configured')
    }
  })
})
