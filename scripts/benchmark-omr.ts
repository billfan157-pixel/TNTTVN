import { performance } from 'node:perf_hooks'
import {
  CORNER_MARKERS,
  CORNER_SIZE,
  INTEGRATED_BUBBLE_W,
  INTEGRATED_MARKER_SIZE,
  INTEGRATED_REF_W,
  integratedMcCellsForRect,
  mcOptionToCell,
  type FrameRect,
} from '../src/lib/answerSheetTemplate'
import { detectAnswersFromImage, type OmrTemplateMode } from '../src/lib/omr'
import { scanExamCode, type ExamCodeScanMode } from '../src/lib/examCodeScanner'
import { buildExamQrPayload, generateExamQrMatrix, QR_QUIET_ZONE_MODULES } from '../src/lib/qr'

type Option = 'A' | 'B' | 'C' | 'D'

const FRAME: FrameRect = { x0: 0.0375, y0: 0.153, x1: 0.9625, y1: 0.287 }
const QUESTION_COUNT = 50
const MIN_P95_SAMPLES = 100
const OPTIONS: Option[] = ['A', 'B', 'C', 'D']
const BENCHMARK_ENGINE_VERSION = 'omr-v4-benchmark'
const BENCHMARK_DEVICE_PROFILE = process.env.OMR_BENCH_DEVICE_PROFILE
  ?? `dev-host-${process.platform}-${process.arch}`
const BENCHMARK_RUNTIME = `node-${process.version}`

function positiveInteger(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// Fast paths get enough independent timings for a useful empirical p95. The
// legacy variable remains supported for quick local runs, but any n < 100 is
// explicitly reported as a bounded diagnostic and never labelled p95.
const FAST_ITERATIONS = positiveInteger(
  process.env.OMR_BENCH_FAST_ITERATIONS ?? process.env.OMR_BENCH_ITERATIONS,
  MIN_P95_SAMPLES,
)
const DIAGNOSTIC_ITERATIONS = positiveInteger(process.env.OMR_BENCH_DIAGNOSTIC_ITERATIONS, 10)
const EXHAUSTIVE_ITERATIONS = positiveInteger(process.env.OMR_BENCH_EXHAUSTIVE_ITERATIONS, 3)
const FAST_WARMUPS = 3
const caseArgumentIndex = process.argv.indexOf('--case')
const SELECTED_CASE = caseArgumentIndex >= 0 ? process.argv[caseArgumentIndex + 1] : undefined

async function runBenchmarkCase(name: string, operation: () => Promise<void>): Promise<void> {
  if (!SELECTED_CASE || SELECTED_CASE === name) await operation()
}

function imageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = 247
    data[offset + 1] = 247
    data[offset + 2] = 247
    data[offset + 3] = 255
  }
  return { width, height, data, colorSpace: 'srgb' } as ImageData
}

function fillSquare(image: ImageData, centerX: number, centerY: number, size: number, luma: number): void {
  const half = Math.max(1, Math.round(size / 2))
  const x0 = Math.max(0, Math.round(centerX) - half)
  const x1 = Math.min(image.width, Math.round(centerX) + half)
  const y0 = Math.max(0, Math.round(centerY) - half)
  const y1 = Math.min(image.height, Math.round(centerY) + half)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const offset = (y * image.width + x) * 4
      image.data[offset] = luma
      image.data[offset + 1] = luma
      image.data[offset + 2] = luma
    }
  }
}

