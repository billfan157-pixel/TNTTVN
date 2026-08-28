import type { OmrSequenceManifest, OmrSequenceProfile, OmrSequenceRun } from './omrSequenceBenchmark'

export type OmrSequenceRunTarget = 30 | 100

export interface OmrSequenceEvidencePlan {
  releaseId: string
  deviceProfile: string
  browser: string
  targetSheets: OmrSequenceRunTarget
}

export interface OmrSequenceDynamicProfile {
  engineVersion: string
  frameWidth: number
  frameHeight: number
  templateMode: 'integrated' | 'full_page'
  questionCount: number
}

export type OmrSequenceSafetyCounter =
  | 'falseRearmCount'
  | 'staleIdentityCount'
  | 'duplicateProposalCount'
  | 'duplicateDurableMutationCount'

export type OmrSequenceEvidenceCheckStatus = 'pass' | 'pending' | 'fail'

export interface OmrSequenceActiveReadiness {
  unresolved: OmrSequenceEvidenceCheckStatus
  unresolvedSamples: number
  routedUnresolved: number
  reload: OmrSequenceEvidenceCheckStatus
  reloadAttempts: number
  reloadRecovered: number
  responsiveness: OmrSequenceEvidenceCheckStatus
  responsivenessObserver: OmrSequenceRun['responsivenessObserver']
  memory: OmrSequenceEvidenceCheckStatus
  memoryMeasurement: OmrSequenceRun['memoryMeasurement']
  safety: OmrSequenceEvidenceCheckStatus
  safetyFailures: number
}

export interface OmrSequenceEvidenceSummary {
  plan: OmrSequenceEvidencePlan | null
  active: null | {
    runId: string
    profile: OmrSequenceProfile
    targetSheets: OmrSequenceRunTarget
    sheets: number
    pendingAcknowledgements: number
    proposalPending: boolean
    readiness: OmrSequenceActiveReadiness
  }
  completedRuns: number
  completedSheets: number
  completedReleases: Array<{ releaseId: string; runs: number; sheets: number }>
  lastIssue: string | null
}

interface PendingProposal {
  durationMs: number
  unresolved: boolean
  routed: boolean
}

interface InternalSequenceRun extends OmrSequenceRun {
  targetSheets: OmrSequenceRunTarget
  pendingProposal?: PendingProposal
  pendingAcknowledgements: Record<string, true>
  recoveredTimeOrigins: number[]
  latestMemoryMb?: number
  startedAtMs: number
}

interface StoredSequenceEvidence {
  version: 2
  plan: OmrSequenceEvidencePlan | null
  activeRun: InternalSequenceRun | null
  completedRuns: OmrSequenceRun[]
  lastIssue: string | null
}

const STORAGE_KEY = 'tntt.omr.sequence-evidence.v2'
const PROFILE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/
const RELEASE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/

declare const __APP_RELEASE_ID__: string

let attachedResponsivenessObserver: OmrSequenceRun['responsivenessObserver'] = 'unsupported'

export function getOmrSequenceReleaseId(): string {
  return typeof __APP_RELEASE_ID__ === 'string' ? __APP_RELEASE_ID__ : 'dev'
}

function emptyState(): StoredSequenceEvidence {
  return { version: 2, plan: null, activeRun: null, completedRuns: [], lastIssue: null }
}

function defaultReadStorage(): Pick<Storage, 'getItem'> | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

function defaultWriteStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

function readState(storage: Pick<Storage, 'getItem'> | null = defaultReadStorage()): StoredSequenceEvidence {
  if (!storage) return emptyState()
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as StoredSequenceEvidence | null
    if (parsed?.version === 2 && Array.isArray(parsed.completedRuns)) return parsed
  } catch {
    // Invalid/private storage disables evidence capture without affecting grading.
  }
  return emptyState()
}

function writeState(state: StoredSequenceEvidence, storage: Pick<Storage, 'setItem'> | null): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

