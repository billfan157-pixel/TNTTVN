import {
  recordOmrSequenceLongTasks,
  recordOmrSequenceResponsivenessObserver,
  sampleOmrSequenceMemory,
} from './omrSequenceEvidence'

export type ContinuousDurationMetric = 'identity_to_proposal' | 'confirm_to_durable' | 'durable_to_ack'
export type ContinuousDiagnosticEvent = 'rearm_blocked' | 'duplicate_proposal' | 'attempt_conflict' | 'page_hidden'
export type ContinuousDurationBucket = 'lte50' | 'lte100' | 'lte150' | 'lte250' | 'lte500' | 'lte1000' | 'gt1000'

export interface ContinuousScanDiagnosticAggregate {
  version: 1
  events: Record<string, number>
  durations: Record<ContinuousDurationMetric, {
    samples: number
    totalMs: number
    buckets: Record<ContinuousDurationBucket, number>
  }>
  longTasks: { count: number; totalMs: number; maxMs: number }
  memory: { samples: number; growthMbTotal: number; peakMbMax: number }
  updatedAt: string
}

const STORAGE_KEY = 'tntt.omr.continuous-diagnostics.v1'

function buckets(): Record<ContinuousDurationBucket, number> {
  return { lte50: 0, lte100: 0, lte150: 0, lte250: 0, lte500: 0, lte1000: 0, gt1000: 0 }
}

function emptyAggregate(): ContinuousScanDiagnosticAggregate {
  const duration = () => ({ samples: 0, totalMs: 0, buckets: buckets() })
  return {
    version: 1,
    events: {},
    durations: { identity_to_proposal: duration(), confirm_to_durable: duration(), durable_to_ack: duration() },
    longTasks: { count: 0, totalMs: 0, maxMs: 0 },
    memory: { samples: 0, growthMbTotal: 0, peakMbMax: 0 },
    updatedAt: new Date(0).toISOString(),
  }
}

function durationBucket(durationMs: number): ContinuousDurationBucket {
  if (durationMs <= 50) return 'lte50'
  if (durationMs <= 100) return 'lte100'
  if (durationMs <= 150) return 'lte150'
  if (durationMs <= 250) return 'lte250'
  if (durationMs <= 500) return 'lte500'
  if (durationMs <= 1_000) return 'lte1000'
  return 'gt1000'
}

export function readContinuousScanDiagnostics(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): ContinuousScanDiagnosticAggregate {
  if (!storage) return emptyAggregate()
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as ContinuousScanDiagnosticAggregate | null
    if (parsed?.version === 1) return parsed
  } catch {
    // Invalid/private storage starts a new aggregate and never blocks grading.
  }
  return emptyAggregate()
}

function updateAggregate(
  mutate: (aggregate: ContinuousScanDiagnosticAggregate) => void,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
): void {
  if (!storage) return
  try {
    const aggregate = readContinuousScanDiagnostics(storage)
    mutate(aggregate)
    aggregate.updatedAt = new Date().toISOString()
    storage.setItem(STORAGE_KEY, JSON.stringify(aggregate))
  } catch {
    // Diagnostics are best-effort and contain no image or entity identifier.
  }
}

export function recordContinuousEvent(
  event: ContinuousDiagnosticEvent,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): void {
  updateAggregate(aggregate => { aggregate.events[event] = (aggregate.events[event] ?? 0) + 1 }, storage)
}

export function recordContinuousDuration(
  metric: ContinuousDurationMetric,
  durationMs: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): void {
  if (!Number.isFinite(durationMs)) return
  updateAggregate(aggregate => {
    const duration = Math.max(0, Math.round(durationMs))
    aggregate.durations[metric].samples++
    aggregate.durations[metric].totalMs += duration
    aggregate.durations[metric].buckets[durationBucket(duration)]++
  }, storage)
}

interface PerformanceWithMemory extends Performance {
  memory?: { usedJSHeapSize?: number }
}

function readHeapBytes(performanceWithMemory: PerformanceWithMemory): number | undefined {
  try {
    const value = performanceWithMemory.memory?.usedJSHeapSize
    return value !== undefined && Number.isFinite(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** Target-device observer. Records aggregate timing only; no IDs, answers or images. */
export function startContinuousRuntimeMonitor(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): () => void {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return () => undefined
  recordOmrSequenceResponsivenessObserver('unsupported', storage)
  const performanceWithMemory = performance as PerformanceWithMemory
  const memoryStart = readHeapBytes(performanceWithMemory)
  let memoryPeak = memoryStart ?? 0
  void sampleOmrSequenceMemory()
  const memoryTimer = window.setInterval(() => {
    memoryPeak = Math.max(memoryPeak, readHeapBytes(performanceWithMemory) ?? 0)
    void sampleOmrSequenceMemory()
  }, 2_000)

  let observer: PerformanceObserver | null = null
  const supportedEntryTypes = typeof PerformanceObserver === 'undefined' ? [] : PerformanceObserver.supportedEntryTypes ?? []
  const responsivenessEntryType = supportedEntryTypes.includes('long-animation-frame')
    ? 'long-animation-frame'
    : supportedEntryTypes.includes('longtask') ? 'longtask' : null
  if (typeof PerformanceObserver !== 'undefined' && responsivenessEntryType) {
    try {
      observer = new PerformanceObserver(list => {
        const durations = list.getEntries().map(entry => entry.duration).filter(Number.isFinite)
        if (durations.length === 0) return
        recordOmrSequenceLongTasks(durations)
        updateAggregate(aggregate => {
          aggregate.longTasks.count += durations.length
          aggregate.longTasks.totalMs += Math.round(durations.reduce((sum, duration) => sum + duration, 0))
          aggregate.longTasks.maxMs = Math.max(aggregate.longTasks.maxMs, ...durations.map(Math.round))
        }, storage)
      })
      observer.observe({ type: responsivenessEntryType, buffered: true })
      recordOmrSequenceResponsivenessObserver(responsivenessEntryType, storage)
    } catch {
      observer = null
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') recordContinuousEvent('page_hidden', storage)
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    window.clearInterval(memoryTimer)
    observer?.disconnect()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    const memoryEnd = readHeapBytes(performanceWithMemory)
    void sampleOmrSequenceMemory()
    if (memoryStart !== undefined && memoryEnd !== undefined) {
      updateAggregate(aggregate => {
        aggregate.memory.samples++
        aggregate.memory.growthMbTotal += Math.round((memoryEnd - memoryStart) / 104_857.6) / 10
        aggregate.memory.peakMbMax = Math.max(aggregate.memory.peakMbMax, Math.round((memoryPeak - memoryStart) / 104_857.6) / 10)
      }, storage)
    }
  }
}
