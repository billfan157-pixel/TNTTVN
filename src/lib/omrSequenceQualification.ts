import type { OmrSequenceManifest, OmrSequenceProfile, OmrSequenceTargets } from './omrSequenceBenchmark'

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

/** Merge completed-run exports without deduplicating evidence silently. */
export function mergeOmrSequenceManifests(manifests: OmrSequenceManifest[]): OmrSequenceManifest {
  if (manifests.length === 0 || manifests.some(manifest => manifest?.version !== 2 || !Array.isArray(manifest.runs))) {
    throw new Error('invalid_sequence_manifest_v2')
  }
  return { version: 2, runs: manifests.flatMap(manifest => manifest.runs) }
}

/** Scaffold is intentionally non-runnable: an owner must set every product target. */
export function buildOmrSequenceTargetsScaffold(manifest: OmrSequenceManifest): OmrSequenceTargets {
  const unique = new Map<string, OmrSequenceProfile>()
  for (const run of manifest.runs) unique.set(profileKey(run.profile), run.profile)
  if (new Set([...unique.values()].map(profile => profile.releaseId)).size !== 1) {
    throw new Error('mixed_sequence_releases')
  }
  return {
    version: 2,
    requiredProfiles: [...unique.values()],
    proposalP95Ms: null,
    durableP95Ms: null,
    acknowledgementP95Ms: null,
    longTasksPer100SheetsMax: null,
    memoryGrowthMbMax: null,
    papersPerMinuteMin: null,
    proposalLatencyDriftRatioMax: null,
  }
}

export function downloadOmrSequenceTargetsScaffold(manifest: OmrSequenceManifest): number {
  if (manifest.runs.length === 0 || typeof document === 'undefined') return 0
  const scaffold = buildOmrSequenceTargetsScaffold(manifest)
  const releaseId = scaffold.requiredProfiles[0]?.releaseId
  if (!releaseId) return 0
  const blob = new Blob([JSON.stringify(scaffold, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `omr-sequence-targets-v2-${releaseId}.json`
  link.click()
  URL.revokeObjectURL(url)
  return scaffold.requiredProfiles.length
}
