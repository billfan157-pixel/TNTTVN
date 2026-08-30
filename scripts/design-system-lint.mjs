#!/usr/bin/env node

/**
 * Design System Linter & Anti-Drift Guard (DS v4.5)
 * Enforces eight source-level anti-drift rules. This static scan is not a
 * complete WCAG, runtime accessibility, or visual-conformance audit.
 * 
 * Rules:
 * 1. NO_HARDCODED_HEX: No raw hex colors in JSX/TSX files (except print/OMR/constants exemptions).
 * 2. NO_WCAG_FAIL_SLATE_TEXT: text-slate-400 must not be used for body text (contrast failure 2.56:1).
 * 3. NO_BRANCH_COLOR_AS_CTA: bg-blue-600/700 must not be used as primary button CTA (conflicts with Thiếu Nhi branch color).
 * 4. NO_NONEXISTENT_CLASS: Class names that do not exist in index.css / DS (badge-secondary, btn-neutral, custom-scrollbar, ...).
 * 5. NO_ARBITRARY_HEX: Arbitrary Tailwind values with raw hex (bg-[#...], hover:bg-[#...]) — must use tokens (DS §1.1, §9).
 * 6. NO_RAW_600_BUTTON: Raw tailwind color-600/700 families (emerald/rose/amber/sky/green) on buttons bypass contrast-verified DS variants and are banned (DS §6, §9).
 * 7. NO_ARBITRARY_PX_FONT_SIZE_INCREASE: Per-file text-[Npx] debt may only stay flat or decrease.
 * 8. NO_TRANSITION_ALL_INCREASE: Per-file transition-all debt may only stay flat or decrease.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const srcDir = process.env.DS_LINT_SRC_DIR
  ? path.resolve(process.env.DS_LINT_SRC_DIR)
  : path.resolve(__dirname, '../src')
const debtBaselinePath = process.env.DS_LINT_DEBT_BASELINE
  ? path.resolve(process.env.DS_LINT_DEBT_BASELINE)
  : path.resolve(__dirname, 'design-system-debt-baseline.json')

const DS_VERSION = '4.5'
const STATIC_RULE_COUNT = 6

const DEBT_RATCHETS = [
  {
    rule: 'NO_ARBITRARY_PX_FONT_SIZE_INCREASE',
    source: '(?:^|[^\\w-])text-\\[(?:\\d+(?:\\.\\d+)?|\\.\\d+)px\\]',
    description: 'Arbitrary pixel font-size classes (text-[Npx])',
    guidance: 'Replace an existing arbitrary size with a documented typography role before adding another.',
  },
  {
    rule: 'NO_TRANSITION_ALL_INCREASE',
    source: '(?:^|[^\\w-])transition-all(?![\\w-])',
    description: 'Broad transition-all utility classes',
    guidance: 'Use a property-specific transition utility or an approved design-system motion primitive.',
  },
]

const RULE_COUNT = STATIC_RULE_COUNT + DEBT_RATCHETS.length

// Strict Exemptions List (Authorized in ADR-030/063 / Design System v4.5)
const EXEMPTIONS = [
  'components/common/Certificate.tsx',
  // Print-document renderers intentionally embed self-contained colors because
  // their HTML must work outside the application token scope.
  'components/common/StudentReportModal.tsx',
  'components/exam/AnswerSheetModal.tsx',
  'components/exam/ExamPaperModal.tsx',
  'components/exam/ExamScanModal.tsx',
  'constants/branches.ts',
  'utils/pdfGenerator.ts',
  'services/reportExporter.ts',
  'lib/omr.ts',
  '__tests__',
]

// Rule 4: classes that do not exist in index.css / DS v4.5
const NONEXISTENT_CLASSES = [
  'badge-secondary',
  'btn-neutral',
  'custom-scrollbar',
  'bg-surface-main',
]

// Rule 6: raw Tailwind color families bypass approved button variants and their
// verified foreground/background combinations.
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
  const list = fs.readdirSync(dir).sort((a, b) => a.localeCompare(b))
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

const discoveredFiles = getAllFiles(srcDir, ['.tsx'])
const files = discoveredFiles.filter(file => !isExempt(file))

function getDebtOccurrenceLines(content, source) {
  const occurrenceLines = []
  const lines = content.split(/\r?\n/)

  lines.forEach((line, index) => {
    const pattern = new RegExp(source, 'g')
    while (pattern.exec(line)) {
      occurrenceLines.push(index + 1)
    }
  })

  return occurrenceLines
}

function buildDebtBaseline() {
  const rules = {}

  for (const ratchet of DEBT_RATCHETS) {
    const counts = {}

    for (const file of files) {
      const relPath = path.relative(srcDir, file).replace(/\\/g, '/')
      const count = getDebtOccurrenceLines(fs.readFileSync(file, 'utf8'), ratchet.source).length
      if (count > 0) counts[relPath] = count
    }

    rules[ratchet.rule] = {
      description: ratchet.description,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      files: counts,
    }
  }

  return {
    schemaVersion: 1,
    designSystemVersion: DS_VERSION,
    generatedBy: 'node scripts/design-system-lint.mjs --write-debt-baseline',
    scope: 'Non-exempt application TSX files under src; omitted files have a zero-debt ceiling.',
    rules,
  }
}

function writeDebtBaseline() {
  const baseline = buildDebtBaseline()
  fs.writeFileSync(debtBaselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')

  console.log(`Wrote Design System debt baseline: ${path.relative(process.cwd(), debtBaselinePath)}`)
  for (const ratchet of DEBT_RATCHETS) {
    const ruleBaseline = baseline.rules[ratchet.rule]
    console.log(`- ${ratchet.rule}: ${ruleBaseline.total} occurrences across ${Object.keys(ruleBaseline.files).length} files`)
  }
}

function readDebtBaseline() {
  if (!fs.existsSync(debtBaselinePath)) {
    throw new Error(`Missing Design System debt baseline: ${debtBaselinePath}. Run npm run lint:ds -- --write-debt-baseline intentionally to create it.`)
  }

  const baseline = JSON.parse(fs.readFileSync(debtBaselinePath, 'utf8'))
  if (baseline.schemaVersion !== 1 || baseline.designSystemVersion !== DS_VERSION || !baseline.rules || typeof baseline.rules !== 'object') {
    throw new Error(`Invalid Design System debt baseline schema: ${debtBaselinePath}`)
  }

  for (const ratchet of DEBT_RATCHETS) {
    const ruleBaseline = baseline.rules[ratchet.rule]
    if (!ruleBaseline || !ruleBaseline.files || typeof ruleBaseline.files !== 'object') {
      throw new Error(`Missing ${ratchet.rule} counts in Design System debt baseline: ${debtBaselinePath}`)
    }

    const counts = Object.values(ruleBaseline.files)
    if (counts.some(count => !Number.isInteger(count) || count < 1)) {
      throw new Error(`Invalid ${ratchet.rule} per-file count in Design System debt baseline: ${debtBaselinePath}`)
    }

    const calculatedTotal = counts.reduce((sum, count) => sum + count, 0)
    if (ruleBaseline.total !== calculatedTotal) {
      throw new Error(`Invalid ${ratchet.rule} total in Design System debt baseline: expected ${calculatedTotal}, received ${ruleBaseline.total}`)
    }
  }

  return baseline
}

if (process.argv.includes('--write-debt-baseline')) {
  writeDebtBaseline()
  process.exit(0)
}

const debtBaseline = readDebtBaseline()
let totalViolations = 0
const violations = []

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split(/\r?\n/)
  const relPath = path.relative(srcDir, file).replace(/\\/g, '/')

  lines.forEach((line, index) => {
    const lineNum = index + 1
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return

    // Rule 1: NO_HARDCODED_HEX. Print/OMR/constants exceptions are explicitly
    // listed above; application UI must resolve color through DS tokens.
    const rawHexMatch = trimmed.match(/#[0-9a-fA-F]{3,8}\b/)
    if (rawHexMatch) {
      violations.push({
        file: relPath,
        line: lineNum,
        rule: 'NO_HARDCODED_HEX',
        message: `Raw color ${rawHexMatch[0]} is banned in application UI. Use a design token or an authorized print/OMR exemption.`,
        snippet: trimmed,
      })
      totalViolations++
    }

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
          message: `"${cls}" does not exist in DS v${DS_VERSION} (index.css). Use the standard equivalent (e.g. badge-neutral, btn btn-secondary, table-scroll).`,
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

    // Rule 6: NO_RAW_600_BUTTON (raw color families bypass approved variants)
    const buttonContext = [lines[index - 2], lines[index - 1], line].filter(Boolean).join(' ')
    const isButtonLine = buttonContext.includes('<button') || buttonContext.includes('onClick') || buttonContext.includes('type="button"') || buttonContext.includes("type='button'")
    if (isButtonLine) {
      for (const raw of RAW_600_BUTTON_COLORS) {
        if (line.includes(raw)) {
          violations.push({
            file: relPath,
            line: lineNum,
            rule: 'NO_RAW_600_BUTTON',
            message: `"${raw}" bypasses the approved button color contract and is banned (DS §6, §9). Use .btn variants (.btn-primary/.btn-secondary/.btn-danger) or an authorized domain token.`,
            snippet: trimmed,
          })
          totalViolations++
          break
        }
      }
    }
  })

  // Rules 7–8: existing debt is capped per file. A missing baseline entry means
  // a zero-debt ceiling, so newly created files cannot introduce either pattern.
  for (const ratchet of DEBT_RATCHETS) {
    const occurrenceLines = getDebtOccurrenceLines(content, ratchet.source)
    const allowedCount = debtBaseline.rules[ratchet.rule].files[relPath] ?? 0

    if (occurrenceLines.length > allowedCount) {
      const firstNewLine = occurrenceLines[allowedCount]
      violations.push({
        file: relPath,
        line: firstNewLine,
        rule: ratchet.rule,
        message: `${ratchet.description} increased from the per-file baseline ${allowedCount} to ${occurrenceLines.length}. ${ratchet.guidance}`,
        snippet: lines[firstNewLine - 1].trim(),
      })
      totalViolations++
    }
  }
}

console.log('\n🎨 ============================================')
console.log(`🎨 Design System v${DS_VERSION} Anti-Drift Linter`)
console.log('🎨 ============================================\n')
console.log(`   Scope: ${RULE_COUNT} static anti-drift rules across ${files.length} non-exempt application TSX files.`)
console.log(`   Debt ratchets: per-file ceilings loaded from ${path.relative(process.cwd(), debtBaselinePath)}; missing entries default to zero.`)
console.log('   This command does not certify full WCAG or visual conformance.\n')

if (totalViolations === 0) {
  console.log(`✅ Passed: 0 anti-drift violations across ${files.length} scanned TSX files.\n`)
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
