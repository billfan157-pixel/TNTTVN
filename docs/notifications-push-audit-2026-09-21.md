# Audit Report: Notifications & Push Delivery — Data Minimization, Idempotency, Cross-Tenant Delivery Safety

**Repository:** Catevia / TNTTVN (`billfan157-pixel/TNTTVN`, internal codename: `brave-davinci`)  
**Audit mode:** D2 overall, with individual findings escalated to **D3** (Security/Tenancy & Data Integrity protected boundaries); Adversarial, Evidence-Based, READ-ONLY  
**Report version:** v1.0 (2026-09-21)  
**Governance:** Root `AGENTS.md`, `.agents/task-classification.md`, `.agents/protected-invariants.md`, `.agents/skills/catevia-current-truth/SKILL.md`, `.agents/skills/catevia-verification/SKILL.md`  

---

## Executive Summary

This audit evaluates delivery correctness, data minimization, idempotency, and cross-tenant/cross-account delivery safety across the full notification and push pipeline in Catevia. The pipeline spans domain event producers (`smartNotifications.ts`, `operationsReminderService.ts`, `sundayReminderScheduler.ts`, `notifications.ts`), the durable background queue (`notificationQueue.ts`), four external delivery adapters (`apnsPushProvider.ts`, `fcmPushProvider.ts`, `webPushService.ts`, `nativePushService.ts`), and the client subscription lifecycle (`pushManager.ts`, `NativePushSettings.tsx`).

### Core Conclusions

1. **Academic Notification Privacy & Decommissioning are Verified Strengths:**  
   Child notifications (`report`, `absence`) strictly enforce the generic body invariant (`ACADEMIC_NOTIFICATION_MESSAGE`) before provider delivery (`notificationQueue.ts:231, 362`). Telegram was thoroughly retired under ADR-111 with fail-closed startup cleanup, 410 API tombstones, and recovery filtering leaving no reactivation path (`VERIFIED_OBSERVED`). Furthermore, native device push tokens are never persisted in client storage (localStorage, Dexie/IndexedDB) and are never emitted in logs across any provider or manager (`VERIFIED_OBSERVED`).

2. **Severe Authorization & Identity Defect in Absence Notifications (`NOTIF-01`, Escalated to D3):**  
   The `POST /smart/absence` route resolves student records by `parentPhone` alone using SQL `limit(1)` (`notifications.ts:223`). In parishes where siblings share a parent phone number, this creates non-deterministic sibling collision. For catechists, it triggers false `403 Forbidden` errors for their own students. For admins, it overrides class names and enqueues unexcused absences against the wrong child in the durable `notifications` table (`SOURCE-CONFIRMED`).

3. **Complete Delivery Failure Blindness (`NOTIF-02`, D2):**  
   When notifications exhaust retries (`attemptCount >= maxAttempts`), rows are permanently marked `status = 'failed'`, but zero error log is emitted, zero telemetry is captured, and Catevia provides **no API endpoint or UI surface** for administrators or staff to inspect notification delivery history or failures (`SOURCE-CONFIRMED`).

4. **Zero Diagnostic Logging in Native Providers (`NOTIF-03`, D2):**  
   `apnsPushProvider.ts` and `fcmPushProvider.ts` contain zero `console.*` statements. Apple HTTP/2 error reasons and Google FCM error detail payloads are entirely discarded, leaving operators with no visibility into credential expiry, quota limits, or delivery rejections (`SOURCE-CONFIRMED`).

5. **Durable PII Persistence in Inactive Column (`NOTIF-04`, D2):**  
   The `notifications.recipient` column stores `context.parentPhone || context.studentName || 'System'` (`notificationQueue.ts:257`). While child notifications are masked to `'Parent'`, any non-child notification carrying student context persists raw PII in SQLite even though the column is never read by recovery, workers, APIs, or UI (`SOURCE-CONFIRMED`).

---

## Findings Summary

| ID | Title | Severity | D-Level | Truth Status | Invariant Touched |
|---|---|---|---|---|---|
| **NOTIF-01** | Sibling Collision in `POST /smart/absence`: Single Phone Lookup via `limit(1)` Triggers False 403 or Attributes Absence to Wrong Child | **High** | **D3** | `VERIFIED_OBSERVED` | Tenancy / Role Scope / Child Identity |
| **NOTIF-02** | Silent Delivery Failure: Retries Exhaust to `status: 'failed'` Without Logs, Telemetry, API Queries, or Admin Visibility | **Medium** | **D2** | `VERIFIED_OBSERVED` | Data Integrity (No Silent Data Loss) |
| **NOTIF-03** | Total Diagnostic Blindness in APNs and FCM Providers: Zero Error Logging and Discarded Provider Rejection Bodies | **Medium** | **D2** | `VERIFIED_OBSERVED` | Observability & Delivery Reliability |
| **NOTIF-04** | Latent PII Persistence: Durable `notifications.recipient` Stores Raw Student Name or Parent Phone for Unused Schema Column | **Low** | **D2** | `VERIFIED_OBSERVED` | Data Minimization |
| **NOTIF-05** | Asymmetric Recipient Revalidation: Non-Academic Channels (`reminder`, `info`) Skip Class, Assignment, and Role Checks at Dispatch | **Medium** | **D2** | `VERIFIED_OBSERVED` | Recipient Authority & Lease Lifecycle |
| **NOTIF-06** | Missing Idempotency & Scheduler Marker Race in Sunday Mass and Class Reminders | **Medium** | **D2** | `VERIFIED_OBSERVED` | Data Integrity (Idempotency) |
| **NOTIF-07** | Aggregate Multi-Endpoint Retry Resends Duplicate Pushes to Healthy Endpoints on Peer Transient Failure | **Low** | **D2** | `VERIFIED_OBSERVED` | Delivery Idempotency / At-Least-Once |
| **NOTIF-08** | Audit Asymmetry & Orphan Web Push Subscriptions on Account Deletion (`ON DELETE SET NULL` vs Cascade) | **Low** | **D2** | `VERIFIED_OBSERVED` | Audit Completeness & Schema Integrity |
| **NOTIF-09** | Disconnected Preflight Script: `auditSundayReminderReadiness.ts` Excluded from CI and Incapable of Detecting Pipeline Defects | **Low** | **D1** | `VERIFIED_OBSERVED` | Verification & CI Tooling |

---

## 1. Scope & Exact Repository State

