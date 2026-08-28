import { describe, expect, it } from 'vitest'
import {
  armOmrSequenceEvidence,
  buildOmrSequenceEvidenceManifest,
  readOmrSequenceEvidenceSummary,
  recordOmrSequenceAcknowledgement,
  recordOmrSequenceDurableWrite,
  recordOmrSequenceMemorySample,
  recordOmrSequenceProposal,
  recordOmrSequenceReloadRecovery,
  recordOmrSequenceResponsivenessObserver,
  recordOmrSequenceSafetyCounter,
} from '../omrSequenceEvidence'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

const profile = {
  engineVersion: 'omr-v4-live', frameWidth: 1280, frameHeight: 1808,
  templateMode: 'integrated' as const, questionCount: 20,
}

const plan = (deviceProfile: string, browser: string, targetSheets: 30 | 100 = 30) => ({
  releaseId: 'sha-abcdef123456', deviceProfile, browser, targetSheets,
})

describe('privacy-safe OMR sequence evidence recorder', () => {
  it('arm fail-closed với profile không chuẩn và không lưu ID thô', () => {
    const storage = memoryStorage()
    expect(armOmrSequenceEvidence(plan('iPhone 13', 'safari-18'), storage)).toEqual({ ok: false, reason: 'invalid_profile' })
    expect(armOmrSequenceEvidence(plan('iphone-13', 'safari-18'), storage).ok).toBe(true)
    recordOmrSequenceProposal(profile, 80, false, false, storage)
    recordOmrSequenceDurableWrite('MUT-STUDENT-SECRET-001', 20, storage)
    expect([...storage.values.values()].join('')).not.toContain('MUT-STUDENT-SECRET-001')
  })

  it('hoàn tất run 30 bài chỉ sau đủ durable acknowledgement và memory evidence', () => {
    const storage = memoryStorage()
    armOmrSequenceEvidence(plan('pixel-7', 'chrome-128'), storage)
    for (let index = 0; index < 30; index++) {
      recordOmrSequenceProposal(profile, 70 + index, index === 4, index === 4, storage)
      recordOmrSequenceDurableWrite(`MUT-${index}`, 15 + index, storage)
    }
    recordOmrSequenceMemorySample(100, storage)
    recordOmrSequenceMemorySample(112, storage)
    recordOmrSequenceReloadRecovery('reload', 1234, storage)
    recordOmrSequenceReloadRecovery('reload', 1234, storage)
    for (let index = 0; index < 30; index++) recordOmrSequenceAcknowledgement(`MUT-${index}`, 200 + index, 'synced', storage)

    const summary = readOmrSequenceEvidenceSummary(storage)
    expect(summary.active).toBeNull()
    expect(summary.completedRuns).toBe(1)
    const run = buildOmrSequenceEvidenceManifest(storage).runs[0]
    expect(run).toMatchObject({ sheets: 30, unresolvedSamples: 1, routedUnresolved: 1, reloadAttempts: 1, reloadRecovered: 1 })
    expect(run.proposalDurationsMs).toHaveLength(30)
    expect(run.acknowledgementDurationsMs).toHaveLength(30)
    expect(run.memoryStartMb).toBe(100)
    expect(run.memoryPeakMb).toBe(112)
    expect(run.memoryEndMb).toBe(112)
    expect(run.memoryMeasurement).toBe('unsupported')
    expect(run.runElapsedMs).toBeGreaterThan(0)
    expect(run.profile.releaseId).toBe('sha-abcdef123456')
  })

  it('hiển thị preflight fail-closed trong lúc chạy mà không lộ mutation token', () => {
    const storage = memoryStorage()
    recordOmrSequenceResponsivenessObserver('unsupported', storage)
    armOmrSequenceEvidence(plan('pixel-7', 'chrome-128'), storage)
    recordOmrSequenceProposal(profile, 80, true, false, storage)
    recordOmrSequenceDurableWrite('MUT-PREFLIGHT-SECRET', 20, storage)

    let readiness = readOmrSequenceEvidenceSummary(storage).active?.readiness
    expect(readiness).toMatchObject({
      unresolved: 'fail', unresolvedSamples: 1, routedUnresolved: 0,
      reload: 'pending', responsiveness: 'pending', memory: 'pending', safety: 'pass',
    })

    recordOmrSequenceResponsivenessObserver('longtask', storage)
    recordOmrSequenceMemorySample(101, storage)
    recordOmrSequenceReloadRecovery('reload', 4321, storage)
    recordOmrSequenceSafetyCounter('staleIdentityCount', storage)
    readiness = readOmrSequenceEvidenceSummary(storage).active?.readiness
    expect(readiness).toMatchObject({
      reload: 'pass', responsiveness: 'pass', responsivenessObserver: 'longtask',
      memory: 'pending', memoryMeasurement: 'unsupported', safety: 'fail', safetyFailures: 1,
    })
    expect(JSON.stringify(readiness)).not.toContain('MUT-PREFLIGHT-SECRET')
  })

  it('tách completed artifact theo release để không tạo manifest mixed-build', () => {
    const storage = memoryStorage()
    for (const releaseId of ['sha-abcdef123456', 'sha-fedcba654321']) {
      armOmrSequenceEvidence({ ...plan('pixel-7', 'chrome-128'), releaseId }, storage)
      for (let index = 0; index < 30; index++) {
        recordOmrSequenceProposal(profile, 80, false, false, storage)
        recordOmrSequenceDurableWrite(`${releaseId}-${index}`, 20, storage)
        recordOmrSequenceAcknowledgement(`${releaseId}-${index}`, 200, 'synced', storage)
      }
    }

    const summary = readOmrSequenceEvidenceSummary(storage)
    expect(summary.completedReleases).toEqual([
      { releaseId: 'sha-abcdef123456', runs: 1, sheets: 30 },
      { releaseId: 'sha-fedcba654321', runs: 1, sheets: 30 },
    ])
    const filtered = buildOmrSequenceEvidenceManifest(storage, 'sha-fedcba654321')
    expect(filtered.runs).toHaveLength(1)
    expect(filtered.runs[0].profile.releaseId).toBe('sha-fedcba654321')
  })

  it('giữ safety failure trong artifact thay vì che để gate loại run', () => {
    const storage = memoryStorage()
    armOmrSequenceEvidence(plan('iphone-13', 'safari-18'), storage)
    recordOmrSequenceProposal(profile, 80, true, true, storage)
    recordOmrSequenceSafetyCounter('staleIdentityCount', storage)
    recordOmrSequenceDurableWrite('MUT-1', 20, storage)
    recordOmrSequenceAcknowledgement('MUT-1', 300, 'corrupt', storage)
    const active = readOmrSequenceEvidenceSummary(storage).active
    expect(active?.sheets).toBe(1)
    const raw = [...storage.values.values()].join('')
    expect(raw).toContain('"staleIdentityCount":1')
    expect(raw).toContain('"acknowledgementCorruptionCount":1')
  })

  it('không trộn profile giữa một run', () => {
    const storage = memoryStorage()
    armOmrSequenceEvidence(plan('pixel-7', 'chrome-128'), storage)
    recordOmrSequenceProposal(profile, 80, false, false, storage)
    recordOmrSequenceProposal({ ...profile, frameWidth: 960 }, 70, false, false, storage)
    expect(readOmrSequenceEvidenceSummary(storage).lastIssue).toBe('profile_mismatch')
  })

  it('đánh dấu proposal chồng và durable mutation ID trùng là safety failure', () => {
    const storage = memoryStorage()
    armOmrSequenceEvidence(plan('pixel-7', 'chrome-128'), storage)
    recordOmrSequenceProposal(profile, 80, false, false, storage)
    recordOmrSequenceProposal(profile, 70, false, false, storage)
    expect(readOmrSequenceEvidenceSummary(storage).lastIssue).toBe('proposal_before_durable')
    recordOmrSequenceDurableWrite('MUT-DUP', 20, storage)
    recordOmrSequenceProposal(profile, 75, false, false, storage)
    recordOmrSequenceDurableWrite('MUT-DUP', 21, storage)
    const raw = [...storage.values.values()].join('')
    expect(raw).toContain('"duplicateProposalCount":1')
    expect(raw).toContain('"duplicateDurableMutationCount":1')
  })

  it('không ghi localStorage khi recorder chưa được quản trị chuẩn bị', () => {
    const storage = memoryStorage()
    expect(recordOmrSequenceProposal(profile, 80, false, false, storage)).toBe(false)
    expect(recordOmrSequenceAcknowledgement('MUT-UNRELATED', 200, 'synced', storage)).toBe(false)
    expect(storage.values.size).toBe(0)
  })

  it('không cho field run khi release build chưa được cấu hình', () => {
    const storage = memoryStorage()
    expect(armOmrSequenceEvidence({ ...plan('pixel-7', 'chrome-128'), releaseId: 'dev' }, storage))
      .toEqual({ ok: false, reason: 'release_unconfigured' })
    expect(storage.values.size).toBe(0)
  })
})
