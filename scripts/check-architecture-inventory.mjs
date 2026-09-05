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

function countRouteModules() {
  return directTypeScriptFiles('server/src/routes')
    .filter((file) => /\bnew\s+Hono(?:<[^>]+>)?\s*\(/.test(fs.readFileSync(file, 'utf8')))
    .length
}

function countOccurrences(source, pattern) {
  return [...source.matchAll(pattern)].length
}

const sourceInventory = {
  routes: countRouteModules(),
  repositories: countFiles('server/src/repositories'),
  services: countFiles('server/src/services'),
  domain: countFiles('server/src/domain'),
  tables: countOccurrences(fs.readFileSync(path.join(repoRoot, 'server/src/db/schema.ts'), 'utf8'), /\bsqliteTable\s*\(/g),
}

const architecture = fs.readFileSync(path.join(repoRoot, 'docs/02_ARCHITECTURE.md'), 'utf8')
const documentedPatterns = {
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

if (problems.length > 0) {
  console.error(`Architecture inventory drift detected:\n- ${problems.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`Architecture inventory verified: ${JSON.stringify(sourceInventory)}`)
}
