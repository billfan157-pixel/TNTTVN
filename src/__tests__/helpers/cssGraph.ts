import fs from 'node:fs'
import path from 'node:path'

const relativeCssImport = /^\s*@import\s+["'](\.[^"']+\.css)["'];\s*$/gm

export function readCssGraph(entryPath: string) {
  const active = new Set<string>()
  const visited = new Set<string>()

  const expand = (filePath: string): string => {
    const resolved = path.resolve(filePath)
    if (active.has(resolved)) throw new Error(`Circular CSS import detected at ${resolved}`)
    if (visited.has(resolved)) throw new Error(`Duplicate CSS import detected at ${resolved}`)
    active.add(resolved)
    visited.add(resolved)

    const content = fs.readFileSync(resolved, 'utf8')
    const expanded = content.replace(relativeCssImport, (_statement, importPath: string) => (
      expand(path.resolve(path.dirname(resolved), importPath))
    ))

    active.delete(resolved)
    return expanded
  }

  return expand(entryPath)
}
