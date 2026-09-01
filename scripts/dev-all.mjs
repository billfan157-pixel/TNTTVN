/**
 * dev-all.mjs — Chạy đồng thời Client (Vite) + Server (Hono) khi `npm run dev:all`.
 *
 * Lý do tồn tại: trước đây `npm run dev` chỉ chạy Vite; server Hono phải chạy riêng
 * (cd server && npm run dev). Nếu quên start server, Vite proxy `/api` → localhost:3001
 * trả 502 Bad Gateway (VD: POST /api/auth/login). Script này spawn cả 2 và kill cả 2
 * khi một trong hai thoát hoặc nhận SIGINT/SIGTERM.
 *
 * Phía server dùng `node --import tsx --watch` thay vì `tsx watch` độc lập vì `tsx watch`
 * gặp lỗi IPC im lặng trên Node 24+ (Windows) khiến server không bind port 3001 và gây 502.
 *
 * Không dùng `concurrently` để tránh dependency thừa — child_process.spawn là đủ.
 */
import { spawn } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server')

const isWin = process.platform === 'win32'
// Windows: npm là npm.cmd — spawn qua cmd.exe /c (không dùng shell:true để tránh
// DEP0190 + wrapper cmd khó kill); Unix: spawn npm trực tiếp.
const runCmd = (script) => (isWin ? ['cmd.exe', ['/d', '/s', '/c', `npm run ${script}`]] : ['npm', ['run', script]])
const children = []
let shuttingDown = false
let requestedExitCode = 0

function run(name, args, cwd) {
  const [cmd, cmdArgs] = runCmd(args.join(' '))
  const child = spawn(cmd, cmdArgs, {
    cwd,
    stdio: 'inherit',
    shell: false,
    detached: !isWin,
    windowsHide: false,
  })
  children.push(child)
  child.on('exit', (code, signal) => {
    console.log(`\n[dev-all] ${name} exited with code ${code ?? 'null'}`)
    if (!shuttingDown) void shutdown(code ?? (signal ? 1 : 0))
  })
  child.on('error', (error) => {
    console.error(`[dev-all] Không thể chạy ${name}:`, error.message)
    if (!shuttingDown) void shutdown(1)
  })
  return child
}

function stopChildTree(child) {
  if (!child.pid) return Promise.resolve()
  if (isWin) {
    return new Promise(resolve => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.once('error', resolve)
      killer.once('exit', resolve)
    })
  }
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  return Promise.resolve()
}

async function shutdown(exitCode = 0) {
  if (exitCode !== 0) requestedExitCode = exitCode
  if (shuttingDown) return
  shuttingDown = true
  console.log('[dev-all] Stopping all processes...')
  await Promise.race([
    Promise.allSettled(children.map(stopChildTree)),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ])
  process.exit(requestedExitCode)
}

process.on('SIGINT', () => { void shutdown(0) })
process.on('SIGTERM', () => { void shutdown(0) })

const serverScript = process.env.E2E_DISABLE_SERVER_ENV_FILE === 'true' ? 'dev:e2e' : 'dev'

run('vite (client)', ['dev:client'], process.cwd())
run('hono (server)', [serverScript], serverDir)
