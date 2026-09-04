import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Phase 3 (P2-05): executable architecture gate — domain/ KHÔNG có runtime
// imports ra infrastructure (middleware/services/repositories/db/schema).
// Cho phép: type-only imports (xóa lúc compile), domain siblings (./),
// utils thuần đã liệt kê. Vi phạm làm CI đỏ thay vì drift thầm lặng.
const DOMAIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'domain')
const SERVER_SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_DIR = join(SERVER_SRC_DIR, 'repositories')
const ROUTE_DIR = join(SERVER_SRC_DIR, 'routes')
const SERVICE_DIR = join(SERVER_SRC_DIR, 'services')
const CLIENT_STORE_DIR = join(SERVER_SRC_DIR, '..', '..', 'src', 'stores')

const ALLOWED_RUNTIME_SPECIFIERS = new Set([
  '../utils/phone.js', // pure, không DB/HTTP
])

function runtimeImports(source: string): string[] {
  const found: string[] = []
  for (const line of source.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('import')) continue
    if (/^import\s+type\b/.test(trimmed)) continue
    const match = trimmed.match(/from\s+['"]([^'"]+)['"]/)
    if (match) found.push(match[1])
  }
  return found
}

describe('Phase 3 — domain dependency gate', () => {
  it('domain/* không import runtime từ infrastructure', () => {
    const violations: string[] = []
    for (const file of readdirSync(DOMAIN_DIR).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(DOMAIN_DIR, file), 'utf8')
      for (const spec of runtimeImports(source)) {
        if (spec.startsWith('./')) continue
        if (ALLOWED_RUNTIME_SPECIFIERS.has(spec)) continue
        violations.push(`${file} → ${spec}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('T1: domain contracts do not import DB or transport types', () => {
    const violations: string[] = []
    for (const file of readdirSync(DOMAIN_DIR).filter((name) => name.endsWith('.ts'))) {
      const source = readFileSync(join(DOMAIN_DIR, file), 'utf8')
      if (/from\s+['"]\.\.\/(db|middleware)\//.test(source)) violations.push(file)
    }
    expect(violations).toEqual([])
  })

  it('T2: application services do not runtime-import HTTP middleware', () => {
    const transitionalAuthInfrastructure = new Set([
      'refreshSessionService.ts', // token issue/verification adapter
      'userService.ts', // super-admin identity configuration
    ])
    const violations: string[] = []
    for (const file of readdirSync(SERVICE_DIR).filter((name) => name.endsWith('.ts'))) {
      if (transitionalAuthInfrastructure.has(file)) continue
      const source = readFileSync(join(SERVICE_DIR, file), 'utf8')
      if (runtimeImports(source).some((specifier) => specifier.startsWith('../middleware/'))) {
        violations.push(file)
      }
    }
    expect(violations).toEqual([])
  })

  it('D5: repositories do not import application services', () => {
    const violations: string[] = []
    for (const file of readdirSync(REPOSITORY_DIR).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(REPOSITORY_DIR, file), 'utf8')
      if (/from\s+['"]\.\.\/services\//.test(source)) violations.push(file)
    }
    expect(violations).toEqual([])
  })

  it('D7: route modules do not own process lifecycle signal handlers', () => {
    const violations: string[] = []
    for (const file of readdirSync(ROUTE_DIR).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(ROUTE_DIR, file), 'utf8')
      if (/process\.on\s*\(/.test(source)) violations.push(file)
    }
    expect(violations).toEqual([])
  })

  it('D7: composition root owns and awaits resource shutdown', () => {
    const source = readFileSync(join(SERVER_SRC_DIR, 'index.ts'), 'utf8')
    for (const stopCall of [
      'stopBackupScheduler()',
      'stopSundayReminderScheduler()',
      'stopNotificationQueue()',
      'closeBrowser()',
      'stopTelegramBot()',
    ]) {
      expect(source).toContain(stopCall)
    }
    expect(source).not.toMatch(/server\.close\s*\(\s*\(\s*\)\s*=>\s*process\.exit/)
  })

  it('T3: client stores do not import React hooks', () => {
    const violations: string[] = []
    for (const file of readdirSync(CLIENT_STORE_DIR).filter((name) => name.endsWith('.ts'))) {
      const source = readFileSync(join(CLIENT_STORE_DIR, file), 'utf8')
      if (/from\s+['"]\.\.\/hooks\//.test(source) || /import\s*\(\s*['"]\.\.\/hooks\//.test(source)) {
        violations.push(file)
      }
    }
    expect(violations).toEqual([])
  })
})