| Item | Observed State |
|---|---|
| Workspace | `c:\brave-davinci` |
| Branch | `main` |
| HEAD Commit | `568a1160287546d597eb0146a11ab50c720e3c9b` |
| HEAD Subject | `fix(academic): remediate audit-08 findings A8-01..A8-04, lifecycle guards and official reporting` |
| Working Tree | Clean (1 untracked directory `work/`, no dirty tracked files) |
| Test Suite Execution | `vitest run` on 5 targeted test files: **32 passed (100%)** |
| Target Output | `docs/notifications-push-audit-2026-09-21.md` |

### Test Execution Baseline (Current Change State)

Executed command:
```powershell
npx vitest run server/src/__tests__/notifications.test.ts server/src/__tests__/services/notificationQueue.test.ts server/src/__tests__/services/notifyParishNoticeTargeting.test.ts src/lib/__tests__/pushManager.native.test.ts server/src/__tests__/operationsReminderRetryCeiling.test.ts
```
**Result:** 5 test files passed, 32 tests passed (Duration: 20.55s).
- `server/src/__tests__/services/notificationQueue.test.ts`: 14 tests PASS
- `server/src/__tests__/services/notifyParishNoticeTargeting.test.ts`: 2 tests PASS
- `server/src/__tests__/operationsReminderRetryCeiling.test.ts`: 2 tests PASS
- `src/lib/__tests__/pushManager.native.test.ts`: 5 tests PASS
- `server/src/__tests__/notifications.test.ts`: 9 tests PASS

---

## 2. End-to-End Notification Architecture & Delivery Pipeline Map

```text
DOMAIN EVENTS / TRIGGERS
  │
  ├─ Report Cards: POST /notifications/smart/report-cards ──► notifyBatchReportCards()
  ├─ Absence Notice: POST /notifications/smart/absence ─────► notifyAbsence()
  ├─ Sunday Mass: sundayReminderScheduler / POST ──────────► notifySundayMassReminder()
  ├─ Class Reminder: POST /notifications/smart/reminder/class ► notifyClassReminder()
  ├─ Parish Notice: noticeService / official announcements ─► notifyParishNotice()
  └─ Operations: operationsReminderService / task dispatch ──► direct DB INSERT (deterministic ID)
        │
        ▼
RECIPIENT RESOLUTION & ENQUEUE (smartNotifications.ts / notificationQueue.ts)
  │
  ├─ Resolve targets: parent phone mapping -> active user IDs
  ├─ Academic body masking: type in ('report', 'absence') -> ACADEMIC_NOTIFICATION_MESSAGE
  ├─ Parish scope assertion: assertDeploymentParishScope(parishId)
  └─ Durable INSERT into `notifications`:
       id: NOT-xxx, status: 'retrying', maxAttempts: 3, attemptCount: 0, targetUserIds: JSON
        │
        ▼
DURABLE BACKGROUND WORKER & RETRY ENGINE (notificationQueue.ts)
  │
  ├─ Startup / Periodic Poll: recoverQueueFromDb() recovers `retrying` rows (web_push only)
  ├─ Atomic Lease Claim: claimNotification() -> leaseOwner = WORKER_ID, leaseExpiresAt = +5m
  ├─ Pre-Dispatch Revalidation:
  │    ├─ Child Notification: currentChildRecipients() -> checks student & phone match
  │    └─ Non-Child Notification: getCurrentActiveRecipientIds() -> checks user ACTIVE status
  └─ Fan-out Dispatch: sendAppPushToUsers(parishId, userIds, payload)
        │
        ├───────────────────────────────┬───────────────────────────────┐
        ▼                               ▼                               ▼
WEB PUSH (webPushService.ts)    FCM PUSH (fcmPushProvider.ts)   APNS PUSH (apnsPushProvider.ts)
  │                               │                               │
  ├─ join users & push_subs       ├─ OAuth2 bearer token          ├─ HTTP/2 session & JWT
  ├─ webPush.sendNotification()   ├─ Google FCM v1 endpoint       ├─ Apple APNs /3/device/{token}
  └─ deletes 404/410 endpoints    └─ deletes UNREGISTERED tokens  └─ deletes 410/BadDevice tokens
        │                               │                               │
        └───────────────────────────────┴───────────────────────────────┘
                                        │
                                        ▼
OUTCOME RECONCILIATION & RETRY BACKOFF (notificationQueue.ts)
  │
  ├─ All Failed & Removed -> suppressNotification(DELIVERY_TARGET_UNAVAILABLE)
  ├─ Partial Transient Fail -> throw APP_PUSH_PARTIAL_FAILURE -> Exponential backoff (+1s, +2s, +4s...)
  ├─ Attempts >= maxAttempts -> status: 'failed', lease cleared (SILENT)
  └─ All Succeeded -> status: 'sent', sentAt: ISO timestamp
```

---

## 3. Trust-Boundary & Identity Map

| Boundary | Entry Source | Observed Enforcement | Assessment |
|---|---|---|---|
| Route Role Guard | JWT Payload (`c.get('user')`) | `roleMiddleware('admin', 'chunhiem')` on `/smart/*`; `roleMiddleware('admin')` on `/send`, `/subscriptions` | **ENFORCED** (`notifications.ts:19–20, 169, 206`) |
| Catechist Class Scope | Assigned class IDs | `getUserClassIds()` checked against `student.classId` / `targetClassId` | **DRIFT**: `/smart/absence` checks class of wrong student on sibling phone collision (`NOTIF-01`) |
| Parish Tenancy Guard | Enforced Deployment Parish | `assertDeploymentParishScope(parishId)` on `enqueueNotification` and `runSundayReminderForParish` | **ENFORCED** (`notificationQueue.ts:229; sundayReminderScheduler.ts:54`) |
| Queue Recovery Guard | Deployment Parish Config | `deploymentParishId ? eq(parishId, deploymentParishId) : undefined` in recovery query | **ENFORCED** (`notificationQueue.ts:163, 175, 182`) |
| Academic Child Target | Student ID + Parent Phone | `getCurrentChildRecipientIds` validates student parent phone variants match parent account | **ENFORCED** (`notificationQueue.ts:53–65`) |
| Non-Academic Target | Target User IDs | `getCurrentActiveRecipientIds` validates account is active and same parish | **PARTIAL**: Omits role, class, and assignment checks (`NOTIF-05`) |
| Native Hardware Token | Capacitor Device Binding | Globally unique installation & token indices; overwritten on account re-registration | **ENFORCED in DB** (`schema.ts:592–593`); logout unregister is best-effort (`pushManager.ts:430`) |
| Web Push Endpoint | Browser PushManager | Globally unique endpoint; overwritten on re-registration via `onConflictDoUpdate` | **ENFORCED** (`notifications.ts:93–101; schema.ts:558`) |

