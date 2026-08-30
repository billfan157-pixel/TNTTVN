import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCssGraph } from './helpers/cssGraph'

const srcRoot = path.resolve(__dirname, '..')
const entryPath = path.join(srcRoot, 'index.css')
const moduleDir = path.join(srcRoot, 'styles/design-system')
const expectedImports = [
  '00-tokens.css',
  '10-foundations.css',
  '20-primitives.css',
  '30-theme-media.css',
  '40-mobile-shell.css',
  '50-app-shell.css',
  '60-view-language.css',
  '70-sidebar.css',
]

function collectFiles(directory: string, extension: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const resolved = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectFiles(resolved, extension)
    return entry.isFile() && entry.name.endsWith(extension) ? [resolved] : []
  })
}

describe('Design System CSS import graph', () => {
  it('keeps one ordered entrypoint with every module reachable exactly once', () => {
    const entry = fs.readFileSync(entryPath, 'utf8')
    const localImports = [...entry.matchAll(/@import\s+"\.\/styles\/design-system\/([^"]+\.css)";/g)]
      .map(match => match[1])
    const moduleFiles = fs.readdirSync(moduleDir).filter(file => file.endsWith('.css')).sort()

    expect(entry.startsWith('@import "tailwindcss" source(none);')).toBe(true)
    expect(localImports).toEqual(expectedImports)
    expect(moduleFiles).toEqual(expectedImports)
    expect(new Set(localImports).size).toBe(localImports.length)
    expect(() => readCssGraph(entryPath)).not.toThrow()
  })

  it('keeps source discovery and the dark variant owned by the entrypoint', () => {
    const entry = fs.readFileSync(entryPath, 'utf8')
    const modules = expectedImports.map(file => fs.readFileSync(path.join(moduleDir, file), 'utf8')).join('\n')

    expect(entry).toContain('@source "./";')
    expect(entry).toContain('@source "../index.html";')
    expect(entry).toContain('@custom-variant dark')
    expect(modules).not.toContain('@source ')
    expect(modules).not.toContain('@custom-variant dark')
  })

  it('keeps cascade ownership out of layers and component modules', () => {
    const cssFiles = collectFiles(srcRoot, '.css')
    const sourceFiles = [
      ...collectFiles(srcRoot, '.ts'),
      ...collectFiles(srcRoot, '.tsx'),
    ]
    const componentCssImports = sourceFiles.flatMap(file => {
      const content = fs.readFileSync(file, 'utf8')
      return [...content.matchAll(/(?:import|require\()\s*['"]([^'"]+\.css)['"]/g)]
        .map(match => ({ file, importPath: match[1] }))
    })

    for (const file of cssFiles) {
      expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/@layer\b/)
    }
    expect(componentCssImports).toEqual([
      { file: path.join(srcRoot, 'main.tsx'), importPath: './index.css' },
    ])
  })

  it('keeps motion property-specific inside the CSS graph', () => {
    expect(readCssGraph(entryPath)).not.toMatch(/transition\s*:\s*all\b/)
  })
})
