import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('PWA lazy vendor policy', () => {
  it('does not precache heavy document parsers before import/export is requested', () => {
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
    const loader = readFileSync(resolve(process.cwd(), 'src/lib/xlsxLoader.ts'), 'utf8')
    const questionBankImporter = readFileSync(resolve(process.cwd(), 'src/utils/questionBankImport.ts'), 'utf8')

    expect(config).toContain("globIgnores: ['**/xlsx-*.js', '**/mammoth-*.js', '**/vendor-scanner-*.js']")
    expect(config).toContain("return 'mammoth'")
    expect(loader).toMatch(/import\(['"]xlsx['"]\)/)
    expect(questionBankImporter).toMatch(/import\(['"]mammoth['"]\)/)
  })
})