---

## 4. Persisted Ownership & Database Schema/DDL Drift Matrix

| Table | Declared PK & Unique Indices | Foreign Keys & Actions | Operative DDL Drift | Finding Reference |
|---|---|---|---|---|
| `notifications` | PK `(parish_id, id)`<br>Indices: `idx_notifications_parish_id`, `idx_notifications_lookup`, `idx_notifications_worker` | `(parish_id, student_id) -> students` CASCADE<br>`(parish_id, triggered_by_user_id) -> users` CASCADE | Operative migration `20260812-113:508–509` used `SET NULL` for student/user references; schema declares `CASCADE`. | `AUDIT04` Addendum item 2 |
| `push_subscriptions` | PK `(parish_id, id)`<br>Unique: `endpoint`<br>Indices: `idx_push_subscriptions_parish_id`, `idx_push_subscriptions_user_id` | `(parish_id, user_id) -> users` CASCADE in schema | **CRITICAL DRIFT**: Operative migration `20260812-113:564` uses `ON DELETE SET NULL`. Deleting a user sets `user_id = NULL`, leaving orphan endpoint rows that cannot be unsubscribed by the user. | `NOTIF-08` |
| `native_push_tokens` | PK `(parish_id, id)`<br>Unique: `installation_id`, `(platform, token)`<br>Index: `idx_native_push_tokens_user` | `(parish_id, user_id) -> users` CASCADE | Operative migration `20260902-149:1326` and schema both declare `ON DELETE CASCADE`. Global uniqueness matches schema. | Clean |
| `notices` | PK `(parish_id, id)` | Soft author reference; parish-scoped | Parish-filtered via standard sync queries; completely separate from push infrastructure. | Clean |

---

## 5. Delivery Channel & Recipient Revalidation Matrix

| Notification Channel | Trigger Function | Payload Masking Invariant | Pre-Delivery Recipient Revalidation | Idempotency / Dedupe Protection |
|---|---|---|---|---|
| `absence` | `notifyAbsence` | **MASKED**: Enforces `ACADEMIC_NOTIFICATION_MESSAGE` (`notificationQueue.ts:231`) | **STRICT**: `getCurrentChildRecipientIds` re-validates `student.parentPhone` vs `users.phone`, role `phuhuynh`, and status `ACTIVE` (`notificationQueue.ts:53–65`) | **NONE**: Random `NOT-xxx` ID generated per call. Sibling phone collision vulnerability (`NOTIF-01`). |
| `report_card` | `notifyReportCard` / `notifyBatchReportCards` | **MASKED**: Enforces `ACADEMIC_NOTIFICATION_MESSAGE` (`notificationQueue.ts:231`) | **STRICT**: Validates student exists and current parent phone matches active user (`notificationQueue.ts:53–65`) | **NONE**: Random `NOT-xxx` ID generated per call. |
| `reminder` (Sunday Mass) | `notifySundayMassReminder` | **TEMPLATE**: Plain text with mass time | **WEAK**: `getCurrentActiveRecipientIds` checks only `status == 'ACTIVE'`. Does not recheck `phuhuynh` role. | **PARTIAL**: `sundayReminderScheduler` checks `system_settings` marker, but has check-and-set race (`NOTIF-06`). Route `/smart/reminder/sunday` has NO check. |
| `reminder` (Class) | `notifyClassReminder` | **TEMPLATE**: Exposes `{className}` and `{date}` | **WEAK**: Checks only `status == 'ACTIVE'`. **Does NOT re-verify parent still has a child in that class** (`NOTIF-05`). | **NONE**: Random `NOT-xxx` ID generated per call (`NOTIF-06`). |
| `reminder` (Operations) | `operationsReminderService` / `operations.ts` | **GENERIC**: "Bạn có nhắc việc mới trong Catevia..." | **WEAK**: Checks only `status == 'ACTIVE'`. Relies on generic template to prevent role leak (`operationsReminderService.ts:148`). | **STRICT**: Deterministic IDs (`NOT-${current.id}`, `NOT-OPS-DISPATCH-...`). DB deduplication enforced. |
| `info` (Parish Notice) | `notifyParishNotice` | **TEMPLATE**: Title and content | **WEAK**: Checks only `status == 'ACTIVE'`. Does NOT re-verify parent still has child in `targetBranch` (`NOTIF-05`). | **NONE**: Enqueued per broadcast. |
| `alert` / Broadcast | `POST /notifications/send` | **CUSTOM**: Admin input | **BYPASSES QUEUE**: Calls `sendAppPushToParish` directly. Filters `users.status == 'ACTIVE'` in join. | **NONE**: Synchronous broadcast per request. |

---

## 6. Data Minimization & PII Flow Analysis

| Pipeline Stage | Data Touched | Minimization Status | Citation |
|---|---|---|---|
| Academic Push Body | Student scores, rank, absence status | **MINIMIZED**: Hardcoded to `ACADEMIC_NOTIFICATION_MESSAGE` ("Có cập nhật học vụ trong ứng dụng Catevia. Vui lòng đăng nhập để xem.") | `notificationQueue.ts:28, 231, 362` |
| Queue Column: `recipient` | Student names, parent phone numbers | **VIOLATION**: Latent PII sink `context.parentPhone \|\| context.studentName \|\| 'System'`. Child notifications masked to `'Parent'`, but non-child types persist raw PII. Column is completely unused by system. | `notificationQueue.ts:257; schema.ts:441` (`NOTIF-04`) |
| Queue Column: `studentId` | Internal UUID | **TECHNICAL ID**: Nullable technical identifier used for child recipient revalidation. | `notificationQueue.ts:258; schema.ts:435` |
| Enqueue Failure Log | Student identity | **MINIMIZED**: `studentId` + `errorType` only (former `TENANT-P2-001` confirmed fixed). | `smartNotifications.ts:188–192` |
| Route Warning Log | Internal student UUID | **TECHNICAL ID**: `className mismatch for student ${student.id}`. Below PII finding threshold. | `notifications.ts:238` |
| Native Provider Logs | Device tokens, auth keys | **NO LEAK**: APNs and FCM providers emit zero logs. No token logging anywhere. | `apnsPushProvider.ts; fcmPushProvider.ts` |
| Client Storage (Native) | Native Push Token | **NEVER STORED**: Token received via Capacitor listener is sent directly to API and never saved in localStorage or Dexie. | `pushManager.ts:203–207` |
| Client Storage (Installation) | Installation UUID | **NON-PII**: Random UUID stored in localStorage under `catevia_native_installation_id`. | `pushManager.ts:173–184` |
| Client Offline Sync | Dexie `stores` & `syncQueue` | **SEPARATED**: `push_subscriptions` and `native_push_tokens` are never pulled or mirrored to client IndexedDB. | `src/lib/db.ts:57–66` |

