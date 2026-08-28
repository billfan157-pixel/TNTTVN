export interface OmrSequenceProfile {
  engineVersion: string
  releaseId: string
  deviceProfile: string
  browser: string
  frameWidth: number
  frameHeight: number
  templateMode: 'integrated' | 'full_page'
  questionCount: number
}

export interface OmrSequenceRun {
  runId: string
  profile: OmrSequenceProfile
  sheets: number
  unresolvedSamples: number
  routedUnresolved: number
  reloadAttempts: number
  reloadRecovered: number
  falseRearmCount: number
  staleIdentityCount: number
  duplicateProposalCount: number
  duplicateDurableMutationCount: number
  lostMutationCount: number
  acknowledgementCorruptionCount: number
  proposalDurationsMs: number[]
  durableDurationsMs: number[]
  acknowledgementDurationsMs: number[]
  longTaskCount: number
  longTaskTotalMs: number
  responsivenessObserver: 'long-animation-frame' | 'longtask' | 'external' | 'unsupported'
  memoryMeasurement: 'measure-memory' | 'performance-memory' | 'external' | 'unsupported'
  memoryStartMb?: number
  memoryEndMb?: number
  memoryPeakMb?: number
  runElapsedMs: number
}

export interface OmrSequenceManifest {
  version: 2
  runs: OmrSequenceRun[]
}

export interface OmrSequenceTargets {
  version: 2
  requiredProfiles: OmrSequenceProfile[]
  proposalP95Ms: number | null
  durableP95Ms: number | null
  acknowledgementP95Ms: number | null
  longTasksPer100SheetsMax: number | null
  memoryGrowthMbMax: number | null
  papersPerMinuteMin: number | null
  proposalLatencyDriftRatioMax: number | null
}

export interface OmrSequenceProfileReport {
  profile: OmrSequenceProfile
  runCount: number
  sheetCount: number
  has30SheetRun: boolean
  has100SheetRun: boolean
  proposalP95Ms: number
  durableP95Ms: number
  acknowledgementP95Ms: number
  longTasksPer100Sheets: number
  memoryGrowthMbMax: number | null
  papersPerMinuteMin: number
  proposalLatencyDriftRatioMax: number
  safetyFailures: number
  unresolvedSampleCount: number
  unresolvedRoutingRate: number
  reloadAttemptCount: number
  reloadRecoveryRate: number
}

const PROFILE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/

export interface OmrSequenceGateReport {
  passed: boolean
  reasons: string[]
  profiles: OmrSequenceProfileReport[]
}

function profileKey(profile: OmrSequenceProfile): string {
  return [
    profile.engineVersion,
    profile.releaseId,
    profile.deviceProfile,
    profile.browser,
    `${profile.frameWidth}x${profile.frameHeight}`,
    profile.templateMode,
    profile.questionCount,
  ].join('|')
}

function percentile95(values: number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
}

function validCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function validateProfile(profile: OmrSequenceProfile): boolean {
  return /^omr-v4-[A-Za-z0-9._-]+$/.test(profile.engineVersion)
    && /^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/.test(profile.releaseId)
    && !['dev', 'local', 'unknown'].includes(profile.releaseId.toLowerCase())
    && PROFILE_LABEL.test(profile.deviceProfile)
    && PROFILE_LABEL.test(profile.browser)
    && validCount(profile.frameWidth) && profile.frameWidth > 0
    && validCount(profile.frameHeight) && profile.frameHeight > 0
    && validCount(profile.questionCount) && profile.questionCount > 0
    && (profile.templateMode === 'integrated' || profile.templateMode === 'full_page')
}

function proposalDriftRatio(run: OmrSequenceRun): number {
  const windowSize = Math.max(1, Math.floor(run.sheets / 4))
  const firstP95 = percentile95(run.proposalDurationsMs.slice(0, windowSize))
  const lastP95 = percentile95(run.proposalDurationsMs.slice(-windowSize))
  if (firstP95 === 0) return lastP95 === 0 ? 1 : Number.POSITIVE_INFINITY
  return lastP95 / firstP95
}

function validDurations(values: number[], sheets: number): boolean {
  return values.length === sheets && values.every(value => Number.isFinite(value) && value >= 0)
}

