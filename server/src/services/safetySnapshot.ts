import { putObject, listObjects, deleteObject } from './blobStorage.js'

/**
 * ADR-041 (2026-08-15): ghi + retention safety snapshot qua blobStorage.
 * Thay thế logic fs cũ trong `safetyDir.ts` (pruneSafetySnapshots) — nay dùng
 * backend R2 (nếu cấu hình) hoặc local fallback, đều qua chung abstraction.
 *
 * Tên file: <prefix>-<parishId>-<ISO ':' '.' → '-'>.json
 * (timestamp luôn UTC có millis, kết thúc Z — giống convention cũ A-NEW-34).
 */
const SAFETY_SNAPSHOT_RE =
  /^(pre-restore-safety|purge-safety)-(.+?)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/

export async function writeSafetySnapshot(
  prefix: 'pre-restore-safety' | 'purge-safety',
  parishId: string,
  payload: unknown,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${prefix}-${parishId}-${timestamp}.json`
  const key = `safety/${filename}`
  await putObject(key, JSON.stringify(payload, null, 2), 'application/json')
  return key
}

/**
 * Giữ `keep` bản MỚI NHẤT theo nhóm (prefix, parishId). Không xóa nếu chưa đủ.
 * Lỗi list/delete → no-op (retention không được chặn purge/restore).
 */
export async function pruneSafetySnapshots(keep = 5): Promise<void> {
  try {
    const objects = await listObjects('safety/')
    const groups = new Map<string, { key: string; lastModified: number }[]>()
    for (const o of objects) {
      const name = o.key.slice('safety/'.length)
      const m = SAFETY_SNAPSHOT_RE.exec(name)
      if (!m) continue
      const group = `${m[1]}:${m[2]}`
      const arr = groups.get(group) ?? []
      arr.push({ key: o.key, lastModified: o.lastModified ?? 0 })
      groups.set(group, arr)
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => b.lastModified - a.lastModified)
      for (const old of arr.slice(keep)) {
        try {
          await deleteObject(old.key)
        } catch {
          // concurrency / đã bị xóa — bỏ qua
        }
      }
    }
  } catch {
    // retention fail không được chặn purge/restore
  }
}