---

## 7. Delivery Reliability, Idempotency & Retry Ceiling Analysis

### 1. The Retry Ceiling Mechanism

In `server/src/services/notificationQueue.ts`:
- Items are created with default `maxAttempts = 3` (`line 240, 264`).
- `claimNotification()` atomically leases the row using `attemptCount: sql\`${notifications.attemptCount} + 1\`` where `attemptCount < maxAttempts` (`lines 308, 314`).
- If provider delivery experiences a retryable error, `drainQueue` enters `catch (err)`:
  - If `item.retryCount < item.maxRetries`: calculates exponential backoff (`INITIAL_BACKOFF_MS * 2^(retryCount-1)`, lines 445–446) and updates `nextAttemptAt`.
  - If `item.retryCount >= item.maxRetries`: executes:
    ```typescript
    await db.update(notifications).set({
      status: 'failed',
      error: item.lastError,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    }).where(and(eq(notifications.id, item.id), eq(notifications.parishId, item.parishId), eq(notifications.leaseOwner, WORKER_ID)))
    rememberFailed(item)
    queue.shift()
    ```
  - During startup/periodic recovery, `recoverQueueFromDb()` terminalizes any abandoned rows matching `attemptCount >= maxAttempts` with `error = 'NOTIFICATION_ATTEMPTS_EXHAUSTED'` (`lines 165–176`).

### 2. Silent Failure vs. Operations Domain Contrast

The project already possesses an established pattern for retry ceiling governance in the Operations domain (`server/src/services/operationsReminderService.ts` and `server/src/__tests__/operationsReminderRetryCeiling.test.ts`).

| Dimension | Operations Reminders (`operationsReminderService.ts`) | Shared Push Queue (`notificationQueue.ts`) | Evaluation |
|---|---|---|---|
| Retry Limit | 25 attempts (`MAX_REMINDER_ENQUEUE_ATTEMPTS`) | 3 attempts (`MAX_RETRIES`) | Push queue gives up much faster (appropriate for transient push), but has no escalation. |
| Terminal State | `status = 'FAILED'`, `error = 'REMINDER_ENQUEUE_FAILED'` | `status = 'failed'`, `error = item.lastError` | Both mark the database row. |
| Admin / Staff API | `GET /operations/reminders` (filters by event/task, returns status, error, attempts) | **NO API ROUTE** (`notificationsRouter` has no query route) | **CRITICAL GAP**: Staff cannot query notification delivery status. |
| Operational Surfacing | Visible in Operations Page UI; error audit captured | `rememberFailed()` in-memory array (max 100, read only by unit tests) | **CRITICAL GAP**: Terminal failure is completely swallowed silently. |
| Error Logging | Logs tick error and warning on attempt | Zero `console.error` when terminal ceiling is reached | **CRITICAL GAP**: Admins monitoring logs will never know deliveries failed. |

---

## 8. Verified Baseline & Already-Remediated Findings

### 1. `TENANT-P2-001` — Confirmed Fixed
- **Original Vulnerability:** In `AUDIT04_TENANT_PRIVACY_REPORT.md` (2026-09-17), `smartNotifications.ts` logged student name and class name into `console.error` during batch report card enqueue failure.
- **Observed Source:** `server/src/services/smartNotifications.ts:187–192`
  ```typescript
  } catch (err) {
    console.error('[smartNotifications] failed to enqueue report card', {
      studentId: s.studentId || 'unknown',
      errorType: err instanceof Error ? err.name : typeof err,
    })
  }
  ```
- **Current Truth:** `VERIFIED_OBSERVED`. The fix from commit `e62ecbe` remains intact. Only `studentId` and `errorType` are emitted. No PII is logged.

### 2. ADR-111 (Telegram Decommissioning) — Confirmed Complete
- **Decision:** ADR-111 (2026-09-08) retired Telegram as a delivery channel.
- **Observed Source:**
  - `server/src/services/notificationQueue.ts:127–145`: `retireLegacyTelegramChannelData()` consumes all open link tokens, sets `status = 'REVOKED'`, `notificationsEnabled = 0`, and terminalizes all `type = 'telegram'` rows to `status = 'failed'`, `error = 'CHANNEL_RETIRED'`.
  - `server/src/services/notificationQueue.ts:154–183`: `recoverQueueFromDb()` explicitly filters out Telegram work and only recovers `type = 'web_push'`.
  - `server/src/routes/parents.ts:18–30`: All 4 former Telegram endpoints (`/telegram/link-token`, `/telegram/status`, `/telegram/notifications`, `/telegram/link`) return HTTP `410 CHANNEL_RETIRED`.
  - `server/src/__tests__/services/notificationQueue.test.ts`: Passes 14 comprehensive tests verifying Telegram retirement and queue isolation.
- **Current Truth:** `VERIFIED_OBSERVED`. There is no execution path allowing stale Telegram rows or tokens to resume delivery.

---

## 9. Findings — P0 → P3

---

### NOTIF-01 — Sibling Collision in `POST /smart/absence`: Single Phone Lookup via `limit(1)` Triggers False 403 or Attributes Absence to Wrong Child

**Severity:** High  
**D-Classification:** **D3** (Protected Invariant: Role/Class Scope Authority, Tenancy, and Child Identity Integrity)  
**Truth Status:** `VERIFIED_OBSERVED` (Source confirmed in `server/src/routes/notifications.ts:223–252`)  
**Data Affected:** Student absence records, academic attendance history, parent notification delivery.  
**Parish Source:** Authenticated catechist or admin parish (`user.parishId`).  

#### Reachable Chain
1. Multiple siblings attend Catholic education classes in the same parish (e.g. Child A in Class 1 and Child B in Class 4) and share the same `parentPhone`.
2. A catechist managing Class 4 submits an absence report for Child B via `POST /notifications/smart/absence`. The payload conforms to `absenceSchema`, supplying Child B's details and `parentPhone`.
3. `server/src/routes/notifications.ts:223` executes:
   ```typescript
   const [student] = await db.select().from(students).where(and(
     eq(students.parentPhone, body.parentPhone),
     eq(students.parishId, user.parishId),
     isNull(students.deletedAt)
   )).limit(1)
   ```
