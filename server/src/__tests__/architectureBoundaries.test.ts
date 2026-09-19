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
const CLIENT_SRC_DIR = join(SERVER_SRC_DIR, '..', '..', 'src')

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
    ]) {
      expect(source).toContain(stopCall)
    }
    expect(source).not.toMatch(/server\.close\s*\(\s*\(\s*\)\s*=>\s*process\.exit/)
  })

  it('ARCH-P2-004: required recovery and workers initialize before HTTP bind', () => {
    const source = readFileSync(join(SERVER_SRC_DIR, 'index.ts'), 'utf8')
    // WATCH-RESTART (2026-09-19): the composition root now binds through
    // createAdaptorServer() + an awaited server.listen() (with an EADDRINUSE
    // retry for the dev watcher) instead of serve(). Assert ordering against the
    // first listen() call — still the single HTTP bind point in the process.
    const bind = source.indexOf('server.listen(')
    expect(bind).toBeGreaterThan(-1)
    for (const startupCall of [
      'await initNotificationQueue()',
      'initSundayReminderScheduler()',
      'initOperationsReminderScheduler()',
      'initOperationsEventLifecycleScheduler()',
      'initOperationsTaskDispatchScheduler()',
      'initOperationsManagerReminderScheduler()',
      'initBackupScheduler()',
    ]) {
      expect(source.indexOf(startupCall), startupCall).toBeGreaterThan(-1)
      expect(source.indexOf(startupCall), startupCall).toBeLessThan(bind)
    }
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

  it('ARCH-P2-003: new route modules cannot introduce direct transaction ownership', () => {
    // These are explicit legacy/application-command boundaries, not proof that
    // every route follows the same profile. The ratchet prevents the exception
    // set from growing while extraction remains change-driven.
    const approvedRouteCommandBoundaries = new Set([
      'attendance.ts', 'auth.ts', 'backup.ts', 'grades.ts', 'leaveRequests.ts',
      'notifications.ts', 'semesterLocks.ts', 'settings.ts', 'verification.ts',
    ])
    const violations: string[] = []
    for (const file of readdirSync(ROUTE_DIR).filter((name) => name.endsWith('.ts'))) {
      const source = readFileSync(join(ROUTE_DIR, file), 'utf8')
      const ownsTransaction = /\brunDbTransaction\s*\(/.test(source)
      if (ownsTransaction && !approvedRouteCommandBoundaries.has(file)) violations.push(file)
    }
    expect(violations).toEqual([])
  })

  it('ARCH-P2-001: Operations mutations delegate transaction lifecycle and receipt ownership', () => {
    const source = readFileSync(join(ROUTE_DIR, 'operations.ts'), 'utf8')
    expect(source).toContain('runIdempotentOperationsCommand')
    expect(source).not.toMatch(/\brunDbTransaction\s*\(/)
    // Five read-only authorization/readiness/detail snapshots remain explicit
    // composition dependencies; they are not mutation boundaries. Ratchet the
    // count so a new direct transaction requires an architecture decision.
    expect(source.match(/\bdb\.transaction\s*\(/g)).toHaveLength(5)
    expect(source).toMatch(/db\.transaction\(tx => listOperationsCandidates/)
  })

  it('ARCH-P1-001: reporting projections remain read-only and transport has no persistence edge', () => {
    const route = readFileSync(join(ROUTE_DIR, 'reporting.ts'), 'utf8')
    expect(runtimeImports(route).some((specifier) => specifier.startsWith('../db/'))).toBe(false)
    for (const file of ['ReportCardProjectionRepository.ts', 'ClassSummaryProjectionRepository.ts']) {
      const source = readFileSync(join(REPOSITORY_DIR, file), 'utf8')
      expect(source, file).not.toMatch(/\.(?:insert|update|delete)\s*\(/)
    }
  })

  it('ARCH-P1-001: official client report surfaces cannot recalculate from grade/attendance stores', () => {
    const files = [
      'components/common/PrintReportModal.tsx',
      'components/common/StudentReportModal.tsx',
      'components/desktop/DesktopReports.tsx',
      'components/mobile/MobileReportsView.tsx',
      'services/reportExporter.ts',
      'services/officialReporting.ts',
    ]
    const violations: string[] = []
    for (const relative of files) {
      const source = readFileSync(join(CLIENT_SRC_DIR, relative), 'utf8')
      if (/stores\/(?:gradeStore|attendanceStore)/.test(source)
        || /ReportViewModelFactory\.createStudentViewModel/.test(source)
        || /generate(?:StudentReportCard|ClassGradebook)HTML/.test(source)) {
        violations.push(relative)
      }
    }
    const pdfSource = readFileSync(join(CLIENT_SRC_DIR, 'utils/pdfGenerator.ts'), 'utf8')
    expect(pdfSource).not.toContain('getClassificationLabel(g.gpa')
    expect(violations).toEqual([])
  })

  it('ARCH-P2-001: Parish Events transport cannot regain calendar write authority', () => {
    const source = readFileSync(join(ROUTE_DIR, 'parishEvents.ts'), 'utf8')
    expect(source).toContain('CALENDAR_READ_ONLY')
    expect(source).not.toMatch(/\b(?:tx|db)\.(?:insert|update|delete)\s*\(/)
  })
})
