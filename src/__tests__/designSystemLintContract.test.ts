import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Design System anti-drift CLI contract', () => {
  it('reports its static scope without claiming full WCAG or visual conformance', () => {
    const root = path.resolve(__dirname, '../..')
    const output = execFileSync(process.execPath, [path.join(root, 'scripts/design-system-lint.mjs')], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(output).toContain('Design System v4.5 Anti-Drift Linter')
    expect(output).toMatch(/Scope: 8 static anti-drift rules across \d+ non-exempt application TSX files\./)
    expect(output).toContain('Debt ratchets: per-file ceilings')
    expect(output).toContain('This command does not certify full WCAG or visual conformance.')
    expect(output).toMatch(/Passed: 0 anti-drift violations across \d+ scanned TSX files\./)
    expect(output).not.toContain('All components comply')
    expect(output).not.toContain('WCAG AA standards')
  })
})
