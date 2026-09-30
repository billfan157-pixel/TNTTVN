# Protected Catevia Invariants — Catevia / TNTTVN

> Parent: root `AGENTS.md`
> Scope: repository-wide protected boundaries. An intentional change to any
> invariant below requires explicit product decision authority as defined in
> `operating-contract.md` §1.6.

## Security and Tenancy

- Backend authorization is authoritative.
- Hidden UI/navigation is never an authorization boundary.
- Cross-parish access must fail closed.
- Role/class/resource scope must remain server-authoritative.
- Sensitive student, parent, and personnel data must be minimized in logs,
  errors, analytics, caches, and unrelated responses.

## Data Integrity

- No silent data loss.
- No silent partial success where atomicity is required.
- Preserve intended transaction boundaries.
- Preserve applicable idempotency and concurrency/OCC semantics.
- Finalized or locked academic/financial state must not be bypassable from the client.

## Offline / Synchronization

Do not simplify sync code without tracing its contract.

Preserve where applicable:

- durable mutation ownership;
- tenant/user scoping;
- temporary-ID → server-ID remapping;
- dependent mutation ordering;
- idempotency;
- retry behavior;
- conflict policy;
- OCC/version behavior;
- pull/reconciliation behavior.

Complexity protecting convergence or integrity is not automatically technical debt.

## Historical State

Do not reconstruct finalized historical facts from current mutable state when the
domain owns snapshots, finalized records, or historical evidence.

## UI / Design System

For frontend work, follow:

```text
.agents/rules/ui-design-system.md
```

and the current Design System documentation.

Do not duplicate Design System constants or component rules here.

## Business Behavior

Do not infer intended business rules solely from implementation.

When intended behavior is material or unclear, retrieve the applicable approved
business rule and ADR.
