/**
 * e2e-dev.mjs — WebServer wrapper cho Playwright E2E (TQ-F2, audit 2026-08-21).
 *
 * Vì sao tồn tại: `npm run dev` (dev-all) khởi động Vite (:3000) TRƯỚC rồi Hono
 * (:3001) mới lên sau vài giây (tsx compile + seed check). Playwright webServer
 * chỉ poll được MỘT port — nếu gate ở Vite thì các spec chạm /api chạy trước khi
 * backend sẵn sàng → ECONNREFUSED giả flaky.
 *
 * Cách làm: spawn dev-all, tự poll /health của backend; CHỈ log "ready" khi CẢ
 * Vite (3000) và backend health (3001) đã 2xx. Playwright cấu hình url trỏ tới
 * /health nên readiness = full-stack thật sự. Wrapper giữ sống đến khi bị kill
 * (Playwright teardown) hoặc timeout ở phía Playwright xử lý.
 */
import { spawn } from 'node:child_process'
import process from 'node:process'

const isWin = process.platform === 'win32'
const VITE_URL = process.env.E2E_VITE_URL || 'http://127.0.0.1:3000'
const HEALTH_URL = process.env.E2E_HEALTH_URL || 'http://127.0.0.1:3001/health'
const READY_TIMEOUT_MS = Number(process.env.E2E_READY_TIMEOUT_MS || 150_000)
const POLL_MS = 500

const child = spawn(
  ...(isWin ? ['cmd.exe', ['/d', '/s', '/c', 'npm run dev']] : ['npm', ['run', 'dev']]),
  { cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), stdio: 'inherit', shell: false },
)

let shuttingDown = false
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  try {
    if (isWin) {
      // Windows: kill cả tree (npm → cmd → node con)
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  } catch {}
  process.exit(code)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0))
}
child.on('exit', (code) => shutdown(code ?? 1))

async function ping(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

const startedAt = Date.now()
for (;;) {
  const viteReady = await ping(VITE_URL)
  const apiReady = viteReady && (await ping(HEALTH_URL))
  if (viteReady && apiReady) {
    // Seed user E2E (bill + 3 vai trò) TRƯỚC khi báo ready — spec roles/crud
    // đăng nhập thật bằng các tài khoản này ngay từ test đầu tiên.
    try {
      const { seedE2EUsers } = await import('./e2e-seed-users.mjs')
      await seedE2EUsers()
    } catch (err) {
      console.error('[e2e-dev] seed E2E users thất bại:', err?.message || err)
    }
    console.log(`[e2e-dev] ready after ${Date.now() - startedAt}ms (Vite ${VITE_URL} + health ${HEALTH_URL})`)
    break
  }
  if (Date.now() - startedAt > READY_TIMEOUT_MS) {
    console.error(`[e2e-dev] NOT ready after ${READY_TIMEOUT_MS}ms (vite=${viteReady}, api=${apiReady})`)
    shutdown(1)
  }
  await new Promise((r) => setTimeout(r, POLL_MS))
}
