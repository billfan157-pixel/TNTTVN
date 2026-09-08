import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const tempRoot = mkdtempSync(join(tmpdir(), 'catevia-operations-benchmark-'))
const resolvedRoot = resolve(tempRoot)
const expectedParent = resolve(tmpdir())
if (dirname(resolvedRoot) !== expectedParent || !basename(resolvedRoot).startsWith('catevia-operations-benchmark-')) {
  throw new Error(`Refusing to use unexpected benchmark path: ${resolvedRoot}`)
}
let status = 1
try {
  const tsxCli = resolve('node_modules/tsx/dist/cli.mjs')
  const result = spawnSync(process.execPath, [tsxCli, resolve('scripts/benchmark-operations.ts')], {
    cwd: resolve('.'),
    env: {
      ...process.env,
      DB_PATH: join(resolvedRoot, 'operations.sqlite'),
      TURSO_URL: '',
      TURSO_AUTH_TOKEN: '',
    },
    stdio: 'inherit',
  })
  status = result.status ?? 1
  if (result.error) throw result.error
} finally {
  rmSync(resolvedRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
process.exitCode = status
