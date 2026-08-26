import { createHash, randomBytes } from 'crypto'
import { and, eq,  inArray, isNull } from 'drizzle-orm'
import { db, runDbTransaction } from '../db/index.js'
import { telegramLinkTokens, telegramLinks, users } from '../db/schema.js'
import { generateId } from '../utils/id.js'

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000

type TelegramIdentity = {
  chatId: string
  telegramUserId?: string | null
  telegramUsername?: string | null
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function createLinkToken(): string {
  return randomBytes(24).toString('base64url')
}

function nowIso(): string {
  return new Date().toISOString()
}

export type TelegramLinkResult =
  | { ok: true; userId: string; parishId: string; fullName: string }
  | { ok: false; code: 'INVALID_OR_EXPIRED_TOKEN' | 'PARENT_ACCOUNT_REQUIRED' | 'CHAT_ALREADY_LINKED' }

/**
 * Issues a short-lived one-time token. The plaintext token is returned only to
 * the authenticated parent-facing UI; only its SHA-256 hash is persisted.
 */
export async function createTelegramLinkToken(userId: string, parishId: string): Promise<{ token: string; expiresAt: string }> {
  const [parent] = await db
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.parishId, parishId)))
    .limit(1)

  if (!parent || parent.role !== 'phuhuynh' || parent.status !== 'ACTIVE') {
    throw Object.assign(new Error('Chỉ tài khoản phụ huynh đang hoạt động mới được liên kết Telegram'), { code: 'PARENT_ACCOUNT_REQUIRED' })
  }

  const token = createLinkToken()
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS).toISOString()
  const now = nowIso()

  // A new token invalidates prior unconsumed tokens for this parent. This keeps
  // the linking surface small if a link screen is opened repeatedly.
  await db
    .delete(telegramLinkTokens)
    .where(and(eq(telegramLinkTokens.userId, userId), eq(telegramLinkTokens.parishId, parishId), isNull(telegramLinkTokens.consumedAt)))

  await db.insert(telegramLinkTokens).values({
    id: generateId('SML'),
    userId,
    parishId,
    tokenHash: hashToken(token),
    expiresAt,
    createdAt: now,
  })

  return { token, expiresAt }
}

/**
 * Atomically consumes a valid token and links the Telegram chat. A chat already
 * linked to another active parent is rejected rather than silently reassigned.
 */
export async function consumeTelegramLinkToken(token: string, identity: TelegramIdentity): Promise<TelegramLinkResult> {
  const tokenHash = hashToken(token.trim())
  const now = nowIso()

  return runDbTransaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: telegramLinkTokens.id,
        userId: telegramLinkTokens.userId,
        parishId: telegramLinkTokens.parishId,
        expiresAt: telegramLinkTokens.expiresAt,
        consumedAt: telegramLinkTokens.consumedAt,
      })
      .from(telegramLinkTokens)
      .where(eq(telegramLinkTokens.tokenHash, tokenHash))
      .limit(1)

    if (!candidate || candidate.consumedAt || candidate.expiresAt <= now) {
      return { ok: false, code: 'INVALID_OR_EXPIRED_TOKEN' }
    }

    const [parent] = await tx
      .select({ id: users.id, role: users.role, status: users.status, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.id, candidate.userId), eq(users.parishId, candidate.parishId)))
      .limit(1)

    if (!parent || parent.role !== 'phuhuynh' || parent.status !== 'ACTIVE') {
      return { ok: false, code: 'PARENT_ACCOUNT_REQUIRED' }
    }

    const [existingChat] = await tx
      .select({ id: telegramLinks.id, userId: telegramLinks.userId, status: telegramLinks.status })
      .from(telegramLinks)
      .where(eq(telegramLinks.chatId, identity.chatId))
      .limit(1)

    if (existingChat?.status === 'ACTIVE' && existingChat.userId !== candidate.userId) {
      return { ok: false, code: 'CHAT_ALREADY_LINKED' }
    }

    const consumed = await tx
      .update(telegramLinkTokens)
      .set({ consumedAt: now })
      .where(and(eq(telegramLinkTokens.id, candidate.id), isNull(telegramLinkTokens.consumedAt)))
      .returning({ id: telegramLinkTokens.id })

    if (consumed.length === 0) {
      return { ok: false, code: 'INVALID_OR_EXPIRED_TOKEN' }
    }

    if (existingChat) {
      await tx
        .update(telegramLinks)
        .set({
          userId: candidate.userId,
          parishId: candidate.parishId,
          telegramUserId: identity.telegramUserId ?? null,
          telegramUsername: identity.telegramUsername ?? null,
          status: 'ACTIVE',
          notificationsEnabled: 1,
          linkedAt: now,
          revokedAt: null,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(telegramLinks.id, existingChat.id))
    } else {
      await tx.insert(telegramLinks).values({
        id: generateId('SML'),
        userId: candidate.userId,
        parishId: candidate.parishId,
        chatId: identity.chatId,
        telegramUserId: identity.telegramUserId ?? null,
        telegramUsername: identity.telegramUsername ?? null,
        status: 'ACTIVE',
        notificationsEnabled: 1,
        linkedAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
    }

    return { ok: true, userId: parent.id, parishId: candidate.parishId, fullName: parent.fullName }
  })
}

