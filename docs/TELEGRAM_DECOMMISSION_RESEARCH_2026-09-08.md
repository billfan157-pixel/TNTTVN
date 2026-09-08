# Telegram Decommission — Deep Research & Implementation Record

> Date: 2026-09-08  
> Decision: retire Telegram from Catevia  
> Classification: D3 — authorization, privacy, durable delivery and data migration  
> Status: implemented in the current working tree; local verification is recorded below

## Direct answer

Catevia no longer needs Telegram as a product or operational channel. The supported notification path is now the existing durable `notifications` queue feeding Web Push and native FCM/APNs through `appPushService`. In-app state and `audit_logs` remain the source for business history; Sentry plus structured server logs remain the operational error path.

Simply leaving `TELEGRAM_*` unset was not sufficient. The prior implementation still contained a bot process, link API, parent UI, retryable database work and startup/crash sends. A restored database or later configuration change could therefore reactivate delivery. Retirement is implemented across composition, contracts, persistence and deployment configuration.

## Current-source dependency findings

- Composition root: `server/src/index.ts` previously started/stopped the grammY bot and sent startup/crash messages.
- Parent surface: four authenticated `/api/parents/telegram/*` routes plus `TelegramLinkCard` and `useTelegramLink` exposed linking and consent controls.
- Delivery: `notificationQueue` accepted both `telegram` and `webpush`; `smartNotifications`, leave review and grade override paths could create or send Telegram work.
- Persistence: `telegram_link_tokens`, `telegram_links`, historical `notifications.type='telegram'` and legacy audit actions exist in backups and production-compatible schemas.
- Deployment: `.env.example`, `render.yaml`, root/server dependencies and the Sunday readiness audit still treated Telegram as supported.
- Operations: Operations reminders already use targeted Web/Native Push and have no Telegram-specific dependency.

## Implemented architecture

1. `notificationQueue` accepts only `webpush` at compile time and dispatches only through `appPushService`.
2. Parent, class, Sunday, parish-notice and leave-review notifications use explicit tenant-scoped user IDs. Child-sensitive delivery retains per-attempt ownership/status revalidation and generic bodies.
3. Grade override/restore no longer creates an external notification. Transactional grade audit remains authoritative.
4. Bot services, bot lifecycle, Telegram UI/hooks/client methods, grammY dependencies and deployment variables are removed.
5. The four old parent endpoints remain temporarily as authenticated, parent-role-gated compatibility tombstones returning HTTP `410` with `CHANNEL_RETIRED`. They do not mutate data or write misleading consent audit events.
6. Web/Native Push templates are plain text; Telegram Markdown escaping and formatting were removed.

## Data migration, compatibility and recovery

Migration `20260908-235` is intentionally non-destructive:

- every unconsumed legacy link token receives `consumed_at`;
- every active/enabled link becomes `REVOKED`, notifications disabled, with revocation time preserved when already present;
- every undelivered `notifications.type='telegram'` row in `retrying` becomes terminal `failed` with `CHANNEL_RETIRED`, and any lease/retry timestamp is cleared;
- sent/failed notification history, revoked links, schemas and legacy audit events are retained.

Startup repeats the same retirement transaction before queue recovery. This is an idempotent defense for restored databases and rolling deployments. Recovery also refuses to load Telegram rows. The current release deliberately does not drop legacy tables or rewrite historical payloads; physical erasure requires a separate retention/privacy decision and backup-aware migration.

Rollback means reverting application code and restoring/reviewing configuration; it does not automatically reactivate old consent. Any future channel reintroduction must require a new ADR and fresh explicit opt-in rather than changing old `REVOKED` rows back to active.

## Security and privacy result

- No bot command or unauthenticated chat identity can link, inspect or mutate a Catevia account.
- No global Telegram administrator chat remains as a cross-tenant fallback.
- Retry/restart cannot release an old Telegram message after ownership or product policy changes.
- Existing app-push recipient checks remain server-authoritative and tenant-scoped; frontend visibility is not an authorization boundary.
- Durable work cannot degrade from a missing/malformed target into parish broadcast, cannot report `sent` with zero usable endpoint, and direct Web/Native broadcasts exclude unbound, locked and deleted accounts.
- Historical records are retained for accountability, while future writes cannot create a Telegram delivery item through typed application code.

## Verification evidence

- Targeted retirement boundaries (migration, durable queue/recovery, recipient authority, parent `410` compatibility, leave review, smart notifications, grade audit and plain-text templates): **14 files / 132 tests PASS**.
- Adjacent shared notification, Operations, parent UI, native-push, observability, deployment-contract and schema regressions: **15 files / 87 tests PASS**. Security-critical suite: **7 files / 73 tests PASS**.
- Current test inventory was covered in two stable partitions: suite excluding the known order-sensitive password-reset file **332 files / 2,377 tests PASS**, then that file **1 file / 6 tests PASS**. The broad invocation exited non-zero only because a concurrently created `zz-scratch-gen.test.ts` disappeared between Vitest discovery and import; no executed product test failed and the file no longer exists.
- Server TypeScript build, full production build (**2,824 modules; PWA 266 entries**), `npm run lint`, Design System guard (**0 violations / 134 TSX files**), architecture inventory (**32 routes / 6 repositories / 54 services / 12 domain files / 69 tables**) and `git diff --check` PASS. The build emitted only the existing Vite `NODE_ENV` and deprecated `inlineDynamicImports` warnings.
- Residual push hardening focused regressions: **10 files / 77 tests PASS**, covering explicit queue targets, malformed/null recovery, zero-endpoint failure, dead-endpoint cleanup without duplicate retry, active-account filtering, Operations reconciliation and notification security callers.

## Deployment gates and residual risk

- Remove any existing Telegram bot token/admin-chat secrets from the real Render environment and revoke the token with the provider. Repository removal cannot prove external secret deletion or provider revocation.
- Apply migration `20260908-235` to the real deployment and inspect counts of revoked links, consumed tokens and `CHANNEL_RETIRED` rows. Local tests do not prove production data shape.
- Perform Web/Native Push smoke tests on supported browser/Android/iOS devices. Permanently dead endpoints are removed without aggregate retry, but provider delivery remains at-least-once: a transient partial failure or crash after acceptance can still duplicate a message already accepted by one endpoint.
- Decide a later retention policy for legacy Telegram identifiers and historical messages before dropping/anonymizing tables or backups. No destructive retention default is introduced here.
