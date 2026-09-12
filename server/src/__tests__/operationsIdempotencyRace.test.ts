// @vitest-environment node
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { dbStub, txStub, runDbTransactionMock, dbSelectQueue, txSelectQueue } = vi.hoisted(() => {
  const dbSelectQueue: unknown[][] = []
  const txSelectQueue: unknown[][] = []
  const chain = (queue: unknown[][]) => {
    const builder: Record<string, unknown> = {}
    builder.from = vi.fn(() => builder)
    builder.where = vi.fn(() => builder)
    builder.limit = vi.fn(() => Promise.resolve(queue.shift() ?? []))
    builder.values = vi.fn(() => Promise.resolve())
    return builder
  }
  const txStub = {
    select: vi.fn(() => chain(txSelectQueue)),
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
  }
  const dbStub = {
    select: vi.fn(() => chain(dbSelectQueue)),
  }
  const runDbTransactionMock = vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(txStub))
  return { dbStub, txStub, runDbTransactionMock, dbSelectQueue, txSelectQueue }
})

vi.mock('../db/index.js', () => ({ db: dbStub, runDbTransaction: runDbTransactionMock }))

import { runIdempotentOperationsCommand } from '../services/operationsIdempotency.js'

const actor = { userId: 'racer', role: 'admin', parishId: 'parish-race' } as never
const command = 'operations.test.race'
const payload = { n: 1 }
// Must mirror requestHash(): sha256 of the key-sorted { command, payload }.
const hash = createHash('sha256').update(JSON.stringify({ command, payload })).digest('hex')
const receiptRow = {
  command,
  requestHash: hash,
  responseJson: JSON.stringify({ ok: 1 }),
  responsePrunedAt: null,
}

beforeEach(() => {
  dbSelectQueue.length = 0
  txSelectQueue.length = 0
  dbStub.select.mockClear()
  txStub.select.mockClear()
  txStub.insert.mockClear()
})

// P1-12: the UNIQUE-violation recovery in runIdempotentOperationsCommand only
// triggers when a true concurrent writer commits the receipt key between the
// pre-transaction check and the closing insert. That interleaving cannot be
// scheduled deterministically against real SQLite (it reports BUSY instead),
// so these tests pin the recovery logic with a stubbed transaction layer:
// no receipt at either check, then a UNIQUE failure on insert.
describe('P1-12 idempotency UNIQUE-violation recovery', () => {
  it('returns the raced receipt as a replay instead of executing twice', async () => {
    dbSelectQueue.push([], [receiptRow])
    txSelectQueue.push([])
    vi.mocked(txStub.insert).mockReturnValueOnce({
      values: vi.fn(() => Promise.reject(new Error('UNIQUE constraint failed: operation_mutation_receipts'))),
    } as never)

    const result = await runIdempotentOperationsCommand(actor, 'key-1', command, payload, async () => ({ ok: 'second execution' }))

    expect(result).toEqual({ value: { ok: 1 }, replayed: true })
  })

  it('rethrows the UNIQUE failure when no raced receipt exists', async () => {
    dbSelectQueue.push([], [])
    txSelectQueue.push([])
    vi.mocked(txStub.insert).mockReturnValueOnce({
      values: vi.fn(() => Promise.reject(new Error('UNIQUE constraint failed: operation_mutation_receipts'))),
    } as never)

    await expect(runIdempotentOperationsCommand(actor, 'key-2', command, payload, async () => ({ ok: 1 })))
      .rejects.toThrow('UNIQUE constraint failed')
  })

  it('ignores non-constraint failures without consulting the receipt table', async () => {
    dbSelectQueue.push([])
    txSelectQueue.push([])
    const boom = new Error('connection reset')
    vi.mocked(txStub.insert).mockReturnValueOnce({ values: vi.fn(() => Promise.reject(boom)) } as never)

    await expect(runIdempotentOperationsCommand(actor, 'key-3', command, payload, async () => ({ ok: 1 }))).rejects.toBe(boom)
    // Only the pre-transaction check ran; no recovery reload was attempted.
    expect(dbStub.select).toHaveBeenCalledTimes(1)
  })
})
