import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const modalSource = readFileSync(
  resolve(process.cwd(), 'src/components/exam/ExamScanModal.tsx'),
  'utf8',
)

describe('integrated scan guide UI contract', () => {
  it('renders the integrated guide from the centralized placement helper', () => {
    expect(modalSource).toContain("import { getIntegratedScanGuideLayout } from '../../lib/examScanGuide'")
    expect(modalSource).toContain('const guideLayout = getIntegratedScanGuideLayout(questionCount)')
    expect(modalSource).toContain("top: `${guideLayout.centerYFraction * 100}%`")
    expect(modalSource).toContain("width: `${guideLayout.widthFraction * 100}%`")
    expect(modalSource).toContain("transform: 'translate(-50%, -50%)'")
  })

  it('does not apply the integrated placement to the full-page A4 guide', () => {
    const integratedStart = modalSource.indexOf("mcTemplateMode === 'integrated'")
    const fullPageGuide = modalSource.indexOf('h-[88%] aspect-[210/297]')
    expect(integratedStart).toBeGreaterThan(-1)
    expect(fullPageGuide).toBeGreaterThan(integratedStart)
  })
})
