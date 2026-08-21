# ADR-051: Critical Data-Integrity Hardening — Fail-Closed Bootstrap & Atomic Commands

> Status: **APPROVED / IMPLEMENTED**  
> Date: 2026-08-21  
> Severity: **D3 — Critical**  
> Profile: **ARCHITECTURE / INFRASTRUCTURE + DATA INTEGRITY + AUTH**

## Context

Architecture audit 2026-08-21 found several independently reproducible D3 failure windows. The first remediation pass fixed Finance command atomicity and added an executable-schema readiness gate. A follow-up audit of the resulting branch identified the remaining root causes in migration execution, initial bootstrap, and account lifecycle writes.

### Finding A — migration execution could fail open

`server/src/db/index.ts` historically logged a non-tolerable migration failure and continued initialization. The first remediation added `assertDatabaseReady(client)` before HTTP bind, which prevented an unsafe schema from serving traffic, but the migration executor itself still had the fail-open branch.

**Classification:** `CONFIRMED`, confidence `HIGH`, evidence `E3`.

### Finding B — Finance commands had split transaction boundaries

The previous Finance implementation could commit a ledger transaction before the matching fee record/audit write. Deletion likewise separated ledger deletion, fee reset, and audit insertion.

**Classification:** `CONFIRMED`, confidence `HIGH`, evidence `E3`.

### Finding C — initial seed could partially commit and startup could continue

`seed()` previously inserted branches, academic years, classes, the initial admin, settings and permissions as independent statements. If a later write failed after the admin row committed, `seedIfEmpty()` could see an existing user on the next boot and skip the remainder forever. `server/src/index.ts` also logged seed failure and continued to `serve()`.

**Classification:** `CONFIRMED`, confidence `HIGH`, evidence `E3`.

### Finding D — fresh bootstrap had a known default privileged password

`seed.ts` used `process.env.SEED_ADMIN_PASSWORD || 'admin123'`. A fresh installation without the environment variable therefore received a predictable admin credential. This also contradicted deployment documentation that described the value as generated.

**Classification:** `CONFIRMED`, confidence `HIGH`, evidence `E3`.

### Finding E — account lifecycle state and session/audit state could diverge

User creation inserted the account before class assignments and audit. Lock/reset/force-logout updated the user independently from refresh-session revocation and audit. A later failure could therefore leave a login-capable orphan account, an unaudited security transition, or stale refresh-session rows.

**Classification:** `CONFIRMED`, confidence `HIGH`, evidence `E3`.

## Existing constraints

- ADR-011 requires Application Services / command boundaries to own transactions.
- Tenant-local identifiers and composite keys must remain parish-scoped.
- Public HTTP contracts must remain backward compatible.
- No database schema migration is introduced by this remediation.
- Integrity intentionally wins over availability at startup and during security-sensitive state transitions.

## Decision

### 1. Make migration execution itself fail closed

Move migration execution policy to `server/src/db/migrationRunner.ts` and invoke `applyMigrations(client, MIGRATIONS)` from the production DB bootstrap.

Rules:

1. an unapplied migration executes in manifest order;
2. a successful migration records its marker;
3. the existing historical recovery path is retained only for duplicate-column / already-exists errors on a single-statement migration;
4. multi-statement migration failures are never tolerated;
5. every other error is rethrown immediately and later migrations do not run.

The executable-schema readiness gate remains in place as defense in depth. Migration execution and runtime readiness are therefore two independent fail-closed boundaries.

### 2. Keep the executable-schema readiness gate

`assertDatabaseReady(client)` runs after DB bootstrap/migrations and before seed, HTTP bind, or background workers. It verifies:

- the complete intentional migration manifest;
- tenant/data-integrity unique indexes and column order;
- required integrity triggers;
- important migrated columns;
- critical composite primary keys `(parish_id, id)`;
- `PRAGMA foreign_key_check` has no violations.

A migration marker alone is not sufficient evidence that the executable schema is safe.

### 3. Make Finance writes atomic

`FinanceApplicationService.ts` owns `createFund`, `createTransaction`, `deleteTransaction`, and `updateStudentFee`. All use `runDbTransaction()`.

`updateStudentFee()` uses `createTransactionInTx()` so payment validation, receipt allocation, ledger insert, transaction audit, fee upsert and fee audit all use the same transaction handle. `financeService.ts` keeps query functions and backward-compatible command re-exports so callers cannot bypass the atomic implementation.

### 4. Make initial bootstrap all-or-nothing and fail closed

`seed()` now executes all seed writes inside one `runDbTransaction()` transaction. If any branch/year/class/admin/settings/permission/role-permission write fails, none of the bootstrap rows commit.

