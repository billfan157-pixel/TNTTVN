import type { ScanQualityStatus } from './scanQuality'
import type { ExamFormTemplateMode } from './qr'

export interface ScanDiagnosticEvent {
  outcome: 'accepted' | 'review_required' | 'rejected'
  reason: string
  templateMode?: ExamFormTemplateMode
  qualityStatus?: ScanQualityStatus
  durationMs?: number
}

export interface ScanDiagnosticAggregate {
  version: 2
  total: number
  outcomes: Record<string, number>
  reasons: Record<string, number>
  templates: Record<string, number>
  quality: Record<string, number>
  durationTotalMs: number
  durationSamples: number
  durationBuckets: Record<ScanDurationBucket, number>
  updatedAt: string
}

export type ScanDurationBucket = 'lte50' | 'lte100' | 'lte150' | 'lte250' | 'lte500' | 'lte1000' | 'gt1000'

const STORAGE_KEY = 'tntt.omr.scan-diagnostics.v2'
const LEGACY_STORAGE_KEY = 'tntt.omr.scan-diagnostics.v1'

function emptyDurationBuckets(): Record<ScanDurationBucket, number> {
  return { lte50: 0, lte100: 0, lte150: 0, lte250: 0, lte500: 0, lte1000: 0, gt1000: 0 }
}

function durationBucket(durationMs: number): ScanDurationBucket {
  if (durationMs <= 50) return 'lte50'
  if (durationMs <= 100) return 'lte100'
  if (durationMs <= 150) return 'lte150'
  if (durationMs <= 250) return 'lte250'
  if (durationMs <= 500) return 'lte500'
  if (durationMs <= 1_000) return 'lte1000'
  return 'gt1000'
}

function emptyAggregate(): ScanDiagnosticAggregate {
  return {
    version: 2,
    total: 0,
    outcomes: {},
    reasons: {},
    templates: {},
    quality: {},
    durationTotalMs: 0,
    durationSamples: 0,
    durationBuckets: emptyDurationBuckets(),
    updatedAt: new Date(0).toISOString(),
  }
}

export function readScanDiagnostics(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): ScanDiagnosticAggregate {
  if (!storage) return emptyAggregate()
  try {
    const currentRaw = storage.getItem(STORAGE_KEY)
    if (currentRaw) {
      const parsed = JSON.parse(currentRaw) as ScanDiagnosticAggregate
      if (parsed?.version === 2) {
        return { ...parsed, durationBuckets: { ...emptyDurationBuckets(), ...parsed.durationBuckets } }
      }
    }
    const legacyRaw = storage.getItem(LEGACY_STORAGE_KEY)
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Omit<ScanDiagnosticAggregate, 'version' | 'durationBuckets'> & { version: 1 }
      if (legacy?.version === 1) {
        return { ...legacy, version: 2, durationBuckets: emptyDurationBuckets() }
      }
    }
    return emptyAggregate()
  } catch {
    return emptyAggregate()
  }
}

/** Chỉ ghi counter/timing tổng hợp; API không nhận ảnh, ID phiên hay ID học sinh. */
export function recordScanDiagnostic(
  event: ScanDiagnosticEvent,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): void {
  if (!storage) return
  try {
    const aggregate = readScanDiagnostics(storage)
    aggregate.total++
    aggregate.outcomes[event.outcome] = (aggregate.outcomes[event.outcome] ?? 0) + 1
    aggregate.reasons[event.reason] = (aggregate.reasons[event.reason] ?? 0) + 1
    if (event.templateMode) aggregate.templates[event.templateMode] = (aggregate.templates[event.templateMode] ?? 0) + 1
    if (event.qualityStatus) aggregate.quality[event.qualityStatus] = (aggregate.quality[event.qualityStatus] ?? 0) + 1
    if (event.durationMs !== undefined && Number.isFinite(event.durationMs)) {
      const durationMs = Math.max(0, Math.round(event.durationMs))
      aggregate.durationTotalMs += durationMs
      aggregate.durationSamples++
      const bucket = durationBucket(durationMs)
      aggregate.durationBuckets[bucket]++
    }
    aggregate.updatedAt = new Date().toISOString()
    storage.setItem(STORAGE_KEY, JSON.stringify(aggregate))
  } catch {
    // Chẩn đoán không bao giờ được làm hỏng luồng chấm điểm (private mode/quota).
  }
}