4. SQLite returns whichever student record was inserted first (Child A).
5. Authorization check at line 229:
   ```typescript
   const isAuthorized = await checkUserClassAccess(user.userId, user.parishId, student.classId)
   if (!isAuthorized) {
     return errorResponse(c, 'FORBIDDEN', 'Forbidden — bạn không được phân công quản lý lớp của thiếu nhi này', 403)
   }
   ```
   Because the catechist manages Class 4 (Child B) but `student` resolved to Class 1 (Child A), the system returns `403 FORBIDDEN`. The catechist is completely blocked from sending the absence notice for their own student!
6. **The Admin Subversion Case:** If an administrator submits the request (bypassing `checkUserClassAccess`):
   - Line 238 logs: `[notifications] className mismatch for student ${student.id}: provided="${body.className}" actual="${cls.name}", using actual`.
   - Line 241 calls `notifyAbsence(..., student.fullName, student.holyName, effectiveClassName, ..., student.id)`.
   - The system enqueues the notification using **Child A's studentId, holyName, fullName, and Class 1**, instead of Child B!
   - In `notifications` table, `student_id` is permanently stored as Child A (`notificationQueue.ts:258`).

#### Evidence
- Route definition: `server/src/routes/notifications.ts:223–252`
- Schema lacking `studentId`: `server/src/routes/notifications.ts:50–59`
- Prior audit note identifying open gap: `docs/authentication-authorization-rbac-audit-2026-09-05.md:515` ("`/smart/absence` vẫn resolve học sinh từ phone theo contract cũ, chưa thay bằng required studentId public API; ambiguity của shared phone cần vòng riêng.")

#### Normative Truth & Invariant Violated
- `.agents/protected-invariants.md:12`: "Role/class/resource scope must remain server-authoritative."
- `.agents/protected-invariants.md:18`: "No silent data loss."
- Sibling phone sharing is a standard real-world reality in Vietnamese parishes. A telephone number is not an entity primary key.

#### Consequence
Catechists face denial-of-service when recording absences for students with older siblings. Administrators unknowingly corrupt absence tracking by assigning unexcused absences to innocent siblings in other classes.

---

### NOTIF-02 — Silent Delivery Failure: Retries Exhaust to `status: 'failed'` Without Logs, Telemetry, API Queries, or Admin Visibility

**Severity:** Medium  
**D-Classification:** **D2** (Protected Invariant: Data Integrity — "No silent data loss")  
**Truth Status:** `VERIFIED_OBSERVED` (Source confirmed in `server/src/services/notificationQueue.ts:433–444` and `server/src/routes/notifications.ts`)  
**Data Affected:** Report cards, absence alerts, Sunday reminders, parish announcements.  
**Parish Source:** Background delivery worker.  

#### Reachable Chain
1. A notification is enqueued (e.g. urgent absence or report card).
2. The external push providers fail (e.g., Apple APNs 500, FCM network timeout, or VAPID error).
3. The queue retries 3 times (`MAX_RETRIES = 3`).
4. On the 3rd failure (`item.retryCount >= item.maxRetries`), `notificationQueue.ts:434–442` sets `status: 'failed'` in the database and calls `rememberFailed(item)` (storing in an ephemeral in-memory ring buffer of 100 items).
5. **No error log is emitted**: line 402 logs a `console.warn` on intermediate partial attempts, but lines 434–444 emit no `console.error` when the item permanently dies.
6. **No query API exists**: `server/src/routes/notifications.ts` registers only:
   `POST /subscribe`, `POST /native/register`, `POST /native/unregister`, `POST /unsubscribe`, `POST /send`, `GET /vapid-public-key`, `GET /subscriptions`, and 4 `/smart/*` POST routes.
   There is **no GET route** for notifications.
7. **No UI exists**: No staff or admin screen in Catevia queries or displays notification delivery status or queue failures.

#### Evidence
- Exhaustion logic: `server/src/services/notificationQueue.ts:433–444`
- Startup terminalization: `server/src/services/notificationQueue.ts:165–176`
- Memory buffer ignored in production: `server/src/services/notificationQueue.ts:322–325, 294–296`
- Route inspection: `server/src/routes/notifications.ts:1–342`
- Contrast with Operations reminders: `server/src/routes/operations.ts:1824–1840` (`GET /operations/reminders`) and `server/src/__tests__/operationsReminderRetryCeiling.test.ts:79–92`.

#### Normative Truth & Invariant Violated
- `.agents/protected-invariants.md:18`: "No silent data loss." A critical educational alert that permanently ceases delivery without human notification constitutes silent failure.

#### Consequence
Staff believe parents were notified of absences or failing report cards, while the notices permanently stalled in SQLite with zero operational alert.

---

### NOTIF-03 — Total Diagnostic Blindness in APNs and FCM Providers: Zero Error Logging and Discarded Provider Rejection Bodies

**Severity:** Medium  
**D-Classification:** **D2** (Observability & Operational Safety)  
**Truth Status:** `VERIFIED_OBSERVED` (Source confirmed in `server/src/services/apnsPushProvider.ts` and `server/src/services/fcmPushProvider.ts`)  
**Data Affected:** Provider error codes, HTTP status codes, rejection diagnostic details.  

#### Reachable Chain
1. In `server/src/services/apnsPushProvider.ts:68–100`, Apple's HTTP/2 response stream receives status code `status` and `responseBody`.
2. Lines 91–96 parse `reason` exclusively to test:
   `dead: status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic'`.
3. If Apple rejects with HTTP 400 (`BadPriority`, `BadPayloadSize`), HTTP 403 (`ExpiredProviderToken`, `InvalidProviderToken`, `BadTopic`), or HTTP 429 (`TooManyRequests`), `sendOne` resolves `{ ok: false, dead: false }`.
4. **The Apple error reason and status code are discarded.** They are never logged (`apnsPushProvider.ts` contains 0 `console.*` calls).
5. In `server/src/services/fcmPushProvider.ts:80–112`, Google's response is checked for `response.ok`. If false, `errorBody` is parsed exclusively for `errorCode === 'UNREGISTERED'`.
6. If Google rejects with HTTP 401 (`UNAUTHENTICATED`), HTTP 403 (`PERMISSION_DENIED`), HTTP 400 (`INVALID_ARGUMENT`), or `QUOTA_EXCEEDED`, `sendOne` resolves `{ ok: false, dead: false }`.
7. **The Google error payload is discarded.** `fcmPushProvider.ts` contains 0 `console.*` calls.
8. In `nativePushService.ts:33`, unexpected exceptions log only the generic `error.message`.
9. In `notificationQueue.ts:408, 432`, the queue records only:
   `error: "Error: APP_PUSH_PARTIAL_FAILURE:1"`.

