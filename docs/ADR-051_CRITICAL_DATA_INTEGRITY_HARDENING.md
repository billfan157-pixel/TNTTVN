# ADR-051: Critical Data-Integrity Hardening — Fail-Closed Schema Startup & Atomic Finance Commands

> Status: **APPROVED / IMPLEMENTED**  
> Date: 2026-08-21  
> Severity: **D3 — Critical**  
> Profile: **ARCHITECTURE / INFRASTRUCTURE + DATA INTEGRITY**

## Context

Architecture audit 2026-08-21 found two independently reproducible D3 failure windows.

### Finding A — migration execution could fail open

`server/src/db/index.ts` runs bootstrap DDL and versioned migrations during module initialization. For non-tolerable migration failures, the runner can log `Migration failed: <version>` and continue initialization. Defensive index/trigger creation also contains tolerant paths.

This means the absence of a thrown migration error is not sufficient evidence that the executable database schema matches the current tenant/data-integrity contract.

**Classification:** `CONFIRMED`, confidence `HIGH`, evidence `E3`.

### Finding B — finance commands had split transaction boundaries

The previous `financeService.ts` implementation executed financial business mutations and their audit trail as separate database statements without one enclosing transaction. In particular, `updateStudentFee()` could create an `INCOME` ledger transaction first and only afterwards write `student_fee_records`.

A later fee-record or audit failure could therefore leave a committed financial transaction without the matching fee state. `deleteTransaction()` similarly separated ledger deletion, fee reset, and audit insertion.

**Classification:** `CONFIRMED`, confidence `HIGH`, evidence `E3`.

## Existing constraints

- ADR-011 requires Application Services to own transaction boundaries.
- ADR-031 / subsequent tenant hardening require tenant-local keys and composite identifiers to remain enforced by the executable schema.
- Public Finance HTTP contracts and database schema must remain backward compatible in this remediation.
- No migration is introduced by this fix; the goal is to enforce already-approved schema and business invariants.

## Decision

### 1. Add a fail-closed executable-schema readiness gate

Create `server/src/db/schemaHealth.ts` and call `assertDatabaseReady(client)` in `server/src/index.ts` **after DB initialization/migrations but before seeding, `serve()`, or background workers**.

The gate verifies:

1. **the complete intentional migration manifest** represented by `MIGRATIONS` in `db/index.ts` — including historical migrations, while excluding only version numbers intentionally absent from source (`020`, `030`, `036`, `046`);
2. tenant/data-integrity unique indexes and their required column order;
3. required integrity triggers for grade range, outbox status, and grade-override field validation;
4. important columns introduced by migrations, including import, auth, notification, ethics-score and exam evolution;
5. composite primary-key shape `(parish_id, id)` for critical tenant and Finance tables;
6. `PRAGMA foreign_key_check` returns no violations.

A migration that is logged-and-continued without recording its marker is therefore still a startup-blocking failure. A marker alone is also insufficient for key invariants: indexes, triggers, columns and primary-key shape are independently verified against the executable schema.

Any mismatch throws and aborts server startup. An unhealthy/partially migrated database is unavailable rather than writable.

This is a defense-in-depth boundary around the existing migration runner: **runtime schema readiness**, not log output, is the authority for whether the application may serve traffic.

### 2. Make Finance writes Application-Service-owned and atomic

Create `server/src/services/FinanceApplicationService.ts` as the sole implementation for Finance commands:

- `createFund()`
- `createTransaction()`
- `deleteTransaction()`
- `updateStudentFee()`

Each command uses `runDbTransaction()` from `db/index.ts`.

`updateStudentFee()` uses an internal `createTransactionInTx()` helper so payment ledger creation does **not** start a nested transaction. Validation, receipt allocation, ledger write, fee write, and audit entries share the same transaction handle.

`financeService.ts` retains query/read-model functions and backward-compatible re-exports of command functions from `FinanceApplicationService`; the previous non-atomic write implementations are removed so an old import path cannot bypass the ACID boundary.

The HTTP route keeps the same request/response contract and delegates write operations to `FinanceApplicationService`.

## Transaction invariants after the change

### Collect student fee

```text
validate tenant/student/class/fund
        ↓
allocate receipt number
        ↓
INSERT financial_transactions
        ↓
INSERT transaction audit
        ↓
UPSERT student_fee_records
        ↓
INSERT fee audit
        ↓
COMMIT
```

Any failure before `COMMIT` rolls back every preceding mutation.

### Delete transaction

```text
load tenant-scoped transaction
        ↓
DELETE financial_transactions
        ↓
RESET linked student_fee_records
        ↓
INSERT delete audit
        ↓
COMMIT
```

The ledger, fee state, and audit lineage cannot commit independently.

## Compatibility gate

- API contract: **PASS — unchanged**.
- Database schema: **PASS — unchanged**.
- Tenant isolation: **PASS — validation remains parish-scoped and schema readiness explicitly checks tenant-critical indexes/PKs**.
- ADR-011 transaction ownership: **PASS — Finance command transactions live in an Application Service**.
- Existing read/query semantics: **PASS — `financeService.ts` continues to expose prior read functions and backward-compatible command exports**.

## D3 hard gates

| Gate | Result | Evidence |
|---|---|---|
| Security | PASS | No new externally reachable surface; startup gate only reduces unsafe availability. |
| Privacy | PASS | No new personal data collection/storage/logging. |
| Data Integrity | PASS | Finance mutations are atomic; incomplete migration/schema state cannot serve traffic. |
| Tenant Isolation | PASS | Readiness gate checks tenant-critical indexes/composite PKs; command validation remains parish-scoped. |
| Reversibility | PASS | No schema migration; rollback is code-only. |

## Verification

Regression coverage added:

- `server/src/__tests__/financeService.test.ts`: deliberately causes a fee write to fail **after** the payment-ledger path has begun, then verifies there is no orphan `financial_transactions`, no partial `student_fee_records`, and no leaked audit row.
- `server/src/__tests__/schemaHealth.test.ts`: verifies a healthy full-manifest schema snapshot passes; a missing historical migration marker or tenant index fails; a missing required integrity trigger fails.
- Existing `financeTenantIsolation.test.ts` now exercises the atomic command implementation.

CI must run repository-standard lint, client/server TypeScript checks, full Vitest suite, and build before this ADR is considered fully verified.

## Operational impact

The startup policy deliberately favors integrity over availability. If production contains an unapplied migration, malformed tenant/index guard, missing required column/trigger, wrong composite PK, or FK violation, the release will fail health/startup rather than continue accepting writes.

Operational response is to repair/complete the database migration or restore a known-good snapshot; bypassing the readiness gate is not an approved recovery mechanism.

## Rollback

**Reversibility:** R1/R2 code rollback; no destructive migration was added.

- Finance rollback: revert `FinanceApplicationService` routing/re-export changes.
- Startup-gate rollback: revert the entrypoint call and `schemaHealth.ts`.

Rollback must only be used for a verified false-positive in the new guard. A real schema-integrity failure must be repaired, not bypassed.
