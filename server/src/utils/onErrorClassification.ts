/**
 * Shared app.onError classification (P1-2).
 *
 * Extracted from server/src/index.ts so the predicate is unit-testable without
 * importing the server entrypoint (which binds ports and starts schedulers).
 *
 * Rules, in order:
 * 1. An explicit numeric 4xx `status` on the error is authoritative — preserve
 *    it and its `code`. Route-level mappers already translate domain failures;
 *    onError must not downgrade them to 400 or upgrade them to 500.
 * 2. Status-less throws matching a known Vietnamese validation phrase are
 *    treated as 400 — but never when the message carries internal
 *    DB/driver markers. Drizzle/libSQL/SQLite texts are English and must stay
 *    on the 500 + UNHANDLED_ERROR + Sentry path. English substrings such as
 *    "required" are never sniffed.
 * 3. Everything else is a server fault.
 *
 * Client messages are truncated so a long internal text can never leak
 * verbatim through the 400 branch.
 */
export const VIETNAMESE_VALIDATION_PHRASES = ['không hợp lệ', 'không đúng định dạng'] as const

const INTERNAL_MESSAGE_MARKERS =
  /SQLITE|CONSTRAINT|Drizzle|libsql|Turso|FOREIGN KEY|NOT NULL|UNIQUE|CHECK constraint|Failed query|QueryError/i

export const MAX_CLIENT_MESSAGE_LENGTH = 500

export type OnErrorClassification =
  | { kind: 'client'; status: number; code: string; clientMessage: string }
  | { kind: 'server' }

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err ?? '')
}

function truncateMessage(message: string): string {
  return message.length > MAX_CLIENT_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_CLIENT_MESSAGE_LENGTH)}…`
    : message
}

function codeForStatus(status: number, record: { code?: unknown }): string {
  if (typeof record.code === 'string' && record.code) return record.code
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  return 'BAD_REQUEST'
}

export function classifyOnError(err: unknown): OnErrorClassification {
  const record = (err ?? {}) as { status?: unknown; code?: unknown }
  if (typeof record.status === 'number' && Number.isInteger(record.status) && record.status >= 400 && record.status < 500) {
    return { kind: 'client', status: record.status, code: codeForStatus(record.status, record), clientMessage: truncateMessage(messageOf(err)) }
  }
  const message = messageOf(err)
  if (
    message &&
    VIETNAMESE_VALIDATION_PHRASES.some(phrase => message.includes(phrase)) &&
    !INTERNAL_MESSAGE_MARKERS.test(message)
  ) {
    return { kind: 'client', status: 400, code: codeForStatus(400, record), clientMessage: truncateMessage(message) }
  }
  return { kind: 'server' }
}