export function evaluateOmrSequenceGate(
  manifest: OmrSequenceManifest,
  targets: OmrSequenceTargets,
): OmrSequenceGateReport {
  const reasons: string[] = []
  if (manifest?.version !== 2 || !Array.isArray(manifest.runs)) {
    return { passed: false, reasons: ['invalid_manifest'], profiles: [] }
  }
  if (targets?.version !== 2 || !Array.isArray(targets.requiredProfiles) || targets.requiredProfiles.length === 0) {
    return { passed: false, reasons: ['required_profiles_not_configured'], profiles: [] }
  }
  const requiredProfileKeys = new Set<string>()
  const requiredReleaseIds = new Set<string>()
  for (const profile of targets.requiredProfiles) {
    const key = profileKey(profile)
    if (!validateProfile(profile)) reasons.push(`invalid_required_profile:${key}`)
    if (requiredProfileKeys.has(key)) reasons.push(`duplicate_required_profile:${key}`)
    requiredProfileKeys.add(key)
    requiredReleaseIds.add(profile.releaseId)
  }
  if (requiredReleaseIds.size !== 1) reasons.push('mixed_required_releases')
  const metricTargets = [
    targets.proposalP95Ms,
    targets.durableP95Ms,
    targets.acknowledgementP95Ms,
    targets.longTasksPer100SheetsMax,
    targets.memoryGrowthMbMax,
  ]
  if (
    metricTargets.some(value => value === null || !Number.isFinite(value) || (value as number) < 0)
    || targets.papersPerMinuteMin === null
    || !Number.isFinite(targets.papersPerMinuteMin)
    || targets.papersPerMinuteMin <= 0
    || targets.proposalLatencyDriftRatioMax === null
    || !Number.isFinite(targets.proposalLatencyDriftRatioMax)
    || targets.proposalLatencyDriftRatioMax < 1
  ) {
    reasons.push('performance_targets_not_configured')
  }

  const seenRunIds = new Set<string>()
  const grouped = new Map<string, OmrSequenceRun[]>()
  for (const run of manifest.runs) {
    const counts = [
      run.sheets, run.unresolvedSamples, run.routedUnresolved, run.reloadAttempts, run.reloadRecovered,
      run.falseRearmCount, run.staleIdentityCount, run.duplicateProposalCount,
      run.duplicateDurableMutationCount, run.lostMutationCount, run.acknowledgementCorruptionCount,
      run.longTaskCount,
    ]
    const valid = Boolean(run.runId?.trim())
      && !seenRunIds.has(run.runId)
      && validateProfile(run.profile)
      && counts.every(validCount)
      && run.sheets > 0
      && run.routedUnresolved <= run.unresolvedSamples
      && run.reloadRecovered <= run.reloadAttempts
      && validDurations(run.proposalDurationsMs, run.sheets)
      && validDurations(run.durableDurationsMs, run.sheets)
      && validDurations(run.acknowledgementDurationsMs, run.sheets)
      && Number.isFinite(run.longTaskTotalMs) && run.longTaskTotalMs >= 0
      && Number.isFinite(run.runElapsedMs) && run.runElapsedMs > 0
      && ['long-animation-frame', 'longtask', 'external', 'unsupported'].includes(run.responsivenessObserver)
      && ['measure-memory', 'performance-memory', 'external', 'unsupported'].includes(run.memoryMeasurement)
    if (!valid) {
      reasons.push(`invalid_run:${run.runId || 'missing'}`)
      continue
    }
    seenRunIds.add(run.runId)
    const key = profileKey(run.profile)
    grouped.set(key, [...(grouped.get(key) ?? []), run])
  }
  for (const key of grouped.keys()) {
    if (!requiredProfileKeys.has(key)) reasons.push(`unexpected_profile:${key}`)
  }

  const profiles: OmrSequenceProfileReport[] = []
  for (const requiredProfile of targets.requiredProfiles) {
    const key = profileKey(requiredProfile)
    const runs = grouped.get(key) ?? []
    if (runs.length === 0) {
      reasons.push(`missing_profile:${key}`)
      continue
    }
    const sheets = runs.reduce((sum, run) => sum + run.sheets, 0)
    const unresolved = runs.reduce((sum, run) => sum + run.unresolvedSamples, 0)
    const routed = runs.reduce((sum, run) => sum + run.routedUnresolved, 0)
    const reloads = runs.reduce((sum, run) => sum + run.reloadAttempts, 0)
    const recovered = runs.reduce((sum, run) => sum + run.reloadRecovered, 0)
    const safetyFailures = runs.reduce((sum, run) => sum
      + run.falseRearmCount
      + run.staleIdentityCount
      + run.duplicateProposalCount
      + run.duplicateDurableMutationCount
      + run.lostMutationCount
      + run.acknowledgementCorruptionCount, 0)
    const memoryGrowth = runs
      .filter(run => run.memoryStartMb !== undefined && run.memoryEndMb !== undefined && run.memoryPeakMb !== undefined)
      .map(run => Math.max((run.memoryEndMb as number) - (run.memoryStartMb as number), (run.memoryPeakMb as number) - (run.memoryStartMb as number)))
    const report: OmrSequenceProfileReport = {
      profile: requiredProfile,
      runCount: runs.length,
      sheetCount: sheets,
      has30SheetRun: runs.some(run => run.sheets >= 30 && run.sheets < 100),
      has100SheetRun: runs.some(run => run.sheets >= 100),
      proposalP95Ms: percentile95(runs.flatMap(run => run.proposalDurationsMs)),
      durableP95Ms: percentile95(runs.flatMap(run => run.durableDurationsMs)),
      acknowledgementP95Ms: percentile95(runs.flatMap(run => run.acknowledgementDurationsMs)),
      longTasksPer100Sheets: sheets > 0 ? runs.reduce((sum, run) => sum + run.longTaskCount, 0) / sheets * 100 : Number.POSITIVE_INFINITY,
      memoryGrowthMbMax: memoryGrowth.length > 0 ? Math.max(...memoryGrowth) : null,
      papersPerMinuteMin: Math.min(...runs.map(run => run.sheets / (run.runElapsedMs / 60_000))),
      proposalLatencyDriftRatioMax: Math.max(...runs.map(proposalDriftRatio)),
      safetyFailures,
      unresolvedSampleCount: unresolved,
      unresolvedRoutingRate: unresolved > 0 ? routed / unresolved : 1,
      reloadAttemptCount: reloads,
      reloadRecoveryRate: reloads > 0 ? recovered / reloads : 1,
    }
    profiles.push(report)

    if (!report.has30SheetRun) reasons.push(`missing_30_sheet_run:${key}`)
    if (!report.has100SheetRun) reasons.push(`missing_100_sheet_run:${key}`)
    if (report.safetyFailures > 0) reasons.push(`safety_failure:${key}`)
    if (report.unresolvedSampleCount === 0) reasons.push(`unresolved_evidence_missing:${key}`)
    if (report.unresolvedRoutingRate !== 1) reasons.push(`unresolved_not_routed:${key}`)
    if (report.reloadAttemptCount === 0) reasons.push(`reload_evidence_missing:${key}`)
    if (report.reloadRecoveryRate !== 1) reasons.push(`reload_not_recovered:${key}`)
    if (runs.some(run => run.responsivenessObserver === 'unsupported')) reasons.push(`responsiveness_evidence_missing:${key}`)
    if (runs.some(run => run.memoryMeasurement === 'unsupported')) reasons.push(`memory_measurement_unsupported:${key}`)
    if (targets.proposalP95Ms !== null && report.proposalP95Ms > targets.proposalP95Ms) reasons.push(`proposal_p95_exceeded:${key}`)
    if (targets.durableP95Ms !== null && report.durableP95Ms > targets.durableP95Ms) reasons.push(`durable_p95_exceeded:${key}`)
    if (targets.acknowledgementP95Ms !== null && report.acknowledgementP95Ms > targets.acknowledgementP95Ms) reasons.push(`ack_p95_exceeded:${key}`)
    if (targets.longTasksPer100SheetsMax !== null && report.longTasksPer100Sheets > targets.longTasksPer100SheetsMax) reasons.push(`long_tasks_exceeded:${key}`)
    if (report.memoryGrowthMbMax === null) reasons.push(`memory_evidence_missing:${key}`)
    else if (targets.memoryGrowthMbMax !== null && report.memoryGrowthMbMax > targets.memoryGrowthMbMax) reasons.push(`memory_growth_exceeded:${key}`)
    if (targets.papersPerMinuteMin !== null && report.papersPerMinuteMin < targets.papersPerMinuteMin) reasons.push(`throughput_below_target:${key}`)
    if (targets.proposalLatencyDriftRatioMax !== null && report.proposalLatencyDriftRatioMax > targets.proposalLatencyDriftRatioMax) reasons.push(`proposal_drift_exceeded:${key}`)
  }

  return { passed: reasons.length === 0, reasons: [...new Set(reasons)], profiles }
}
