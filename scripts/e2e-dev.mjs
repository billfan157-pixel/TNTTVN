/**
 * e2e-dev.mjs — WebServer wrapper cho Playwright E2E (TQ-F2, audit 2026-08-21).
 *
 * Vì sao tồn tại: `npm run dev` (dev-all) khởi động Vite (:3000) TRƯỚC rồi Hono
 * (:3001) mới lên sau vài giây (tsx compile + seed check). Playwright webServer
 * chỉ poll được MỘT port — nếu gate ở Vite thì các spec chạm /api chạy trước khi
 * backend sẵn sàng → ECONNREFUSED giả flaky.
 *
 * Cách làm: tạo DB SQLite tạm riêng, spawn dev-all, tự poll Vite + backend rồi
 * seed tài khoản E2E. Chỉ log mốc `[e2e-dev] READY` SAU KHI toàn bộ chuỗi trên
 * hoàn tất; Playwright chờ chính mốc stdout này thay vì poll /health độc lập.
 */
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  createE2ERunId,
  createE2ESandbox,
  pruneStaleE2ESandboxes,
  removeE2ESandbox,
  resolveE2EEndpoints,
} from './e2e-sandbox.mjs'

const isWin = process.platform === 'win32'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const endpoints = resolveE2EEndpoints(process.env)
const VITE_URL = endpoints.viteUrl
const HEALTH_URL = endpoints.healthUrl
const READY_TIMEOUT_MS = Number(process.env.E2E_READY_TIMEOUT_MS || 150_000)
const POLL_MS = 500

let shuttingDown = false
let child
let ownedTempDir
let runId

function cleanupOwnedTemp() {
  if (!ownedTempDir || !runId) return
  if (process.env.E2E_KEEP_TEMP === 'true') {
    console.log(`[e2e-dev] Giữ lại sandbox theo E2E_KEEP_TEMP=true: ${ownedTempDir}`)
    return
  }
  removeE2ESandbox(runId)
}

async function stopChildTree() {
  if (!child?.pid) return
  if (isWin) {
    await new Promise(resolve => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.once('error', resolve)
      killer.once('exit', resolve)
    })
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try { child.kill('SIGTERM') } catch {}
  }
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ])
  try { process.kill(-child.pid, 'SIGKILL') } catch {}
}

async function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  try { await stopChildTree() } catch {}
  try { cleanupOwnedTemp() } catch (err) {
    console.error('[e2e-dev] Không thể dọn sandbox E2E:', err?.message || err)
  }
  process.exit(code)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { void shutdown(0) })
}

async function ping(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function isPortListening(url) {
  const parsed = new URL(url)
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80))
  return new Promise(resolve => {
    const socket = createConnection({ host: parsed.hostname, port })
    const finish = value => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(750)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function configureIsolatedEnvironment() {
  runId = process.env.E2E_RUN_ID
    ? process.env.E2E_RUN_ID
    : createE2ERunId()
  process.env.E2E_RUN_ID = runId
  // Reclaim temp dirs orphaned by previously killed runs (owner-marker +
  // age-gated; never touches live runs and never fails startup).
  const reclaimed = pruneStaleE2ESandboxes()
  if (reclaimed > 0) console.log(`[e2e-dev] Đã dọn ${reclaimed} sandbox tồn đọng.`)
  ownedTempDir = createE2ESandbox(runId)
  const dbPath = path.join(ownedTempDir, 'parish-e2e.db')

  Object.assign(process.env, {
    DB_PATH: dbPath,
    DB_URL: '',
    TURSO_URL: '',
    TURSO_AUTH_TOKEN: '',
    E2E_DISABLE_SERVER_ENV_FILE: 'true',
    E2E_STRICT_PORT: 'true',
    // The isolated harness acts as the only trusted reverse proxy boundary so
    // Playwright can model separate client IPs without weakening production.
    TRUST_PROXY: 'true',
    E2E_BASE_URL: endpoints.baseUrl,
    E2E_VITE_URL: endpoints.viteUrl,
    E2E_HEALTH_URL: endpoints.healthUrl,
    VITE_DEV_PORT: new URL(VITE_URL).port,
    VITE_API_PROXY_TARGET: new URL(HEALTH_URL).origin,
    SERVER_PORT: new URL(HEALTH_URL).port,
    CLIENT_ORIGIN: new URL(VITE_URL).origin,
    SEED_ADMIN_PASSWORD: process.env.E2E_SEED_PASSWORD || process.env.SEED_ADMIN_PASSWORD || 'E2e-Local-Only-1!',
    JWT_SECRET: process.env.JWT_SECRET || 'e2e-local-jwt-secret-key-at-least-32-characters',
    AUTO_BACKUP_ENABLED: 'false',
    BACKUP_DIR: path.join(ownedTempDir, 'backups'),
    BLOB_LOCAL_DIR: path.join(ownedTempDir, 'blobs'),
    SAFETY_BACKUP_DIR: path.join(ownedTempDir, 'safety-backups'),
    R2_ENDPOINT: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: '',
    SENTRY_DSN: '',
  })

  return dbPath
}

async function main() {
  const dbPath = configureIsolatedEnvironment()
  const [viteOccupied, apiOccupied] = await Promise.all([
    isPortListening(VITE_URL),
    isPortListening(HEALTH_URL),
  ])
  if (viteOccupied || apiOccupied) {
    throw new Error(`Cổng E2E đang được dùng (vite=${viteOccupied}, api=${apiOccupied}); dừng dev server cũ trước khi chạy Playwright.`)
  }

  child = spawn(
    process.execPath,
    [path.join(repoRoot, 'scripts/dev-all.mjs')],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
      shell: false,
      detached: !isWin,
      windowsHide: true,
    },
  )
  child.on('exit', code => {
    if (!shuttingDown) void shutdown(code ?? 1)
  })

  const startedAt = Date.now()
  for (;;) {
    const viteReady = await ping(VITE_URL)
    const apiReady = viteReady && (await ping(HEALTH_URL))
    if (viteReady && apiReady) {
      const { seedE2EUsers } = await import('./e2e-seed-users.mjs')
      await seedE2EUsers({ dbPath, runId })
      console.log(`[e2e-dev] READY after ${Date.now() - startedAt}ms (DB ${dbPath} + Vite ${VITE_URL} + health ${HEALTH_URL} + seed)`)
      return
    }
    if (Date.now() - startedAt > READY_TIMEOUT_MS) {
      throw new Error(`NOT ready after ${READY_TIMEOUT_MS}ms (vite=${viteReady}, api=${apiReady})`)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}

main().catch(err => {
  console.error('[e2e-dev] Khởi động E2E thất bại:', err?.message || err)
  void shutdown(1)
})