`seedIfEmpty()` no longer swallows an unexpected read failure. In `server/src/index.ts`, seed failure is rethrown before `serve()` or workers start.

This eliminates the state where a partial seed creates the first user and permanently suppresses the rest of bootstrap.

### 5. Remove the default bootstrap-admin credential

Fresh initialization requires an explicit `SEED_ADMIN_PASSWORD`. There is no password fallback.

`requireSeedAdminPassword()` enforces the same baseline as the strong-password contract: 8–128 characters with at least one uppercase letter, one digit and one special character. An empty/weak value causes fresh bootstrap to fail closed.

Existing databases are unaffected because `seedIfEmpty()` returns before invoking `seed()` when a user already exists. Re-running `seed()` still uses `onConflictDoNothing()` for the admin and cannot overwrite an existing password.

### 6. Make account lifecycle state transitions atomic

Security-sensitive user commands now use `runDbTransaction()`:

- create user → user row + class assignments + audit;
- lock user → status/tokenVersion + refresh-session revocation + audit;
- reset password → password/status/tokenVersion + refresh-session revocation + audit;
- force logout → tokenVersion + refresh-session revocation + audit;
- update phone → account mutation + audit;
- update class assignments → assignment replacement + audit.

`refreshSessionService.ts` exposes a transaction-aware `revokeAllSessionsWith(executor, ...)` primitive so application services can reuse the current transaction instead of opening a second write boundary. Refresh-token reuse containment also commits the tokenVersion bump and revoke-all together.

The bulk parent-provision flow remains an intentional itemized partial-success workflow; its per-item semantics are not converted to all-or-nothing by this ADR.

## Transaction invariants

### Collect student fee

```text
validate tenant/student/class/fund
        ↓
allocate receipt
        ↓
ledger + transaction audit
        ↓
fee record + fee audit
        ↓
COMMIT
```

### Create account

```text
insert user
    ↓
insert requested class assignments
    ↓
insert audit
    ↓
COMMIT
```

An invalid class FK or audit failure rolls the user insert back.

### Force logout / lock / reset

```text
mutate user security state
        ↓
revoke refresh sessions
        ↓
insert audit
        ↓
COMMIT
```

No half-applied containment state may commit.

## Compatibility gate

- Public Finance/User HTTP contracts: **PASS — unchanged**.
- Database schema: **PASS — unchanged; no new migration**.
- Existing initialized deployments: **PASS — seed password is only consulted when explicit `seed()` runs or DB is empty**.
- Tenant isolation: **PASS — command predicates and readiness checks remain parish-scoped**.
- ADR-011 transaction ownership: **PASS**.
- Rollback: **code-only**.

## D3 hard gates

| Gate | Result | Evidence |
|---|---|---|
| Security | PASS | Default privileged credential removed; lock/reset/logout session revocation is atomic. |
| Privacy | PASS | No new personal-data collection or logging. |
| Data Integrity | PASS | Finance, bootstrap and account state transitions have explicit transaction boundaries; migration/bootstrap fail closed. |
| Tenant Isolation | PASS | Parish scope preserved and schema readiness verifies tenant-critical guards. |
| Reversibility | PASS | No schema migration; rollback is code-only. |

## Regression coverage

- `financeService.test.ts`: later fee-write failure leaves no orphan ledger/fee/audit rows.
- `schemaHealth.test.ts`: healthy manifest passes; missing migration/index/trigger fails closed.
- `migrationRunner.test.ts`: non-tolerable error aborts immediately and is not marked; single duplicate recovery remains; multi-statement failure is never tolerated.
- `seedAdminPassword.test.ts`: missing/weak bootstrap password is rejected and a strong explicit password is accepted.
- `userLifecycleAtomicity.test.ts`: invalid class assignment rolls a newly inserted user back; force logout bumps tokenVersion and revokes refresh sessions.
- Existing Finance tenant-isolation and auth suites continue to exercise public behavior.

Repository-standard ESLint, client/server TypeScript, full Vitest and production build are required before the PR is ready for review.

## Operational impact

Startup now deliberately fails when any of these conditions occur:

- a non-tolerable migration fails;
- executable schema readiness fails;
- a fresh database has no valid `SEED_ADMIN_PASSWORD`;
- atomic seed execution fails.

For a fresh deployment, provision `SEED_ADMIN_PASSWORD` before first startup. Do not bypass a failed migration/readiness/seed gate to recover availability; repair the underlying database/configuration or restore a known-good snapshot.

## Rollback

**Reversibility:** R1/R2 code rollback; no destructive migration was introduced by this remediation.

A rollback is appropriate only for a verified false-positive/regression in the new guards. A real schema, security or data-integrity failure must be repaired rather than bypassed.
