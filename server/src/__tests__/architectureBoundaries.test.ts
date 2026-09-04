import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Phase 3 (P2-05): executable architecture gate — domain/ KHÔNG có runtime
// imports ra infrastructure (middleware/services/repositories/db/schema).
// Cho phép: type-only imports (xóa lúc compile), domain siblings (./),
// utils thuần đã liệt kê. Vi phạm làm CI đỏ thay vì drift thầm lặng.
const DOMAIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'domain')

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
})
