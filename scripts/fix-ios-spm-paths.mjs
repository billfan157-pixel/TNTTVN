import { readFile, writeFile } from 'node:fs/promises'

// Capacitor CLI on Windows may emit backslashes inside Swift string literals,
// which become invalid escape sequences on the macOS/iOS build runner.
const packagePath = new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url)
const source = await readFile(packagePath, 'utf8')
const normalized = source
  .split(/(?<=\n)/)
  .map(line => line.includes('.package(') && line.includes('path:') ? line.replaceAll('\\', '/') : line)
  .join('')
if (normalized !== source) await writeFile(packagePath, normalized, 'utf8')