function updateState(
  mutate: (state: StoredSequenceEvidence) => void,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  if (!storage) return false
  const state = readState(storage)
  mutate(state)
  return writeState(state, storage)
}

function newRunId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // Fall through to a non-identifying random run label.
  }
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function sequenceNowMs(): number {
  try {
    if (typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin)) {
      return performance.timeOrigin + performance.now()
    }
  } catch {
    // Date fallback still records elapsed evidence on older runtimes.
  }
  return Date.now()
}

function acknowledgementToken(runId: string, mutationId: string): string {
  let hash = 0x811c9dc5
  const input = `${runId}\u001f${mutationId}`
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function profileEquals(left: OmrSequenceProfile, right: OmrSequenceProfile): boolean {
  return left.engineVersion === right.engineVersion
    && left.deviceProfile === right.deviceProfile
    && left.browser === right.browser
    && left.frameWidth === right.frameWidth
    && left.frameHeight === right.frameHeight
    && left.templateMode === right.templateMode
    && left.questionCount === right.questionCount
}

function buildProfile(plan: OmrSequenceEvidencePlan, dynamic: OmrSequenceDynamicProfile): OmrSequenceProfile {
  return { ...dynamic, releaseId: plan.releaseId, deviceProfile: plan.deviceProfile, browser: plan.browser }
}

function createRun(profile: OmrSequenceProfile, targetSheets: OmrSequenceRunTarget): InternalSequenceRun {
  return {
    runId: newRunId(), profile, targetSheets, sheets: 0,
    unresolvedSamples: 0, routedUnresolved: 0, reloadAttempts: 0, reloadRecovered: 0,
    falseRearmCount: 0, staleIdentityCount: 0, duplicateProposalCount: 0,
    duplicateDurableMutationCount: 0, lostMutationCount: 0, acknowledgementCorruptionCount: 0,
    proposalDurationsMs: [], durableDurationsMs: [], acknowledgementDurationsMs: [],
    longTaskCount: 0, longTaskTotalMs: 0, responsivenessObserver: attachedResponsivenessObserver, memoryMeasurement: 'unsupported',
    pendingAcknowledgements: {}, recoveredTimeOrigins: [], runElapsedMs: 0, startedAtMs: sequenceNowMs(),
  }
}

function safetyFailureCount(run: OmrSequenceRun): number {
  return run.falseRearmCount
    + run.staleIdentityCount
    + run.duplicateProposalCount
    + run.duplicateDurableMutationCount
    + run.lostMutationCount
    + run.acknowledgementCorruptionCount
}

function activeReadiness(run: InternalSequenceRun): OmrSequenceActiveReadiness {
  const safetyFailures = safetyFailureCount(run)
  return {
    unresolved: run.routedUnresolved < run.unresolvedSamples
      ? 'fail'
      : run.unresolvedSamples > 0 ? 'pass' : 'pending',
    unresolvedSamples: run.unresolvedSamples,
    routedUnresolved: run.routedUnresolved,
    reload: run.reloadRecovered < run.reloadAttempts
      ? 'fail'
      : run.reloadAttempts > 0 ? 'pass' : 'pending',
    reloadAttempts: run.reloadAttempts,
    reloadRecovered: run.reloadRecovered,
    responsiveness: run.responsivenessObserver === 'unsupported' ? 'pending' : 'pass',
    responsivenessObserver: run.responsivenessObserver,
    memory: run.memoryMeasurement !== 'unsupported' && run.memoryStartMb !== undefined ? 'pass' : 'pending',
    memoryMeasurement: run.memoryMeasurement,
    safety: safetyFailures > 0 ? 'fail' : 'pass',
    safetyFailures,
  }
}

function publicRun(run: InternalSequenceRun): OmrSequenceRun {
  return {
    runId: run.runId, profile: run.profile, sheets: run.sheets,
    unresolvedSamples: run.unresolvedSamples, routedUnresolved: run.routedUnresolved,
    reloadAttempts: run.reloadAttempts, reloadRecovered: run.reloadRecovered,
    falseRearmCount: run.falseRearmCount, staleIdentityCount: run.staleIdentityCount,
    duplicateProposalCount: run.duplicateProposalCount,
    duplicateDurableMutationCount: run.duplicateDurableMutationCount,
    lostMutationCount: run.lostMutationCount,
    acknowledgementCorruptionCount: run.acknowledgementCorruptionCount,
    proposalDurationsMs: [...run.proposalDurationsMs],
    durableDurationsMs: [...run.durableDurationsMs],
    acknowledgementDurationsMs: [...run.acknowledgementDurationsMs],
    longTaskCount: run.longTaskCount, longTaskTotalMs: run.longTaskTotalMs,
    responsivenessObserver: run.responsivenessObserver,
    memoryMeasurement: run.memoryMeasurement,
    memoryStartMb: run.memoryStartMb, memoryEndMb: run.memoryEndMb, memoryPeakMb: run.memoryPeakMb,
    runElapsedMs: run.runElapsedMs,
  }
}

function maybeComplete(state: StoredSequenceEvidence): void {
  const run = state.activeRun
  if (!run || run.sheets < run.targetSheets) return
  if (run.proposalDurationsMs.length !== run.sheets || run.durableDurationsMs.length !== run.sheets) return
  if (run.acknowledgementDurationsMs.length !== run.sheets || Object.keys(run.pendingAcknowledgements).length > 0) return
  if (run.latestMemoryMb !== undefined) run.memoryEndMb = run.latestMemoryMb
  run.runElapsedMs = Math.max(1, Math.round(sequenceNowMs() - run.startedAtMs))
  state.completedRuns.push(publicRun(run))
  state.activeRun = null
  state.plan = null
  state.lastIssue = null
}

export function armOmrSequenceEvidence(
  plan: OmrSequenceEvidencePlan,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): { ok: boolean; reason?: string } {
  if (!RELEASE_LABEL.test(plan.releaseId) || ['dev', 'local', 'unknown'].includes(plan.releaseId.toLowerCase())) {
    return { ok: false, reason: 'release_unconfigured' }
  }
  if (!PROFILE_LABEL.test(plan.deviceProfile) || !PROFILE_LABEL.test(plan.browser) || ![30, 100].includes(plan.targetSheets)) {
    return { ok: false, reason: 'invalid_profile' }
  }
  const state = readState(storage)
  if (state.activeRun) return { ok: false, reason: 'run_already_active' }
  state.plan = plan
  state.lastIssue = null
  return writeState(state, storage) ? { ok: true } : { ok: false, reason: 'storage_unavailable' }
}

export function recordOmrSequenceProposal(
  dynamicProfile: OmrSequenceDynamicProfile,
  durationMs: number,
  unresolved = false,
  routed = unresolved,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  if (!storage || !Number.isFinite(durationMs) || durationMs < 0) return false
  const state = readState(storage)
  if (!state.activeRun) {
    if (!state.plan) return false
    state.activeRun = createRun(buildProfile(state.plan, dynamicProfile), state.plan.targetSheets)
  }
  const run = state.activeRun
  if (!run || run.sheets >= run.targetSheets) return false
  const expectedProfile = buildProfile(state.plan ?? {
    releaseId: run.profile.releaseId,
    deviceProfile: run.profile.deviceProfile,
    browser: run.profile.browser,
    targetSheets: run.targetSheets,
  }, dynamicProfile)
  if (!profileEquals(run.profile, expectedProfile)) {
    state.lastIssue = 'profile_mismatch'
    return writeState(state, storage)
  }
  if (run.pendingProposal) {
    run.duplicateProposalCount++
    state.lastIssue = 'proposal_before_durable'
    return writeState(state, storage)
  }
  run.pendingProposal = { durationMs: Math.round(durationMs), unresolved, routed }
  return writeState(state, storage)
}

export function recordOmrSequenceDurableWrite(
  mutationId: string | undefined,
  durationMs: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  if (!storage || !Number.isFinite(durationMs) || durationMs < 0) return false
  const state = readState(storage)
  const run = state.activeRun
  if (!run?.pendingProposal || run.sheets >= run.targetSheets) return false
  run.sheets++
  run.proposalDurationsMs.push(run.pendingProposal.durationMs)
  run.durableDurationsMs.push(Math.round(durationMs))
  if (run.pendingProposal.unresolved) {
    run.unresolvedSamples++
    if (run.pendingProposal.routed) run.routedUnresolved++
  }
  run.pendingProposal = undefined
  if (mutationId) {
    const token = acknowledgementToken(run.runId, mutationId)
    if (run.pendingAcknowledgements[token]) run.duplicateDurableMutationCount++
    run.pendingAcknowledgements[token] = true
  }
  else run.lostMutationCount++
  if (run.sheets >= run.targetSheets) state.plan = null
  return writeState(state, storage)
}

export function recordOmrSequenceAcknowledgement(
  mutationId: string,
  durationMs: number,
  outcome: 'synced' | 'lost' | 'corrupt' = 'synced',
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  if (!storage || !Number.isFinite(durationMs) || durationMs < 0) return false
  const state = readState(storage)
  const run = state.activeRun
  if (!run) return false
  const token = acknowledgementToken(run.runId, mutationId)
  if (!run.pendingAcknowledgements[token]) return false
  delete run.pendingAcknowledgements[token]
  run.acknowledgementDurationsMs.push(Math.round(durationMs))
  if (outcome === 'lost') run.lostMutationCount++
  if (outcome === 'corrupt') run.acknowledgementCorruptionCount++
  maybeComplete(state)
  return writeState(state, storage)
}

export function recordOmrSequenceSafetyCounter(
  counter: OmrSequenceSafetyCounter,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  if (!storage) return false
  const state = readState(storage)
  if (!state.activeRun) return false
  state.activeRun[counter]++
  return writeState(state, storage)
}

export function recordOmrSequenceLongTasks(
  durationsMs: number[],
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  const valid = durationsMs.filter(duration => Number.isFinite(duration) && duration >= 0)
  if (!storage || valid.length === 0) return false
  const state = readState(storage)
  if (!state.activeRun) return false
  state.activeRun.longTaskCount += valid.length
  state.activeRun.longTaskTotalMs += Math.round(valid.reduce((sum, duration) => sum + duration, 0))
  return writeState(state, storage)
}

/** Records an observer only after observe() really attached; capability detection alone is not evidence. */
export function recordOmrSequenceResponsivenessObserver(
  observer: OmrSequenceRun['responsivenessObserver'],
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  attachedResponsivenessObserver = observer
  if (!storage) return false
  const state = readState(storage)
  if (!state.activeRun) return false
  state.activeRun.responsivenessObserver = observer
  return writeState(state, storage)
}

export function recordOmrSequenceMemorySample(
  memoryMb: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  if (!storage || !Number.isFinite(memoryMb) || memoryMb < 0) return false
  const rounded = Math.round(memoryMb * 10) / 10
  const state = readState(storage)
  const run = state.activeRun
  if (!run) return false
  run.memoryStartMb ??= rounded
  run.latestMemoryMb = rounded
  run.memoryPeakMb = Math.max(run.memoryPeakMb ?? rounded, rounded)
  return writeState(state, storage)
}

export async function sampleOmrSequenceMemory(): Promise<boolean> {
  if (typeof performance === 'undefined') return false
  try {
    const extended = performance as Performance & {
      memory?: { usedJSHeapSize?: number }
      measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>
    }
    if (typeof extended.measureUserAgentSpecificMemory === 'function') {
      try {
        const measurement = await extended.measureUserAgentSpecificMemory()
        const recorded = recordOmrSequenceMemorySample(measurement.bytes / 1_048_576)
        if (recorded) updateState(state => {
          if (state.activeRun) state.activeRun.memoryMeasurement = 'measure-memory'
        })
        return recorded
      } catch {
        // Cross-origin isolation/support can block this API; try Chromium heap fallback.
      }
    }
    const bytes = extended.memory?.usedJSHeapSize
    const recorded = bytes !== undefined ? recordOmrSequenceMemorySample(bytes / 1_048_576) : false
    if (recorded) updateState(state => {
      if (state.activeRun) state.activeRun.memoryMeasurement = 'performance-memory'
    })
    return recorded
  } catch {
    return false
  }
}

export function recordOmrSequenceReloadRecovery(
  navigationType: string | undefined,
  timeOrigin: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  if (!storage || navigationType !== 'reload' || !Number.isFinite(timeOrigin)) return false
  const state = readState(storage)
  const run = state.activeRun
  if (!run || run.recoveredTimeOrigins.includes(timeOrigin)) return false
  run.recoveredTimeOrigins.push(timeOrigin)
  run.reloadAttempts++
  run.reloadRecovered++
  return writeState(state, storage)
}

export function readOmrSequenceEvidenceSummary(
  storage: Pick<Storage, 'getItem'> | null = defaultReadStorage(),
): OmrSequenceEvidenceSummary {
  const state = readState(storage)
  const completedReleaseMap = new Map<string, { releaseId: string; runs: number; sheets: number }>()
  for (const run of state.completedRuns) {
    const current = completedReleaseMap.get(run.profile.releaseId) ?? { releaseId: run.profile.releaseId, runs: 0, sheets: 0 }
    current.runs++
    current.sheets += run.sheets
    completedReleaseMap.set(run.profile.releaseId, current)
  }
  return {
    plan: state.plan,
    active: state.activeRun ? {
      runId: state.activeRun.runId,
      profile: state.activeRun.profile,
      targetSheets: state.activeRun.targetSheets,
      sheets: state.activeRun.sheets,
      pendingAcknowledgements: Object.keys(state.activeRun.pendingAcknowledgements).length,
      proposalPending: Boolean(state.activeRun.pendingProposal),
      readiness: activeReadiness(state.activeRun),
    } : null,
    completedRuns: state.completedRuns.length,
    completedSheets: state.completedRuns.reduce((sum, run) => sum + run.sheets, 0),
    completedReleases: [...completedReleaseMap.values()],
    lastIssue: state.lastIssue,
  }
}

export function buildOmrSequenceEvidenceManifest(
  storage: Pick<Storage, 'getItem'> | null = defaultReadStorage(),
  releaseId?: string,
): OmrSequenceManifest {
  const state = readState(storage)
  const runs = releaseId
    ? state.completedRuns.filter(run => run.profile.releaseId === releaseId)
    : state.completedRuns
  return { version: 2, runs: runs.map(run => ({ ...run })) }
}

export function discardActiveOmrSequenceEvidence(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  return updateState(state => { state.activeRun = null; state.plan = null; state.lastIssue = null }, storage)
}

export function clearCompletedOmrSequenceEvidence(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultWriteStorage(),
): boolean {
  return updateState(state => { state.completedRuns = [] }, storage)
}

export function downloadOmrSequenceEvidenceManifest(releaseId?: string): number {
  const manifest = buildOmrSequenceEvidenceManifest(undefined, releaseId)
  if (manifest.runs.length === 0 || typeof document === 'undefined') return 0
  const releases = new Set(manifest.runs.map(run => run.profile.releaseId))
  if (releases.size !== 1) return 0
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const manifestReleaseId = manifest.runs[0]?.profile.releaseId ?? 'unconfigured'
  link.download = `omr-sequence-evidence-v2-${manifestReleaseId}.json`
  link.click()
  URL.revokeObjectURL(url)
  return manifest.runs.length
}
