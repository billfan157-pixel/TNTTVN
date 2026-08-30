import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const E2E_TEMP_PREFIX = 'brave-davinci-e2e-'
const OWNER_FILE = '.e2e-owner'
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function samePath(left, right) {
  const normalize = value => process.platform === 'win32'
    ? path.resolve(value).toLowerCase()
    : path.resolve(value)
  return normalize(left) === normalize(right)
}

export function createE2ERunId() {
  return randomUUID()
}

export function assertE2ERunId(value) {
  const runId = value?.trim()
  if (!runId || !RUN_ID_PATTERN.test(runId)) {
    throw new Error('E2E_RUN_ID phải là UUID v4 hợp lệ do Playwright tạo.')
  }
  return runId.toLowerCase()
}

export function getE2ESandboxDir(runIdInput) {
  const runId = assertE2ERunId(runIdInput)
  const tempRoot = path.resolve(tmpdir())
  const sandboxDir = path.resolve(tempRoot, `${E2E_TEMP_PREFIX}${runId}`)
  if (!samePath(path.dirname(sandboxDir), tempRoot)
    || path.basename(sandboxDir) !== `${E2E_TEMP_PREFIX}${runId}`) {
    throw new Error(`Sandbox E2E nằm ngoài OS temp: ${sandboxDir}`)
  }
  return sandboxDir
}

export function createE2ESandbox(runIdInput) {
  const runId = assertE2ERunId(runIdInput)
  const sandboxDir = getE2ESandboxDir(runId)
  mkdirSync(sandboxDir, { recursive: false })
  try {
    writeFileSync(path.join(sandboxDir, OWNER_FILE), `${runId}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    })
  } catch (error) {
    rmSync(sandboxDir, { recursive: true, force: true })
    throw error
  }
  return sandboxDir
}

function assertOwnedSandbox(sandboxDir, runId) {
  const expectedDir = getE2ESandboxDir(runId)
  if (!samePath(sandboxDir, expectedDir)) {
    throw new Error(`Target không khớp sandbox E2E của run ${runId}: ${sandboxDir}`)
  }
  const ownerPath = path.join(expectedDir, OWNER_FILE)
  const owner = readFileSync(ownerPath, 'utf8').trim()
  if (owner !== runId) {
    throw new Error(`Ownership marker không khớp sandbox E2E: ${expectedDir}`)
  }
  return expectedDir
}

export function assertE2EDatabasePath(dbPathInput, runIdInput) {
  const runId = assertE2ERunId(runIdInput)
  if (!dbPathInput?.trim()) {
    throw new Error('Thiếu DB_PATH cho sandbox E2E; từ chối fallback vào DB dev.')
  }
  const dbPath = path.resolve(dbPathInput)
  const expectedDbPath = path.join(getE2ESandboxDir(runId), 'parish-e2e.db')
  if (!samePath(dbPath, expectedDbPath)) {
    throw new Error(`DB E2E phải nằm đúng trong sandbox được sở hữu: ${expectedDbPath}`)
  }
  assertOwnedSandbox(path.dirname(dbPath), runId)
  return expectedDbPath
}

export function removeE2ESandbox(runIdInput) {
  const runId = assertE2ERunId(runIdInput)
  const sandboxDir = getE2ESandboxDir(runId)
  if (!existsSync(sandboxDir)) return false
  assertOwnedSandbox(sandboxDir, runId)
  rmSync(sandboxDir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 250,
  })
  return true
}

function parseLoopbackHttpUrl(rawValue, label, { requireRootPath = false } = {}) {
  let parsed
  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error(`${label} không phải URL hợp lệ: ${rawValue}`)
  }
  if (parsed.protocol !== 'http:') {
    throw new Error(`${label} phải dùng http:// cho local E2E runtime.`)
  }
  const hostname = parsed.hostname.toLowerCase()
  if (hostname !== '127.0.0.1') {
    throw new Error(`${label} phải trỏ chính xác về IPv4 loopback 127.0.0.1, không dùng hostname/dev/remote host: ${parsed.hostname}`)
  }
  if (!parsed.port) {
    throw new Error(`${label} phải khai báo port tường minh.`)
  }
  if (parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new Error(`${label} không được chứa credential, query hoặc fragment.`)
  }
  if (requireRootPath && parsed.pathname !== '/') {
    throw new Error(`${label} phải trỏ tới origin root, không kèm path.`)
  }
  return parsed
}

export function resolveE2EEndpoints(env = process.env) {
  const baseInput = env.E2E_BASE_URL?.trim()
  const viteInput = env.E2E_VITE_URL?.trim()
  const baseParsed = baseInput
    ? parseLoopbackHttpUrl(baseInput, 'E2E_BASE_URL', { requireRootPath: true })
    : undefined
  const viteParsed = viteInput
    ? parseLoopbackHttpUrl(viteInput, 'E2E_VITE_URL', { requireRootPath: true })
    : undefined

  if (baseParsed && viteParsed && baseParsed.origin !== viteParsed.origin) {
    throw new Error(`E2E_BASE_URL (${baseParsed.origin}) và E2E_VITE_URL (${viteParsed.origin}) xung đột.`)
  }

  const viteUrl = (baseParsed || viteParsed
    || parseLoopbackHttpUrl('http://127.0.0.1:3100', 'E2E_BASE_URL', { requireRootPath: true })).origin
  const healthParsed = parseLoopbackHttpUrl(
    env.E2E_HEALTH_URL?.trim() || 'http://127.0.0.1:3101/health',
    'E2E_HEALTH_URL',
  )
  if (healthParsed.origin === viteUrl) {
    throw new Error('Vite và API E2E phải dùng hai port riêng.')
  }

  return {
    baseUrl: viteUrl,
    viteUrl,
    healthUrl: healthParsed.toString(),
  }
}
