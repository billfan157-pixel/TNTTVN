import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { chmodSync } from 'fs'
import { isCloudflareWorkerRuntime } from './cloudflareRuntime.js'

/**
 * Thư mục chứa safety snapshot (backup tự động trước purge/restore).
 *
 * Ưu tiên: SAFETY_BACKUP_DIR (override) → dirname(DB_PATH) (production: /app/data
 * — volume Railway chown appuser, writable) → thư mục data mặc định local (server/data).
 *
 * KHÔNG dùng __dirname/../../data: trên Docker (node:22-alpine, chạy non-root appuser)
 * /app/server/data không tồn tại trong image và do root sở hữu → mkdir EACCES
 * (lỗi thực tế trên Railway: "EACCES: permission denied, mkdir '/app/server/data/backups/safety'").
 */
export function getSafetyBackupDir(): string {
  if (isCloudflareWorkerRuntime()) {
    throw new Error('Worker cannot use a local safety backup directory')
  }
  if (process.env.SAFETY_BACKUP_DIR) return process.env.SAFETY_BACKUP_DIR
  if (process.env.DB_PATH) return join(dirname(process.env.DB_PATH), 'backups', 'safety')
  return join(dirname(fileURLToPath(import.meta.url)), '../../data/backups/safety')
}

/**
 * A-NEW-34 (2026-08-11): ghi an toàn (POSIX 0600) — safety snapshot chứa toàn bộ
 * PII học sinh; trên volume dùng chung chỉ user service (appuser) cần đọc.
 * No-op khi FS không hỗ trợ (Windows) — try/catch im lặng.
 */
export function tryChmod600(filePath: string): void {
  try {
    chmodSync(filePath, 0o600)
  } catch {
    // Windows / FS không hỗ trợ POSIX mode — bỏ qua (như mọi chmod khác trong codebase)
  }
}
