import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { telegramLinkTokens, telegramLinks, users } from '../db/schema.js'
import { generateId } from '../utils/id.js'
import {
  consumeTelegramLinkToken,
  createTelegramLinkToken,
  getActiveTelegramLinksForUsers,
  getTelegramLinkStatus,
  revokeTelegramLink,
  setTelegramNotifications,
} from '../services/telegramLinkService.js'

const parishId = `telegram-test-${Date.now()}`
const parentId = generateId('USR')
const otherParentId = generateId('USR')

beforeAll(async () => {
  await db.insert(users).values([
    {
      id: parentId,
      username: `${parishId}-parent`,
      passwordHash: 'test-hash',
      fullName: 'Telegram Parent',
      role: 'phuhuynh',
      status: 'ACTIVE',
      parishId,
    },
    {
      id: otherParentId,
      username: `${parishId}-other-parent`,
      passwordHash: 'test-hash',
      fullName: 'Other Parent',
      role: 'phuhuynh',
      status: 'ACTIVE',
      parishId,
    },
  ])
})

afterAll(async () => {
  await db.delete(telegramLinks).where(eq(telegramLinks.parishId, parishId))
  await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.parishId, parishId))
  await db.delete(users).where(eq(users.parishId, parishId))
})

describe('Telegram parent link service', () => {
  it('issues a short-lived token and stores only a digest', async () => {
    const result = await createTelegramLinkToken(parentId, parishId)
    expect(result.token).toHaveLength(32)
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())

    const [stored] = await db
      .select({ tokenHash: telegramLinkTokens.tokenHash, expiresAt: telegramLinkTokens.expiresAt, consumedAt: telegramLinkTokens.consumedAt })
      .from(telegramLinkTokens)
      .where(and(eq(telegramLinkTokens.userId, parentId), eq(telegramLinkTokens.parishId, parishId)))
      .limit(1)

    expect(stored?.tokenHash).toBeDefined()
    expect(stored?.tokenHash).not.toBe(result.token)
    expect(stored?.consumedAt).toBeNull()
  })

  it('consumes the token once and rejects reuse', async () => {
    const { token } = await createTelegramLinkToken(parentId, parishId)
    const linked = await consumeTelegramLinkToken(token, {
      chatId: 'chat-parent-1',
      telegramUserId: 'tg-parent-1',
      telegramUsername: 'parent_one',
    })

    expect(linked).toEqual({ ok: true, userId: parentId, parishId, fullName: 'Telegram Parent' })

    const reused = await consumeTelegramLinkToken(token, { chatId: 'chat-parent-2' })
    expect(reused).toEqual({ ok: false, code: 'INVALID_OR_EXPIRED_TOKEN' })
  })

  it('does not allow a chat to be claimed by another parent', async () => {
    const { token } = await createTelegramLinkToken(otherParentId, parishId)
    const result = await consumeTelegramLinkToken(token, { chatId: 'chat-parent-1' })
    expect(result).toEqual({ ok: false, code: 'CHAT_ALREADY_LINKED' })
  })

  it('supports explicit opt-out and unlink operations', async () => {
    expect(await setTelegramNotifications('chat-parent-1', false)).toBe(true)
    expect(await getActiveTelegramLinksForUsers([parentId], parishId)).toHaveLength(0)

    expect(await setTelegramNotifications('chat-parent-1', true)).toBe(true)
    expect(await getActiveTelegramLinksForUsers([parentId], parishId)).toHaveLength(1)

    expect(await revokeTelegramLink('chat-parent-1')).toBe(true)
    expect(await getActiveTelegramLinksForUsers([parentId], parishId)).toHaveLength(0)

    const status = await getTelegramLinkStatus(parentId, parishId)
    expect(status[0]?.status).toBe('REVOKED')
    expect(status[0]?.notificationsEnabled).toBe(0)
  })

  it('handles concurrent token consumption attempts safely without race conditions', async () => {
    const { token } = await createTelegramLinkToken(parentId, parishId)
    const results = await Promise.all([
      consumeTelegramLinkToken(token, { chatId: 'chat-concurrent-1' }),
      consumeTelegramLinkToken(token, { chatId: 'chat-concurrent-2' }),
      consumeTelegramLinkToken(token, { chatId: 'chat-concurrent-3' }),
    ])

    const successCount = results.filter((r) => r.ok).length
    const invalidCount = results.filter((r) => !r.ok && r.code === 'INVALID_OR_EXPIRED_TOKEN').length

    expect(successCount).toBe(1)
    expect(invalidCount).toBe(2)
  })

  it('serializes concurrent claims for the same chat across different parent tokens', async () => {
    const first = await createTelegramLinkToken(parentId, parishId)
    const second = await createTelegramLinkToken(otherParentId, parishId)
    const results = await Promise.all([
      consumeTelegramLinkToken(first.token, { chatId: 'chat-shared-race' }),
      consumeTelegramLinkToken(second.token, { chatId: 'chat-shared-race' }),
    ])

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.code === 'CHAT_ALREADY_LINKED')).toHaveLength(1)
  })
})