function buildIntegratedSheet(width: number): { image: ImageData; key: Record<number, Option> } {
  const height = Math.round(width * 1130 / 800)
  const image = imageData(width, height)
  const frameWidth = (FRAME.x1 - FRAME.x0) * width
  const markerSize = frameWidth * INTEGRATED_MARKER_SIZE / INTEGRATED_REF_W
  for (const [x, y] of [
    [FRAME.x0, FRAME.y0],
    [FRAME.x1, FRAME.y0],
    [FRAME.x1, FRAME.y1],
    [FRAME.x0, FRAME.y1],
  ] as const) {
    fillSquare(image, x * width, y * height, markerSize, 10)
  }

  const key: Record<number, Option> = {}
  const cells = integratedMcCellsForRect(QUESTION_COUNT, FRAME)
  const fillSize = frameWidth * INTEGRATED_BUBBLE_W * 0.8 / INTEGRATED_REF_W
  for (let question = 1; question <= QUESTION_COUNT; question++) {
    const option = OPTIONS[(question - 1) % OPTIONS.length]
    key[question] = option
    const cell = cells.find(candidate => candidate.questionIndex === question && candidate.option === option)
    if (cell) fillSquare(image, cell.x * width, cell.y * height, fillSize, 25)
  }
  return { image, key }
}

function buildFullPageSheet(width: number): { image: ImageData; key: Record<number, Option> } {
  const height = Math.round(width * 1130 / 800)
  const image = imageData(width, height)
  const markerSize = CORNER_SIZE * Math.min(width, height)
  for (const marker of CORNER_MARKERS) {
    fillSquare(image, marker.x * width, marker.y * height, markerSize, 10)
  }

  const key: Record<number, Option> = {}
  const fillSize = 0.032 * Math.min(width, height)
  for (let question = 1; question <= QUESTION_COUNT; question++) {
    const option = OPTIONS[(question - 1) % OPTIONS.length]
    key[question] = option
    const cell = mcOptionToCell(question, option, QUESTION_COUNT)
    fillSquare(image, cell.x * width, cell.y * height, fillSize, 25)
  }
  return { image, key }
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0
}

function yieldEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

async function collectSamples(
  iterations: number,
  warmups: number,
  operation: () => void,
): Promise<number[]> {
  for (let warmup = 0; warmup < warmups; warmup++) {
    operation()
    await yieldEventLoop()
  }
  const samples: number[] = []
  for (let iteration = 0; iteration < iterations; iteration++) {
    // Live camera/batch đều nhường event loop giữa các frame/file. Không chạy
    // detector tight-loop vì nó tạo GC pressure không đại diện latency mỗi lần.
    await yieldEventLoop()
    const startedAt = performance.now()
    operation()
    samples.push(performance.now() - startedAt)
  }
  return samples.sort((left, right) => left - right)
}

function timingSummary(samples: number[]): Record<string, string | number> {
  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length
  const hasDistributionSample = samples.length >= MIN_P95_SAMPLES
  return {
    measurement: hasDistributionSample
      ? `empirical-p95 (n>=${MIN_P95_SAMPLES})`
      : `bounded-sample-max diagnostic (n<${MIN_P95_SAMPLES}; p95 omitted)`,
    iterations: samples.length,
    meanMs: Number(mean.toFixed(2)),
    p50Ms: Number(percentile(samples, 0.5).toFixed(2)),
    ...(hasDistributionSample ? { p95Ms: Number(percentile(samples, 0.95).toFixed(2)) } : {}),
    minMs: Number(samples[0].toFixed(2)),
    maxMs: Number(samples[samples.length - 1].toFixed(2)),
  }
}

async function benchmarkAcceptedOmr(
  benchmarkName: string,
  fixture: { image: ImageData; key: Record<number, Option> },
  templateMode: OmrTemplateMode,
): Promise<void> {
  let iteration = 0
  const samples = await collectSamples(FAST_ITERATIONS, FAST_WARMUPS, () => {
    const result = detectAnswersFromImage(fixture.image, fixture.key, QUESTION_COUNT, 10, templateMode)
    iteration++
    if (!result.ok || result.rawCorrectCount !== QUESTION_COUNT) {
      throw new Error(`${benchmarkName} regression at invocation ${iteration}: ${result.reason}, correct=${result.rawCorrectCount}`)
    }
  })
  console.log(JSON.stringify({
    benchmark: benchmarkName,
    pixels: fixture.image.width * fixture.image.height,
    executionProfile: {
      workload: 'multiple_choice',
      engineVersion: BENCHMARK_ENGINE_VERSION,
      deviceProfile: BENCHMARK_DEVICE_PROFILE,
      runtime: BENCHMARK_RUNTIME,
      frameWidth: fixture.image.width,
      frameHeight: fixture.image.height,
      templateMode,
      questionCount: QUESTION_COUNT,
      runKind: 'warm',
    },
    ...timingSummary(samples),
  }))
}

