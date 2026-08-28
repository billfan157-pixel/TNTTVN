import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { evaluateOmrSequenceGate, type OmrSequenceManifest, type OmrSequenceTargets } from '../src/lib/omrSequenceBenchmark'
import { buildOmrSequenceTargetsScaffold, mergeOmrSequenceManifests } from '../src/lib/omrSequenceQualification'

const args = process.argv.slice(2)
const scaffoldMode = args[0] === '--scaffold-targets'
const positional = scaffoldMode ? args.slice(1) : args
const envManifestPaths = process.env.OMR_SEQUENCE_MANIFEST?.split(',').filter(Boolean) ?? []
const manifestPaths = positional.length > (scaffoldMode ? 0 : 1)
  ? positional.slice(0, scaffoldMode ? undefined : -1)
  : envManifestPaths
const targetsPath = scaffoldMode ? undefined : positional.at(-1) || process.env.OMR_SEQUENCE_TARGETS

if (manifestPaths.length === 0 || (!scaffoldMode && !targetsPath)) {
  console.error('Usage: npm run benchmark:omr:sequence -- <manifest-30.json> [manifest-100.json ...] <targets.json>')
  console.error('   or: npm run benchmark:omr:sequence -- --scaffold-targets <manifest.json ...>')
  process.exit(1)
}

const manifests = await Promise.all(manifestPaths.map(async path => (
  JSON.parse(await readFile(resolve(path), 'utf8')) as OmrSequenceManifest
)))
const manifest = mergeOmrSequenceManifests(manifests)
if (scaffoldMode) {
  console.log(JSON.stringify(buildOmrSequenceTargetsScaffold(manifest), null, 2))
  process.exit(0)
}
const targets = JSON.parse(await readFile(resolve(targetsPath), 'utf8')) as OmrSequenceTargets
const report = evaluateOmrSequenceGate(manifest, targets)
console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exit(1)