#### Evidence
- Search verification: Grep for `console.` in `server/src/services/apnsPushProvider.ts` returned 0 matches.
- Search verification: Grep for `console.` in `server/src/services/fcmPushProvider.ts` returned 0 matches.
- APNs discard: `server/src/services/apnsPushProvider.ts:91–96`
- FCM discard: `server/src/services/fcmPushProvider.ts:106–112`
- Queue error abstraction: `server/src/services/notificationQueue.ts:408`

#### Consequence
In production, if push credentials expire, certificates rotate, or service accounts lose permissions, the entire mobile push fleet will fail, and logs will show only `"Error: APP_PUSH_PARTIAL_FAILURE:N"` with zero indication of whether Apple or Google rejected the request, or why.

---

### NOTIF-04 — Latent PII Persistence: Durable `notifications.recipient` Stores Raw Student Name or Parent Phone for Unused Schema Column

**Severity:** Low  
**D-Classification:** **D2** (Protected Invariant: Security & Tenancy — "Sensitive student, parent, and personnel data must be minimized")  
**Truth Status:** `VERIFIED_OBSERVED` (Source confirmed in `server/src/services/notificationQueue.ts:257`)  
**Data Affected:** Parent telephone numbers and student names.  
**Parish Source:** Internal enqueue template context.  

#### Reachable Chain
1. When inserting a notification into SQLite, `notificationQueue.ts:257` writes:
   ```typescript
   recipient: isChildNotification(item) ? 'Parent' : context.parentPhone || context.studentName || 'System',
   ```
2. For child notifications (`report`, `absence`), `isChildNotification` returns `true`, masking the column to `'Parent'`.
3. However, for any non-child notification type (`reminder`, `info`, `alert`): if the caller supplies `context.parentPhone` or `context.studentName`, that string is persisted directly into the durable `notifications.recipient` column.
4. Detailed repository tracing established:
   - **(a) UI surfaces:** ZERO UI surfaces or endpoints read back `notifications.recipient` (`src/lib/api/notifications.ts` has only `sendReportCards`).
   - **(b) RBAC gates:** No RBAC gates exist because no endpoint returns the column.
   - **(c) Functional necessity:** Recovery (`notificationQueue.ts:186–205`) does not read `row.recipient`. Workers route push notifications strictly via `targetUserIds` and the `users` table. The column is completely obsolete and exists only to satisfy the `NOT NULL` constraint in `schema.ts:441`.
   - **(d) StudentName reachability:** In `server/src/__tests__/services/notificationQueue.test.ts:72`, `enqueueNotification('webpush', 'info', 'Tin {studentName}', { studentName: 'A' }, ...)` writes `recipient: 'A'`. Any future or third-party feature enqueuing non-child templates with student context creates cleartext student PII in database storage.

#### Evidence
- Column assignment: `server/src/services/notificationQueue.ts:257`
- Schema declaration: `server/src/db/schema.ts:441` (`recipient: text('recipient').notNull()`)
- Test evidence demonstrating raw name persistence: `server/src/__tests__/services/notificationQueue.test.ts:72, 78`
- Omission from recovery model: `server/src/services/notificationQueue.ts:186–205`

#### Consequence
Unnecessary persistence of PII in a database table that is never read for that information, increasing data blast radius in database backups and snapshots.

---

### NOTIF-05 — Asymmetric Recipient Revalidation: Non-Academic Channels (`reminder`, `info`) Skip Class, Assignment, and Role Checks at Dispatch

**Severity:** Medium  
**D-Classification:** **D2** (Protected Invariant: Tenancy & Recipient Authority)  
**Truth Status:** `VERIFIED_OBSERVED` (Source confirmed in `server/src/services/notificationQueue.ts:360–380`)  
**Data Affected:** Class reminders disclosing class names and schedules; operations task dispatch notices.  

#### Reachable Chain
1. In `notificationQueue.ts:361–380`, pre-dispatch revalidation splits on `isChildNotification(item)`:
   - Child notifications call `currentChildRecipients()`, which queries `students` to confirm the student still exists, and matches the parent's current phone and `phuhuynh` role.
   - Non-child notifications (`reminder`, `info`, `alert`) call `getCurrentActiveRecipientIds()`.
2. `getCurrentActiveRecipientIds()` (`lines 40–50`) executes:
   ```typescript
   const rows = await db.select({ id: users.id }).from(users).where(and(
     eq(users.parishId, parishId),
     inArray(users.id, [...new Set(originalIds)]),
     eq(users.status, 'ACTIVE'),
     isNull(users.deletedAt),
   ))
   ```
3. It validates ONLY that the user is `ACTIVE` in `parishId`.
4. **Class Reminders:** `notifyClassReminder()` uses template `'📚 Nhắc nhở: Lớp Giáo Lý hôm nay ({date}) - {className}. Các em đi học đúng giờ!'` (`templateEngine.ts:63`). If a student changes classes or graduates between enqueue and retry/dispatch, the queue does not re-verify class enrollment. The parent receives an alert for a class their child is no longer in.
5. **Role Demotion:** If a staff member or catechist is demoted to a standard user or unassigned from an Operations task, `getCurrentActiveRecipientIds()` still treats them as an eligible recipient as long as `users.status == 'ACTIVE'`.

#### Evidence
- Code branch: `server/src/services/notificationQueue.ts:372–380`
- Validator implementation: `server/src/services/notificationQueue.ts:40–50`
- Class reminder template: `server/src/services/templateEngine.ts:63`

#### Consequence
Time-delayed or retrying notifications can deliver class schedules and operational notices to users whose authorization or enrollment changed after the initial trigger.

---

### NOTIF-06 — Missing Idempotency & Scheduler Marker Race in Sunday Mass and Class Reminders

**Severity:** Medium  
**D-Classification:** **D2** (Protected Invariant: Data Integrity — "Preserve applicable idempotency")  
**Truth Status:** `VERIFIED_OBSERVED` (Source confirmed in `server/src/services/sundayReminderScheduler.ts:61–80` and `server/src/routes/notifications.ts:301–339`)  
**Data Affected:** Parish-wide and class-wide push notification volume.  

#### Reachable Chain
1. In `sundayReminderScheduler.ts:66–79`:
   ```typescript
   const enqueued = await notifySundayMassReminder(parishId)
   if (!enqueued) return 0

   const nowIso = new Date().toISOString()
   await db.insert(systemSettings).values({
     key: MARKER_KEY,
     value: today,
     ...
   }).onConflictDoUpdate(...)
   ```
   The reminder is enqueued into the database and memory queue **before** the completion marker `sunday_reminder_last_sent` is persisted. If the node process restarts or encounters an unhandled rejection between lines 66 and 71, the marker is never written. On the next tick (60 seconds later), the scheduler re-triggers and sends a duplicate mass reminder to all parents.