async function benchmarkIntegratedOmr(width: number): Promise<void> {
  await benchmarkAcceptedOmr('OMR integrated accepted path', buildIntegratedSheet(width), 'integrated')
}

async function benchmarkFullPageOmr(width: number): Promise<void> {
  await benchmarkAcceptedOmr('OMR full-page accepted path', buildFullPageSheet(width), 'full_page')
}

async function benchmarkAutoFullPageFallback(width: number): Promise<void> {
  const fixture = buildFullPageSheet(width)
  // This guard proves that the measured `auto` call cannot have succeeded via
  // the integrated locator: it has to reuse the prepared SAT in full-page mode.
  const integratedProbe = detectAnswersFromImage(fixture.image, fixture.key, QUESTION_COUNT, 10, 'integrated')
  if (integratedProbe.ok) throw new Error(`Full-page fallback fixture ${width}px was unexpectedly accepted as integrated`)
  await benchmarkAcceptedOmr('OMR auto -> full-page fallback accepted path', fixture, 'auto')
}

async function benchmarkAutoNoMarker(width: number): Promise<void> {
  const image = imageData(width, Math.round(width * 1130 / 800))
  let invocation = 0
  const samples = await collectSamples(FAST_ITERATIONS, FAST_WARMUPS, () => {
    const result = detectAnswersFromImage(image, {}, QUESTION_COUNT, 10, 'auto')
    invocation++
    if (result.ok || result.reason !== 'MISSING_MARKER_TL') {
      throw new Error(`No-marker regression at invocation ${invocation}: ${result.reason}`)
    }
  })
  console.log(JSON.stringify({
    benchmark: 'OMR auto no-marker rejection path',
    pixels: image.width * image.height,
    expectedResult: 'MISSING_MARKER_TL',
    executionProfile: {
      workload: 'diagnostic_auto_rejection',
      engineVersion: BENCHMARK_ENGINE_VERSION,
      deviceProfile: BENCHMARK_DEVICE_PROFILE,
      runtime: BENCHMARK_RUNTIME,
      frameWidth: width,
      frameHeight: image.height,
      templateMode: 'auto',
      questionCount: QUESTION_COUNT,
      runKind: 'warm',
    },
    ...timingSummary(samples),
  }))
}

function drawQr(image: ImageData, payload: string): void {
  const matrix = generateExamQrMatrix(payload)
  const modules = matrix.length + QR_QUIET_ZONE_MODULES * 2
  const moduleSize = Math.max(3, Math.floor(image.width * 0.13 / modules))
  const qrSize = modules * moduleSize
  const originX = Math.floor(image.width * 0.82 - qrSize / 2)
  const originY = Math.floor(image.height * 0.04)
  fillSquare(image, originX + qrSize / 2, originY + qrSize / 2, qrSize, 255)
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix.length; col++) {
      if (!matrix[row][col]) continue
      fillSquare(
        image,
        originX + (col + QR_QUIET_ZONE_MODULES + 0.5) * moduleSize,
        originY + (row + QR_QUIET_ZONE_MODULES + 0.5) * moduleSize,
        moduleSize,
        0,
      )
    }
  }
}

