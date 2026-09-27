export declare const MAINTENANCE_INTERVALS_MS: Readonly<Record<string, number>>

export interface MaintenanceStorage {
  get(key: string): Promise<unknown>
  put(key: string, value: unknown): Promise<void>
  getAlarm(): Promise<number | null>
  setAlarm(at: number): Promise<void>
  deleteAlarm(): Promise<void>
}

export declare class MaintenanceJob {
  constructor(ctx: { storage: MaintenanceStorage }, env: {
    CATEVIA_MAINTENANCE_OWNER?: string
    BLOB_BUCKET?: unknown
    APP_RELEASE_ID?: string
  })
  ensureScheduled(kind: string): Promise<{ enabled: boolean; kind?: string; nextAlarm?: number | null }>
  alarm(): Promise<void>
  pause(): ReturnType<MaintenanceJob['status']>
  resume(kind: string): ReturnType<MaintenanceJob['ensureScheduled']>
  status(): Promise<{
    releaseId: string | null
    paused: boolean
    active: boolean
    kind: string | null
    nextAlarm: number | null
    lastEnsureAt: string | null
    lastSuccessAt: string | null
    lastFailureAt: string | null
  }>
  run(kind: string): Promise<unknown>
}
