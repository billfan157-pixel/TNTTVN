import { dexieStorage } from './db'

const PREFIX = 'exam_scan_review_v1'
const REGISTRY_KEY = `${PREFIX}:registry`
const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1_000

export interface ScanReviewSnapshot {
  sessionId: string
  studentId: string
  createdAt: string
  expiresAt: string
  dataUrl: string
}

interface RegistryEntry {
  sessionId: string
  studentId: string
  expiresAt: string
}

async function readRegistry(): Promise<RegistryEntry[]> {
  try {
    const raw = await dexieStorage.getItem(REGISTRY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(item => item?.sessionId && item?.studentId && item?.expiresAt) : []
  } catch {
    return []
  }
}

async function writeRegistry(entries: RegistryEntry[]): Promise<void> {
  await dexieStorage.setItem(REGISTRY_KEY, JSON.stringify(entries))
}

function key(sessionId: string, studentId: string): string {
  return `${PREFIX}:${sessionId}:${studentId}`
}

function imageDataToCompressedJpeg(image: ImageData): string | null {
  if (typeof document === 'undefined') return null
  const maxDimension = 960
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
  const source = document.createElement('canvas')
  source.width = image.width
  source.height = image.height
  const sourceContext = source.getContext('2d')
  if (!sourceContext) return null
  sourceContext.putImageData(image, 0, 0)
  const target = document.createElement('canvas')
  target.width = Math.max(1, Math.round(image.width * scale))
  target.height = Math.max(1, Math.round(image.height * scale))
  const targetContext = target.getContext('2d')
  if (!targetContext) return null
  targetContext.drawImage(source, 0, 0, target.width, target.height)
  return target.toDataURL('image/jpeg', 0.68)
}

/**
 * Lưu ảnh rà soát trên đúng thiết bị, trong kho tenant-scoped mã hóa AES-GCM.
 * Ảnh không được gửi lên API và tự hết hạn sau 24 giờ.
 */
export async function saveScanReviewSnapshot(sessionId: string, studentId: string, image: ImageData): Promise<boolean> {
  const dataUrl = imageDataToCompressedJpeg(image)
  if (!dataUrl) return false
  const now = Date.now()
  const snapshot: ScanReviewSnapshot = {
    sessionId,
    studentId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DEFAULT_RETENTION_MS).toISOString(),
    dataUrl,
  }
  await dexieStorage.setItem(key(sessionId, studentId), JSON.stringify(snapshot))
  const registry = (await readRegistry()).filter(item => item.sessionId !== sessionId || item.studentId !== studentId)
  registry.push({ sessionId, studentId, expiresAt: snapshot.expiresAt })
  await writeRegistry(registry)
  return true
}

export async function loadScanReviewSnapshot(sessionId: string, studentId: string): Promise<ScanReviewSnapshot | null> {
  const raw = await dexieStorage.getItem(key(sessionId, studentId))
  if (!raw) return null
  try {
    const snapshot = JSON.parse(raw) as ScanReviewSnapshot
    if (!snapshot.dataUrl || Date.parse(snapshot.expiresAt) <= Date.now()) {
      await deleteScanReviewSnapshot(sessionId, studentId)
      return null
    }
    return snapshot
  } catch {
    await deleteScanReviewSnapshot(sessionId, studentId)
    return null
  }
}

export async function deleteScanReviewSnapshot(sessionId: string, studentId: string): Promise<void> {
  await dexieStorage.removeItem(key(sessionId, studentId))
  await writeRegistry((await readRegistry()).filter(item => item.sessionId !== sessionId || item.studentId !== studentId))
}

/** Xóa vật lý snapshot hết hạn khi người dùng mở lại luồng chấm/kết quả. */
export async function purgeExpiredScanReviewSnapshots(now = Date.now()): Promise<number> {
  const registry = await readRegistry()
  const expired = registry.filter(item => Date.parse(item.expiresAt) <= now)
  await Promise.all(expired.map(item => dexieStorage.removeItem(key(item.sessionId, item.studentId))))
  if (expired.length) await writeRegistry(registry.filter(item => Date.parse(item.expiresAt) > now))
  return expired.length
}
