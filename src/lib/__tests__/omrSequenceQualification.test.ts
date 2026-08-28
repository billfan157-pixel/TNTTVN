import { describe, expect, it } from 'vitest'
import type { OmrSequenceManifest, OmrSequenceRun } from '../omrSequenceBenchmark'
import { buildOmrSequenceTargetsScaffold, mergeOmrSequenceManifests } from '../omrSequenceQualification'

function run(runId: string, releaseId = 'sha-abcdef123456', browser = 'chrome-128'): OmrSequenceRun {
  return {
    runId,
    profile: {
      engineVersion: 'omr-v4-live', releaseId, deviceProfile: 'pixel-7', browser,
      frameWidth: 1280, frameHeight: 1808, templateMode: 'integrated', questionCount: 20,
    },
    sheets: 30, unresolvedSamples: 1, routedUnresolved: 1, reloadAttempts: 1, reloadRecovered: 1,
    falseRearmCount: 0, staleIdentityCount: 0, duplicateProposalCount: 0,
    duplicateDurableMutationCount: 0, lostMutationCount: 0, acknowledgementCorruptionCount: 0,
    proposalDurationsMs: Array(30).fill(80), durableDurationsMs: Array(30).fill(20),
    acknowledgementDurationsMs: Array(30).fill(300), longTaskCount: 0, longTaskTotalMs: 0,
    responsivenessObserver: 'longtask', memoryMeasurement: 'performance-memory',
    memoryStartMb: 100, memoryEndMb: 104, memoryPeakMb: 108, runElapsedMs: 150_000,
  }
}

describe('OMR sequence qualification workflow', () => {
  it('gộp export mà không xóa duplicate run để evaluator có thể reject', () => {
    const left: OmrSequenceManifest = { version: 2, runs: [run('same')] }
    const right: OmrSequenceManifest = { version: 2, runs: [run('same')] }
    expect(mergeOmrSequenceManifests([left, right]).runs).toHaveLength(2)
  })

  it('scaffold tách exact release profile và để toàn bộ target ở null', () => {
    const manifest = mergeOmrSequenceManifests([
      { version: 2, runs: [run('a')] },
      { version: 2, runs: [run('b', 'sha-abcdef123456', 'chrome-pwa-128')] },
    ])
    const scaffold = buildOmrSequenceTargetsScaffold(manifest)
    expect(scaffold.requiredProfiles).toHaveLength(2)
    expect(scaffold.papersPerMinuteMin).toBeNull()
    expect(scaffold.proposalLatencyDriftRatioMax).toBeNull()
  })

  it('không scaffold target trộn release vì một qualification chỉ chứng nhận một build', () => {
    const manifest = mergeOmrSequenceManifests([
      { version: 2, runs: [run('a')] },
      { version: 2, runs: [run('b', 'sha-fedcba654321')] },
    ])
    expect(() => buildOmrSequenceTargetsScaffold(manifest)).toThrow('mixed_sequence_releases')
  })

  it('reject manifest legacy/malformed thay vì tự migrate thiếu provenance', () => {
    expect(() => mergeOmrSequenceManifests([{ version: 1, runs: [] } as never])).toThrow('invalid_sequence_manifest_v2')
  })
})