2. `POST /smart/reminder/sunday` (`notifications.ts:301–305`) directly invokes `notifySundayMassReminder(user.parishId)` without checking or writing the `MARKER_KEY`. Multiple administrator clicks or frontend HTTP retries generate duplicate parish-wide broadcasts.
3. `POST /smart/reminder/class` (`notifications.ts:307–339`) enqueues with random `generateId('NOT')` without deduplicating by `(parishId, classId, date)`. Network retries trigger duplicate notifications.

#### Evidence
- Out-of-transaction marker write: `server/src/services/sundayReminderScheduler.ts:66–79`
- Unguarded HTTP route: `server/src/routes/notifications.ts:301–305`
- Class reminder enqueue: `server/src/routes/notifications.ts:337`

#### Consequence
Duplicate push notification bursts sent to entire parishes or classes upon network retries or server restarts during Sunday dispatch windows.

---

### NOTIF-07 — Aggregate Multi-Endpoint Retry Resends Duplicate Pushes to Healthy Endpoints on Peer Transient Failure

**Severity:** Low  
**D-Classification:** **D2** (Delivery Idempotency / At-Least-Once Boundary)  
**Truth Status:** `VERIFIED_OBSERVED` (Source confirmed in `server/src/services/notificationQueue.ts:400–409`; documented in `docs/ADR_ARCHITECTURE_DECISION_RECORDS.md:3832`)  
**Data Affected:** Repeated push alerts delivered to end-user devices.  

#### Reachable Chain
1. A parent has two registered delivery endpoints: Web Push (desktop browser) and FCM (Android phone).
2. The queue processes a notification. Web Push delivery succeeds (`web.sent = 1`).
3. Google FCM returns an HTTP 503 Service Unavailable or network timeout (`native.failed = 1`).
4. Line 400 calculates: `retryableFailed = Math.max(0, result.failed - result.removed) = 1`.
5. Line 408 throws `Error("APP_PUSH_PARTIAL_FAILURE:1")`.
6. The queue enters exponential retry backoff.
7. On Attempt 2, `sendAppPushToUsers` is invoked again for all endpoints of that user.
8. Web Push sends the notification a second time. If FCM fails again, Attempt 3 sends a third duplicate.

#### Evidence
- Aggregate retry check: `server/src/services/notificationQueue.ts:400–409`
- Architectural concession in ADR-111: `docs/ADR_ARCHITECTURE_DECISION_RECORDS.md:3832` ("Reliability remains at-least-once after provider acceptance. A transient aggregate partial failure or crash after provider acceptance may still duplicate delivery to an endpoint already reached; provider-level exactly-once is not claimed and would require a per-endpoint delivery ledger.")

#### Consequence
Users with multiple devices experience duplicate push notifications whenever one of their devices or platforms experiences a transient failure.

---

### NOTIF-08 — Audit Asymmetry & Orphan Web Push Subscriptions on Account Deletion (`ON DELETE SET NULL` vs Cascade)

**Severity:** Low  
**D-Classification:** **D2** (Audit Completeness & Database Constraint Integrity)  
**Truth Status:** `VERIFIED_OBSERVED` (Source confirmed in `server/src/routes/notifications.ts:83–103, 162–167` and `server/src/db/migrations.ts:564`)  
**Data Affected:** Audit logs, orphan rows in `push_subscriptions`.  

#### Reachable Chain
1. **Audit Asymmetry:** Native push registration and unregistration write structured records to `audit_logs` (`NATIVE_PUSH_REGISTER`, `NATIVE_PUSH_UNREGISTER`, `notifications.ts:124–134, 148–157`). Web Push `/subscribe` and `/unsubscribe` write zero audit logs (`notifications.ts:83–103, 162–167`).
2. **Orphan Row Generation on User Delete:** Operative migration `20260812-113:564` specifies:
   `FOREIGN KEY ("parish_id","user_id") REFERENCES "users"("parish_id","id") ON UPDATE no action ON DELETE set null`
   This conflicts with `schema.ts:569` which declares `onDelete('cascade')`.
3. When a user account is deleted, foreign key execution sets `push_subscriptions.user_id = NULL`.
4. The subscription endpoint remains in SQLite. If a user subsequently attempts to call `POST /unsubscribe`, line 165 executes:
   `db.delete(pushSubscriptions).where(and(eq(endpoint, endpoint), eq(parishId, user.parishId), eq(userId, user.userId)))`.
   Because `user_id` in the database is `NULL`, `eq(userId, user.userId)` evaluates to false. The orphan row can never be removed via the user unsubscription API.

#### Evidence
- DDL drift: `server/src/db/migrations.ts:564` vs `server/src/db/schema.ts:569`
- Unsubscribe route failure on null user: `server/src/routes/notifications.ts:165`

#### Consequence
Database accumulates orphan Web Push subscription endpoints that cannot be cleaned up via unsubscription requests.

---

### NOTIF-09 — Disconnected Preflight Script: `auditSundayReminderReadiness.ts` Excluded from CI and Incapable of Detecting Pipeline Defects

**Severity:** Low  
**D-Classification:** **D1** (Verification & Tooling Governance)  
**Truth Status:** `VERIFIED_OBSERVED` (Source confirmed in `server/src/scripts/auditSundayReminderReadiness.ts`, `package.json:41`, and `.github/workflows/ci.yml`)  
**Data Affected:** Diagnostic readiness metrics.  

#### Reachable Chain
1. `server/src/scripts/auditSundayReminderReadiness.ts` exists (89 lines).
2. It is referenced in `package.json:41` (`"audit:sunday-readiness"`) and `server/package.json:23` (`"notifications:audit:sunday-readiness"`).
3. It is **completely omitted from `.github/workflows/ci.yml`** and root `verify:ci`.
4. Analysis of its 89 lines reveals what it actually executes:
   - Reads `system_settings` for `sundayReminderEnabled`.
   - Counts parents with `status != 'INACTIVE'`.
   - Counts distinct `push_subscriptions` and `native_push_tokens` joined to active parents.
   - Outputs a JSON summary.
5. **Defect Coverage Analysis:** If wired into CI, it would **not catch any of the findings identified in this audit**:
   - Cannot catch `NOTIF-01` (sibling collision in `/smart/absence` route).
   - Cannot catch `NOTIF-02` (silent retry exhaustion).
   - Cannot catch `NOTIF-03` (zero logging in APNs/FCM providers).
   - Cannot catch `NOTIF-04` (PII in `recipient` column).
   - Cannot catch `NOTIF-05` (non-academic revalidation gaps).
   - Cannot catch `NOTIF-06` (marker race condition).

