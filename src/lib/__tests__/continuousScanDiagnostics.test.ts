import { afterEach, describe, expect, it, vi } from 'vitest'
import { armOmrSequenceEvidence, readOmrSequenceEvidenceSummary, recordOmrSequenceProposal } from '../omrSequenceEvidence'
import { readContinuousScanDiagnostics, recordContinuousDuration, recordContinuousEvent, startContinuousRuntimeMonitor } from '../continuousScanDiagnostics'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

const plan = {
  releaseId: 'sha-abcdef123456', deviceProfile: 'pixel-7', browser: 'chrome-128', targetSheets: 30 as const,
}
const profile = {
  engineVersion: 'omr-v4-live', frameWidth: 1280, frameHeight: 1808,
  templateMode: 'integrated' as const, questionCount: 20,
}

afterEach(() => vi.unstubAllGlobals())

describe('continuous scan target-device diagnostics', () => {
  it('chỉ lưu aggregate không có định danh hay ảnh', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    recordContinuousEvent('rearm_blocked', storage)
    recordContinuousDuration('identity_to_proposal', 142.8, storage)
    const aggregate = readContinuousScanDiagnostics(storage)
    expect(aggregate.events.rearm_blocked).toBe(1)
    expect(aggregate.durations.identity_to_proposal.buckets.lte150).toBe(1)
    expect(JSON.stringify(aggregate)).not.toMatch(/student|session|parish|user|image|answer|base64/i)
  })

  it('chỉ công nhận responsiveness source sau khi observer attach thành công', () => {
    class FailingObserver {
      static supportedEntryTypes = ['longtask']
      constructor(_callback: PerformanceObserverCallback) {}
      observe() { throw new Error('observer unavailable') }
      disconnect() {}
    }
    vi.stubGlobal('PerformanceObserver', FailingObserver)
    const failedStorage = memoryStorage()
    const stopFailed = startContinuousRuntimeMonitor(failedStorage)
    armOmrSequenceEvidence(plan, failedStorage)
    recordOmrSequenceProposal(profile, 80, false, false, failedStorage)
    expect(readOmrSequenceEvidenceSummary(failedStorage).active?.readiness.responsiveness).toBe('pending')
    stopFailed()

    class AttachedObserver {
      static supportedEntryTypes = ['longtask']
      constructor(_callback: PerformanceObserverCallback) {}
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('PerformanceObserver', AttachedObserver)
    const attachedStorage = memoryStorage()
    const stopAttached = startContinuousRuntimeMonitor(attachedStorage)
    armOmrSequenceEvidence(plan, attachedStorage)
    recordOmrSequenceProposal(profile, 80, false, false, attachedStorage)
    expect(readOmrSequenceEvidenceSummary(attachedStorage).active?.readiness).toMatchObject({
      responsiveness: 'pass', responsivenessObserver: 'longtask',
    })
    stopAttached()
  })
})
