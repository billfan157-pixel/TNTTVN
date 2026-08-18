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
  version: 1
  total: number
  outcomes: Record<string, number>
  reasons: Record<string, number>
  templates: Record<string, number>
  quality: Record<string, number>
  durationTotalMs: number
  durationSamples: number
  updatedAt: string
}

const STORAGE_KEY = 'tntt.omr.scan-diagnostics.v1'

function emptyAggregate(): ScanDiagnosticAggregate {
  return {
    version: 1,
    total: 0,
    outcomes: {},
    reasons: {},
    templates: {},
    quality: {},
    durationTotalMs: 0,
    durationSamples: 0,
    updatedAt: new Date(0).toISOString(),
  }
}

export function readScanDiagnostics(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): ScanDiagnosticAggregate {
  if (!storage) return emptyAggregate()
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '') as ScanDiagnosticAggregate
    return parsed?.version === 1 ? parsed : emptyAggregate()
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
      aggregate.durationTotalMs += Math.max(0, Math.round(event.durationMs))
      aggregate.durationSamples++
    }
    aggregate.updatedAt = new Date().toISOString()
    storage.setItem(STORAGE_KEY, JSON.stringify(aggregate))
  } catch {
    // Chẩn đoán không bao giờ được làm hỏng luồng chấm điểm (private mode/quota).
  }
}