#### Evidence
- Script contents: `server/src/scripts/auditSundayReminderReadiness.ts:1–89`
- Package script binding: `package.json:41`
- CI workflow inspection: `.github/workflows/ci.yml:1–147` (no mention of `sunday-readiness`)

#### Consequence
Wiring `auditSundayReminderReadiness.ts` into CI would add execution time without providing automated protection against any delivery, safety, or privacy defects. Automated regression tests (like `notificationQueue.test.ts`) are the proper enforcement layer.

---

## 10. Demonstrated Strengths

1. **Mandatory Academic Body Masking:** Academic notifications (`absence`, `report`) strictly replace templated bodies with `ACADEMIC_NOTIFICATION_MESSAGE` before provider dispatch (`notificationQueue.ts:231, 362`).
2. **Complete Native Push Token Hygiene:** Device push tokens from APNs and FCM are never logged to console, never written to client storage (localStorage, Dexie), and are never pulled by sync (`pushManager.ts:203–207; schema.ts:577`).
3. **Robust Telegram Channel Retirement:** ADR-111 retirement is enforced through fail-closed startup transactions, recovery filtering, and HTTP 410 tombstones (`notificationQueue.ts:109, 127–145, 161–164; parents.ts:25–30`).
4. **Dead Subscription Auto-Pruning:** Web Push automatically deletes subscriptions on HTTP 404/410 (`webPushService.ts:95–102`), APNs on HTTP 410 / `Unregistered` (`apnsPushProvider.ts:95, 122`), and FCM on `UNREGISTERED` (`fcmPushProvider.ts:111, 124`).
5. **Durable Lease-Based Worker Concurrency:** Notifications use atomic SQLite update leases with PID/UUID worker IDs and 5-minute lease expirations, preventing split-brain double claims in multi-process deployments (`notificationQueue.ts:298–320`).
6. **Parish Isolation on Notification Recovery:** Worker recovery explicitly enforces deployment parish boundaries (`notificationQueue.ts:163, 175, 182`).
7. **Strict Student-Parent Ownership Checks:** Academic notifications verify that the target user phone still matches the student's current parent phone before dispatch (`notificationQueue.ts:53–65`).
8. **Operations Domain Idempotency Integration:** Operations reminder dispatch generates deterministic notification IDs (`NOT-${reminder.id}`, `NOT-OPS-DISPATCH-...`), preventing duplicate rows on retries (`operations.ts:340; operationsReminderService.ts:135`).

---

## 11. Evidence Conflicts & Unknowns

1. **Production Apple / Google Account Credentials:** APNs keys and Firebase service accounts were evaluated from static configuration handlers (`getApnsConfig()`, `serviceAccount()`); actual production provider credentials and quotas were not inspected.
2. **Multi-Parish Physical Deployment Reality:** The codebase enforces single-parish deployment boundaries (`getEnforcedDeploymentParishId()`), but multi-parish development fixture modes exist.
3. **OS-Level Notification Center Privacy:** Native push notifications delivered to iOS / Android lock screens rely on OS privacy settings; lock-screen content exposure when devices are unlocked was not inspected.
4. **Sentry Error Scrubbing Coverage:** Sentry is configured with `sendDefaultPii: false` in `server/src/utils/observability.ts`, but unhandled provider rejections could theoretically contain URL query strings if routes were improperly formatted.

---

## 12. Coverage / Blind Spots

| Area | Coverage Status | Evidence / Notes |
|---|---|---|
| Server Notification Routes (`notifications.ts`) | **AUDITED** | All 342 lines inspected; absence sibling collision and route gaps identified |
| Durable Queue Engine (`notificationQueue.ts`) | **AUDITED** | All 484 lines inspected; lease, recovery, and retry ceiling verified |
| Smart Notification Service (`smartNotifications.ts`) | **AUDITED** | All 309 lines inspected; dead template and enqueue helpers verified |
| APNs & FCM Providers (`apnsPushProvider.ts`, `fcmPushProvider.ts`) | **AUDITED** | Both files inspected line-by-line; zero logging and error discard confirmed |
| Web & Native Services (`webPushService.ts`, `nativePushService.ts`, `appPushService.ts`) | **AUDITED** | Fan-out and dead token pruning verified |
| Sunday Scheduler & Readiness Script | **AUDITED** | Scheduler marker race and script disconnection verified |
| Client Push Manager (`pushManager.ts`, `NativePushSettings.tsx`) | **AUDITED** | Token hygiene and subscription lifecycle verified |
| Database Schemas & Migrations | **AUDITED** | Schema constraints and DDL drift (`push_subscriptions` FK action) verified |
| Physical iOS / Android Device Test | **NOT_AUDITED** | Hardware APNs / FCM push delivery to physical mobile hardware requires physical device test bench |
| Production Push Provider Network Traffic | **NOT_AUDITED** | Live HTTP/2 APNs connection and FCM v1 API traffic require production deployment |

---

## 13. Handoffs

These are evidence-based handoffs to subsequent or adjacent domain audits:

| Domain | Receiving Audit | Evidence Handed Off |
|---|---|---|
| **Academic Absence** | Audit #08 / #15 (Academics / Parents) | `NOTIF-01`: `POST /smart/absence` sibling collision. Handed off to academic domain to update route contract to require `studentId` explicitly. |
| **Database & Migrations** | Audit #05 (Database & Schemas) | `NOTIF-08`: Operative migration `20260812-113:564` (`ON DELETE SET NULL`) vs schema declaration (`ON DELETE CASCADE`) on `push_subscriptions`. |
| **Observability & Ops** | Audit #22 (Observability) | `NOTIF-02` & `NOTIF-03`: Zero provider error logging and silent failure ceiling in `notificationQueue.ts`. |
| **Operations Reminders** | Audit #12 (Operations) | Operations deterministic reminder enqueue pattern confirmed solid; no remediation needed in Operations itself. |

---

```text
AUDIT COMPLETE — READ ONLY
Audit ID: NOTIF-2026-09-21
Findings Count: 9
  - High (D3): 1 (NOTIF-01)
  - Medium (D2): 4 (NOTIF-02, NOTIF-03, NOTIF-05, NOTIF-06)
  - Low (D1/D2): 4 (NOTIF-04, NOTIF-07, NOTIF-08, NOTIF-09)
Verified Baseline: TENANT-P2-001 (FIXED), ADR-111 (VERIFIED_OBSERVED)
```
