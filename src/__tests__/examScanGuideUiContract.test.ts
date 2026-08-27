import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const modalSource = readFileSync(
  resolve(process.cwd(), 'src/components/exam/ExamScanModal.tsx'),
  'utf8',
)
const batchModalSource = readFileSync(
  resolve(process.cwd(), 'src/components/exam/ExamBatchScanModal.tsx'),
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

describe('scan performance safety contract', () => {
  it('RAF gọi callback mới nhất thay vì giữ mã đề/template từ render mở camera', () => {
    expect(modalSource).toContain('processImageFrameRef.current = processImageFrame')
    expect(modalSource).toContain('processImageFrameRef.current(frame)')
    expect(modalSource).not.toContain('const handled = processImageFrame(frame)')
  })

  it('batch giữ commit theo chunk nhưng nhường event loop sau từng ảnh', () => {
    expect(batchModalSource).toContain('const BATCH_UI_COMMIT_SIZE = 8')
    expect(batchModalSource).toContain('const BATCH_MAIN_THREAD_YIELD_SIZE = 1')
  })

  it('hủy tác vụ ảnh bất đồng bộ và xóa scratch khi modal đóng', () => {
    expect(modalSource).toContain('pendingUploadRef.current')
    expect(modalSource).toContain('cameraGenerationRef.current !== captureGeneration')
    expect(modalSource).toContain('cameraGenerationRef.current !== uploadGeneration')
    expect(batchModalSource).toContain('processingGenerationRef.current !== processingGeneration')
    expect(batchModalSource).toContain('finally {')
    expect(batchModalSource).toContain('clearOmrScratchBuffers()')
  })
})
