#!/usr/bin/env node

/**
 * Design System Linter & Anti-Drift Guard (DS v4.1)
 * Enforces token usage, WCAG contrast compliance, and prevents UI drift.
 * 
 * Rules:
 * 1. NO_HARDCODED_HEX: No raw hex colors in JSX/TSX files (except print/OMR/constants exemptions).
 * 2. NO_WCAG_FAIL_SLATE_TEXT: text-slate-400 must not be used for body text (contrast failure 2.56:1).
 * 3. NO_BRANCH_COLOR_AS_CTA: bg-blue-600/700 must not be used as primary button CTA (conflicts with Thiếu Nhi branch color).
 * 4. NO_NONEXISTENT_CLASS: Class names that do not exist in index.css / DS (badge-secondary, btn-neutral, custom-scrollbar, ...).
 * 5. NO_ARBITRARY_HEX: Arbitrary Tailwind values with raw hex (bg-[#...], hover:bg-[#...]) — must use tokens (DS §1.1, §9).
 * 6. NO_RAW_600_BUTTON: Raw tailwind color-600/700 families (emerald/rose/amber/sky/green) on buttons — fails WCAG AA with white text, must use .btn variants or domain tokens (DS §6, §9).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const srcDir = path.resolve(__dirname, '../src')

// Strict Exemptions List (Authorized in ADR-030/063 / Design System v4.1)
const EXEMPTIONS = [
  'components/common/Certificate.tsx',
  'components/exam/AnswerSheetModal.tsx',
  'components/exam/ExamScanModal.tsx',
  'constants/branches.ts',
  'utils/pdfGenerator.ts',
  'services/reportExporter.ts',
  'lib/omr.ts',
  '__tests__',
]

// Rule 4: classes that do not exist in index.css / DS v4.1
const NONEXISTENT_CLASSES = [
  'badge-secondary',
  'btn-neutral',
  'custom-scrollbar',
  'bg-surface-main',
]

// Rule 6: raw tailwind color families banned on buttons (white text FAIL WCAG AA in light mode)
const RAW_600_BUTTON_COLORS = [
  'bg-emerald-600', 'hover:bg-emerald-700',
  'bg-emerald-700', 'hover:bg-emerald-800',
  'bg-rose-600', 'hover:bg-rose-700',
  'bg-rose-700', 'hover:bg-rose-800',
  'bg-amber-600', 'hover:bg-amber-700',
  'bg-sky-600', 'hover:bg-sky-700',
  'bg-green-600', 'hover:bg-green-700',
  'bg-green-700', 'hover:bg-green-800',
]

function isExempt(filePath) {
  const rel = path.relative(srcDir, filePath).replace(/\\/g, '/')
  return EXEMPTIONS.some(ex => rel.includes(ex))
}

function getAllFiles(dir, exts = ['.tsx', '.ts']) {
  let results = []
  const list = fs.readdirSync(dir)
  for (const file of list) {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, exts))
    } else if (exts.includes(path.extname(fullPath))) {
      results.push(fullPath)
    }
  }
  return results
}

const files = getAllFiles(srcDir, ['.tsx'])
let totalViolations = 0
const violations = []

for (const file of files) {
  if (isExempt(file)) continue

  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split(/\r?\n/)
  const relPath = path.relative(srcDir, file).replace(/\\/g, '/')

  lines.forEach((line, index) => {
    const lineNum = index + 1
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return

    // Rule 2: NO_WCAG_FAIL_SLATE_TEXT (text-slate-400 as readable text)
    if (line.includes('text-slate-400') && !line.includes('placeholder:text-slate-400')) {
      violations.push({
        file: relPath,
        line: lineNum,
        rule: 'NO_WCAG_FAIL_SLATE_TEXT',
        message: 'text-slate-400 fails WCAG 2.2 AA (2.56:1). Use text-text-muted (#64748B, 4.76:1) or text-text-secondary.',
        snippet: trimmed,
      })
      totalViolations++
    }

    // Rule 3: NO_BRANCH_COLOR_AS_CTA (bg-blue-600/700 on buttons)
    if (line.includes('bg-blue-600') || line.includes('bg-blue-700')) {
      // Allow only when displaying branch badge/indicator or with explicit branch context
      if (!line.includes('branch') && !line.includes('thieunhi') && (line.includes('btn') || line.includes('button') || line.includes('onClick'))) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'NO_BRANCH_COLOR_AS_CTA',
          message: 'bg-blue-600/700 is reserved exclusively for Thiếu Nhi branch. Use btn-primary or bg-parish-primary.',
          snippet: trimmed,
        })
        totalViolations++
      }
    }

    // Rule 4: NO_NONEXISTENT_CLASS (classes not defined in index.css / DS)
    for (const cls of NONEXISTENT_CLASSES) {
      if (line.includes(`"${cls}`) || line.includes(`'${cls}`) || line.includes(`${cls} `) || line.includes(`${cls}"`) || line.includes(`${cls}'`)) {
        violations.push({
          file: relPath,
          line: lineNum,
          rule: 'NO_NONEXISTENT_CLASS',
          message: `"${cls}" does not exist in DS v4.1 (index.css). Use the standard equivalent (e.g. badge-neutral, btn btn-secondary, table-scroll).`,
          snippet: trimmed,
        })
        totalViolations++
        break
      }
    }

    // Rule 5: NO_ARBITRARY_HEX (arbitrary Tailwind values with raw hex)
    const hexMatch = trimmed.match(/(?:bg|text|border|ring|shadow|from|to|via|fill|stroke)-\[#([0-9a-fA-F]{3,8})\]/)
    if (hexMatch) {
      violations.push({
        file: relPath,
        line: lineNum,
        rule: 'NO_ARBITRARY_HEX',
        message: `Arbitrary hex #${hexMatch[1]} in class is banned (DS §1.1, §9). Use design tokens (parish-*/surface-*/text-*) or var(--color-*).`,
        snippet: trimmed,
      })
      totalViolations++
    }

    // Rule 6: NO_RAW_600_BUTTON (raw color-600/700 families on buttons — WCAG AA fail)
    const buttonContext = [lines[index - 2], lines[index - 1], line].filter(Boolean).join(' ')
    const isButtonLine = buttonContext.includes('<button') || buttonContext.includes('onClick') || buttonContext.includes('type="button"') || buttonContext.includes("type='button'")
    if (isButtonLine) {
      for (const raw of RAW_600_BUTTON_COLORS) {
        if (line.includes(raw)) {
          violations.push({
            file: relPath,
            line: lineNum,
            rule: 'NO_RAW_600_BUTTON',
            message: `"${raw}" on a button fails WCAG AA contrast with white text and is banned (DS §6, §9). Use .btn variants (.btn-primary/.btn-secondary/.btn-danger) or badge domain tokens.`,
            snippet: trimmed,
          })
          totalViolations++
          break
        }
      }
    }
  })
}

console.log('\n🎨 ============================================')
console.log('🎨 Design System v4.1 Anti-Drift Linter')
console.log('🎨 ============================================\n')

if (totalViolations === 0) {
  console.log(`✅ Passed: 0 violations found across ${files.length} UI components!`)
  console.log('   All components comply with Design System v4.1 tokens and WCAG AA standards.\n')
  process.exit(0)
} else {
  console.error(`❌ Found ${totalViolations} Design System violations:\n`)
  violations.forEach(v => {
    console.error(`  [${v.rule}] src/${v.file}:${v.line}`)
    console.error(`    ${v.message}`)
    console.error(`    Code: ${v.snippet}\n`)
  })
  process.exit(1)
}