export async function getTelegramLinkForChat(chatId: string) {
  const [link] = await db
    .select({
      id: telegramLinks.id,
      userId: telegramLinks.userId,
      parishId: telegramLinks.parishId,
      status: telegramLinks.status,
      notificationsEnabled: telegramLinks.notificationsEnabled,
      fullName: users.fullName,
    })
    .from(telegramLinks)
    .innerJoin(users, eq(users.id, telegramLinks.userId))
    .where(and(eq(telegramLinks.chatId, chatId), eq(telegramLinks.status, 'ACTIVE'), eq(telegramLinks.notificationsEnabled, 1)))
    .limit(1)

  if (link) {
    await db.update(telegramLinks).set({ lastSeenAt: nowIso(), updatedAt: nowIso() }).where(eq(telegramLinks.id, link.id))
  }

  return link ?? null
}

export async function setTelegramNotifications(chatId: string, enabled: boolean): Promise<boolean> {
  const result = await db
    .update(telegramLinks)
    .set({ notificationsEnabled: enabled ? 1 : 0, updatedAt: nowIso() })
    .where(and(eq(telegramLinks.chatId, chatId), eq(telegramLinks.status, 'ACTIVE')))
    .returning({ id: telegramLinks.id })
  return result.length > 0
}

export async function revokeTelegramLink(chatId: string): Promise<boolean> {
  const now = nowIso()
  const result = await db
    .update(telegramLinks)
    .set({ status: 'REVOKED', notificationsEnabled: 0, revokedAt: now, updatedAt: now })
    .where(and(eq(telegramLinks.chatId, chatId), eq(telegramLinks.status, 'ACTIVE')))
    .returning({ id: telegramLinks.id })
  return result.length > 0
}

export async function getActiveTelegramLinksForUsers(userIds: string[], parishId: string) {
  if (userIds.length === 0) return []
  return db
    .select({ chatId: telegramLinks.chatId, userId: telegramLinks.userId })
    .from(telegramLinks)
    .where(and(
      eq(telegramLinks.parishId, parishId),
      eq(telegramLinks.status, 'ACTIVE'),
      eq(telegramLinks.notificationsEnabled, 1),
      inArray(telegramLinks.userId, userIds),
    ))
}

export async function getTelegramLinkStatus(userId: string, parishId: string) {
  return db
    .select({
      chatId: telegramLinks.chatId,
      telegramUsername: telegramLinks.telegramUsername,
      status: telegramLinks.status,
      notificationsEnabled: telegramLinks.notificationsEnabled,
      linkedAt: telegramLinks.linkedAt,
      lastSeenAt: telegramLinks.lastSeenAt,
    })
    .from(telegramLinks)
    .where(and(eq(telegramLinks.userId, userId), eq(telegramLinks.parishId, parishId)))
}
