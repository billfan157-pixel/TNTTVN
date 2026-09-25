// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { classifyOnError } from '../utils/onErrorClassification.js'

const appSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../app.ts'), 'utf8')

describe('P1-2 app.onError classification', () => {
  it('routes through the shared classifier instead of inline substring sniffing', () => {
    expect(appSource).toContain('classifyOnError')
    const start = appSource.indexOf('app.onError')
    expect(start).toBeGreaterThan(-1)
    expect(appSource.slice(start, start + 900)).not.toMatch(/includes\('required'\)/)
  })

  it('preserves explicit 4xx statuses and codes instead of forcing 400/500', () => {
    expect(classifyOnError(Object.assign(new Error('Bạn không có quyền.'), { status: 403, code: 'FORBIDDEN' }))).toMatchObject({
      kind: 'client', status: 403, code: 'FORBIDDEN',
    })
    expect(classifyOnError(Object.assign(new Error('Version conflict.'), { status: 409 }))).toMatchObject({
      kind: 'client', status: 409, code: 'CONFLICT',
    })
    expect(classifyOnError(Object.assign(new Error('Missing.'), { status: 404 }))).toMatchObject({
      kind: 'client', status: 404, code: 'NOT_FOUND',
    })
  })

  it('maps curated Vietnamese validation phrases to 400', () => {
    expect(classifyOnError(new Error('Số điện thoại không hợp lệ'))).toMatchObject({ kind: 'client', status: 400 })
    expect(classifyOnError(new Error('Ngày sinh không đúng định dạng YYYY-MM-DD'))).toMatchObject({ kind: 'client', status: 400 })
  })

  it('keeps DB-like messages containing required on the 500 path', () => {
    expect(classifyOnError(new Error('NOT NULL constraint failed: value is required'))).toEqual({ kind: 'server' })
    expect(classifyOnError(new Error('DrizzleQueryError: Failed query: insert required column'))).toEqual({ kind: 'server' })
    // Even a Vietnamese phrase loses the 400 mapping when driver markers are present.
    expect(classifyOnError(new Error('dữ liệu không hợp lệ: SQLITE_CONSTRAINT_UNIQUE'))).toEqual({ kind: 'server' })
  })

  it('truncates long client messages instead of echoing internals verbatim', () => {
    const long = `không hợp lệ: ${'x'.repeat(2000)}`
    const result = classifyOnError(Object.assign(new Error(long), { status: 400 }))
    expect(result.kind).toBe('client')
    if (result.kind === 'client') expect(result.clientMessage.length).toBeLessThanOrEqual(501)
  })

  it('wires the same outcome through a Hono onError handler', async () => {
    const app = new Hono()
    app.onError((err, c) => {
      const classification = classifyOnError(err)
      if (classification.kind === 'client') {
        return c.json({ success: false, error: { code: classification.code, message: classification.clientMessage } }, classification.status as 400)
      }
      return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' } }, 500)
    })
    app.get('/boom-validation', () => { throw new Error('Số điện thoại không hợp lệ') })
    app.get('/boom-db', () => { throw new Error('NOT NULL constraint failed: value is required') })
    app.get('/boom-forbidden', () => { throw Object.assign(new Error('Bạn không có quyền.'), { status: 403, code: 'FORBIDDEN' }) })

    const validation = await app.request('/boom-validation')
    expect(validation.status).toBe(400)
    expect(await validation.json()).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } })

    const db = await app.request('/boom-db')
    expect(db.status).toBe(500)

    const forbidden = await app.request('/boom-forbidden')
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } })
  })
})
