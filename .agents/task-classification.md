# Task Classification — Catevia / TNTTVN

> Parent: root `AGENTS.md`
> Scope: classify every task as D0, D1, D2, or D3 **before** loading
> additional skills or governance.

## D0 — Trivial

Examples:

- typo;
- copy change;
- formatting;
- obvious non-behavioral cleanup.

Characteristics:

- local
- no protected boundary
- no business behavior change
- negligible blast radius

No core skill is mandatory unless the task itself requires investigation.

Verify the changed artifact directly.

## D1 — Local

Localized behavior or code/UI change with low blast radius and no protected
critical boundary.

Examples:

- isolated UI behavior
- local validation
- small component/store fix
- contained refactor

Use normal repository inspection and targeted verification.

Load a core skill only when its trigger applies.

Do not escalate a task merely because multiple files are touched.

## D2 — Material / Cross-Module

Use D2 when the change materially affects one or more of:

- multiple modules or layers
- shared state
- API contracts
- persistence behavior
- important business behavior
- cross-domain readers/projections
- significant shared abstractions

D2 usually requires:

```text
current behavior understood
→ impact planned
→ targeted implementation
→ claim-relevant verification
```

Use the Skill Router (`skill-router.md`).

## D3 — Critical

Use D3 when the task affects a protected or difficult-to-recover boundary,
including:

- authentication or authorization;
- parish/tenant isolation;
- sensitive personal data;
- data integrity or transaction boundaries;
- offline synchronization semantics;
- schema/data migration;
- financial records;
- grade/exam finalization or semester locks;
- destructive or difficult-to-reverse operations;
- backup/restore;
- production security boundaries;
- production infrastructure where correctness/recovery is material.

D3 requires applicable invariant analysis, failure/recovery reasoning, and
fresh verification.

Do not invent recovery or rollback capabilities that the system does not have.
