import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface DbConfig {
  isRemote: boolean
  url: string
  authToken?: string
  dbPath?: string
}

/**
 * ADR-041 (2026-08-15): chọn backend DB.
 * - Nếu `TURSO_URL` được set → dùng Turso (libSQL cloud, S3-compatible managed).
 * - Ngược lại → SQLite local file (`DB_PATH` hoặc mặc định `server/data/parish.db`).
 * Không đụng đến network khi import (createClient chỉ connect khi execute).
 */
export function getDbConfig(): DbConfig {
  const tursoUrl = process.env.TURSO_URL
  if (tursoUrl) {
    return {
      isRemote: true,
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    }
  }
  const dbPath = process.env.DB_PATH || join(__dirname, '../../data/parish.db')
  return {
    isRemote: false,
    url: `file:${dbPath}`,
    dbPath,
  }
}
