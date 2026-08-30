import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// Runtime helper is intentionally plain ESM so Playwright, the seed CLI and its
// cleanup reporter share the exact same fail-closed contract.
// @ts-expect-error JavaScript helper has no separate declaration file.
import { assertE2EDatabasePath, createE2ERunId, createE2ESandbox, removeE2ESandbox, resolveE2EEndpoints } from '../../scripts/e2e-sandbox.mjs'

describe('isolated Playwright sandbox contract', () => {
  it('rejects conflicting UI endpoints', () => {
    expect(() => resolveE2EEndpoints({
      E2E_BASE_URL: 'http://127.0.0.1:3100',
      E2E_VITE_URL: 'http://127.0.0.1:3000',
    })).toThrow(/xung đột/)
  })

  it('rejects remote and portless endpoints', () => {
    expect(() => resolveE2EEndpoints({
      E2E_BASE_URL: 'https://example.com:443',
    })).toThrow(/http:\/\//)
    expect(() => resolveE2EEndpoints({
      E2E_BASE_URL: 'http://127.0.0.1',
    })).toThrow(/port tường minh/)
    expect(() => resolveE2EEndpoints({
      E2E_BASE_URL: 'http://localhost:3100',
    })).toThrow(/127\.0\.0\.1/)
  })

  it('normalizes one local endpoint source for browser and harness', () => {
    expect(resolveE2EEndpoints({
      E2E_VITE_URL: 'http://127.0.0.1:3200/',
      E2E_HEALTH_URL: 'http://127.0.0.1:3201/health',
    })).toEqual({
      baseUrl: 'http://127.0.0.1:3200',
      viteUrl: 'http://127.0.0.1:3200',
      healthUrl: 'http://127.0.0.1:3201/health',
    })
  })

  it('accepts only the owned per-run database and removes that sandbox', () => {
    const runId = createE2ERunId()
    const sandboxDir = createE2ESandbox(runId)
    const dbPath = path.join(sandboxDir, 'parish-e2e.db')
    try {
      expect(assertE2EDatabasePath(dbPath, runId)).toBe(dbPath)
      expect(() => assertE2EDatabasePath('server/data/parish.db', runId))
        .toThrow(/DB E2E phải nằm đúng/)
    } finally {
      removeE2ESandbox(runId)
    }
    expect(existsSync(sandboxDir)).toBe(false)
  })
})
