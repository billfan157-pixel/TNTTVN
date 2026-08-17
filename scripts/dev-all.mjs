/**
 * dev-all.mjs — Chạy đồng thời Client (Vite) + Server (Hono) khi `npm run dev:all`.
 *
 * Lý do tồn tại: trước đây `npm run dev` chỉ chạy Vite; server Hono phải chạy riêng
 * (cd server && npm run dev). Nếu quên start server, Vite proxy `/api` → localhost:3001
 * trả 502 Bad Gateway (VD: POST /api/auth/login). Script này spawn cả 2 và kill cả 2
 * khi một trong hai thoát hoặc nhận SIGINT/SIGTERM.
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

function run(name, args, cwd) {
  const [cmd, cmdArgs] = runCmd(args.join(' '))
  const child = spawn(cmd, cmdArgs, {
    cwd,
    stdio: 'inherit',
    shell: false,
    windowsHide: false,
  })
  children.push(child)
  child.on('exit', (code) => {
    console.log(`\n[dev-all] ${name} exited with code ${code ?? 'null'}`)
    shutdown()
  })
  return child
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  console.log('[dev-all] Stopping all processes...')
  for (const child of children) {
    try {
      child.kill('SIGTERM')
    } catch {}
  }
  // Windows: child.kill trên shell wrapper có thể không lan xuống node con —
  // cho phép 1.5s để chúng tự thoát rồi ép thoát.
  setTimeout(() => process.exit(0), 1500)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

run('vite (client)', ['dev:client'], process.cwd())
run('hono (server)', ['dev'], serverDir)