import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function directTypeScriptFiles(relativeDirectory) {
  const directory = path.join(repoRoot, relativeDirectory)
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(directory, entry.name))
}

function countFiles(relativeDirectory) {
  return directTypeScriptFiles(relativeDirectory).length
}

function countFilesRecursive(relativeDirectory, extension) {
  const root = path.join(repoRoot, relativeDirectory)
  let count = 0
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) count += countFilesRecursive(path.relative(repoRoot, fullPath), extension)
    else if (entry.isFile() && entry.name.endsWith(extension)) count += 1
  }
  return count
}

function countRouteModules() {
  return directTypeScriptFiles('server/src/routes')
    .filter((file) => /\bnew\s+Hono(?:<[^>]+>)?\s*\(/.test(fs.readFileSync(file, 'utf8')))
    .length
}

function countOccurrences(source, pattern) {
  return [...source.matchAll(pattern)].length
}

const sourceInventory = {
  pages: countFilesRecursive('src/pages', '.tsx'),
  components: countFilesRecursive('src/components', '.tsx'),
  stores: countFiles('src/stores'),
  routes: countRouteModules(),
  repositories: countFiles('server/src/repositories'),
  services: countFiles('server/src/services'),
  domain: countFiles('server/src/domain'),
  tables: countOccurrences(fs.readFileSync(path.join(repoRoot, 'server/src/db/schema.ts'), 'utf8'), /\bsqliteTable\s*\(/g),
}

const architecture = fs.readFileSync(path.join(repoRoot, 'docs/02_ARCHITECTURE.md'), 'utf8')
const documentedPatterns = {
  pages: /Pages:\s+(\d+)\s+source page modules/,
  components: /Components:\s+(\d+)\s+\(/,
  stores: /State:\s+(\d+)\s+Zustand stores/,
  routes: /Routes:\s+(\d+)\s+route modules/,
  repositories: /Repositories:\s+(\d+)\s+\(/,
  services: /Services:\s+(\d+)\s+under server\/src\/services/,
  domain: /Domain:\s+(\d+)\s+under server\/src\/domain/,
  tables: /Drizzle ORM \((\d+) tables\)/,
}

const problems = []
for (const [key, pattern] of Object.entries(documentedPatterns)) {
  const match = architecture.match(pattern)
  if (!match) {
    problems.push(`docs/02_ARCHITECTURE.md does not expose the ${key} inventory field`)
    continue
  }
  const documented = Number(match[1])
  if (documented !== sourceInventory[key]) {
    problems.push(`${key}: documented=${documented}, source=${sourceInventory[key]}`)
  }
}

const contextMap = fs.readFileSync(path.join(repoRoot, 'docs/AI_CONTEXT_MAP.md'), 'utf8')
// Inventory has one documentation owner: Architecture. The context map routes
// readers to it instead of maintaining a second set of independently stale counts.
if (!contextMap.includes('(./02_ARCHITECTURE.md#1-current-architecture)')) {
  problems.push('AI_CONTEXT_MAP must link to the canonical Architecture inventory')
}
const domainSections = [...contextMap.matchAll(/^## Domain: (.+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)]
if (domainSections.length === 0) problems.push('AI_CONTEXT_MAP has no domain navigation sections')
const navigationFields = [
  'Current authority',
  'Current canonical docs',
  'Current implementation entrypoints',
  'Current important invariants',
  'Current unresolved items',
]
for (const [, domain, body] of domainSections) {
  for (const field of navigationFields) {
    const entries = body.match(new RegExp(`^- \\*\\*${field}:\\*\\* +\\S.+$`, 'gm')) || []
    if (entries.length !== 1) problems.push(`AI_CONTEXT_MAP ${domain}: expected one ${field} field`)
  }
}
// Check the map's actual local entrypoints, including source files and directories.
// Audit findings and dated verification results remain in their owning documents.
for (const [, href] of contextMap.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
  if (href.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(href)) continue
  const target = path.resolve(repoRoot, 'docs', decodeURIComponent(href.split('#')[0]))
  if (!fs.existsSync(target)) problems.push(`AI_CONTEXT_MAP broken local link: ${href}`)
}

if (problems.length > 0) {
  console.error(`Architecture inventory drift detected:\n- ${problems.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`Architecture inventory verified: ${JSON.stringify(sourceInventory)}`)
}