async function benchmarkCodeScanner(width: number, withCode: boolean, mode: ExamCodeScanMode, iterations: number): Promise<void> {
  const height = Math.round(width * 4 / 3)
  const image = imageData(width, height)
  const payload = buildExamQrPayload(
    'EXS-0123abcd',
    'ST-89abcdef',
    { templateMode: 'integrated', questionCount: 50, examVersion: 'A' },
  )
  if (withCode) drawQr(image, payload)
  const warmup = scanExamCode(image, mode)
  if (withCode && warmup.rawText !== payload) throw new Error(`QR fixture ${width}px did not decode`)

  let invocation = 0
  const samples = await collectSamples(iterations, mode === 'exhaustive' ? 1 : FAST_WARMUPS, () => {
    const result = scanExamCode(image, mode)
    invocation++
    if (withCode && result.rawText !== payload) throw new Error(`QR regression at ${width}px invocation ${invocation}`)
    if (!withCode && result.rawText !== null) throw new Error(`Negative QR fixture decoded unexpectedly at ${width}px`)
  })
  console.log(JSON.stringify({
    benchmark: withCode ? 'QR standard fast path' : 'QR negative worst path',
    executionProfile: {
      workload: withCode ? 'qr_positive' : 'qr_negative',
      engineVersion: 'qr-v4-benchmark',
      deviceProfile: BENCHMARK_DEVICE_PROFILE,
      runtime: BENCHMARK_RUNTIME,
      frameWidth: width,
      frameHeight: height,
      mode,
      runKind: 'warm',
    },
    ...timingSummary(samples),
  }))
}

async function main(): Promise<void> {
  console.log(JSON.stringify({
    benchmark: 'Synthetic OMR/QR scan microbenchmark',
    selectedCase: SELECTED_CASE ?? 'all',
    cadence: 'Detector-only timing with an event-loop yield between invocations, matching live/batch scheduling.',
    samplePolicy: {
      fast: `${FAST_ITERATIONS} measured iterations; p95 is emitted only when n>=${MIN_P95_SAMPLES}`,
      liveRecovery: `${DIAGNOSTIC_ITERATIONS} measured iterations; bounded diagnostic`,
      exhaustive: `${EXHAUSTIVE_ITERATIONS} measured iterations; bounded max diagnostic`,
    },
    environment: {
      deviceProfile: BENCHMARK_DEVICE_PROFILE,
      runtime: BENCHMARK_RUNTIME,
    },
    caveat: 'Performance regression signal on synthetic fixtures only; not field-accuracy or target-device evidence.',
  }))
  for (const width of [800, 960, 1280]) {
    await runBenchmarkCase(`omr-integrated-${width}`, () => benchmarkIntegratedOmr(width))
  }
  await runBenchmarkCase('omr-full-page-960', () => benchmarkFullPageOmr(960))
  await runBenchmarkCase('omr-full-page-1280', () => benchmarkFullPageOmr(1280))
  await runBenchmarkCase('omr-auto-full-page-960', () => benchmarkAutoFullPageFallback(960))
  await runBenchmarkCase('omr-auto-no-marker-960', () => benchmarkAutoNoMarker(960))
  for (const width of [960, 1280]) {
    await runBenchmarkCase(`qr-standard-live-fast-${width}`, () => benchmarkCodeScanner(width, true, 'live_fast', FAST_ITERATIONS))
  }
  for (const width of [960, 1280]) {
    await runBenchmarkCase(`qr-negative-live-fast-${width}`, () => benchmarkCodeScanner(width, false, 'live_fast', FAST_ITERATIONS))
  }
  for (const width of [960, 1280]) {
    await runBenchmarkCase(`qr-negative-live-recovery-${width}`, () => benchmarkCodeScanner(width, false, 'live_recovery', DIAGNOSTIC_ITERATIONS))
  }
  for (const width of [960, 1280]) {
    await runBenchmarkCase(`qr-negative-exhaustive-${width}`, () => benchmarkCodeScanner(width, false, 'exhaustive', EXHAUSTIVE_ITERATIONS))
  }
  if (SELECTED_CASE && ![
    ...[800, 960, 1280].map(width => `omr-integrated-${width}`),
    'omr-full-page-960',
    'omr-full-page-1280',
    'omr-auto-full-page-960',
    'omr-auto-no-marker-960',
    ...[960, 1280].flatMap(width => [
      `qr-standard-live-fast-${width}`,
      `qr-negative-live-fast-${width}`,
      `qr-negative-live-recovery-${width}`,
      `qr-negative-exhaustive-${width}`,
    ]),
  ].includes(SELECTED_CASE)) {
    throw new Error(`Unknown benchmark case: ${SELECTED_CASE}`)
  }
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
