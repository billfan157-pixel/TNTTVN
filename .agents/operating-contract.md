# Repository-Wide Operating Contract — Catevia / TNTTVN

> Parent: root `AGENTS.md`
> Scope: the per-task contract every agent follows, plus its
> implementation, verification, documentation, delivery, and precedence rules.
> Sibling branches: `task-classification.md`, `skill-router.md`,
> `protected-invariants.md`, `context-router.md`.

For every task:

1. Understand the requested behavior and scope.
2. Classify the task as D0, D1, D2, or D3 (`task-classification.md`).
3. Load only the skills and repository context required for that task
   (`skill-router.md`, `context-router.md`).
4. Inspect relevant current implementation before making material claims or edits.
5. Preserve protected Catevia invariants (`protected-invariants.md`) unless an
   explicit approved requirement intentionally changes one.
6. Make the minimum sufficient change (§1.1).
7. Verify claims against the final change state (§1.2).
8. Update authoritative documentation only when the truth owned by that document changed
   (§1.3).
9. Report evidence, unresolved uncertainty, failures, and residual risk accurately
   (§1.4).

Never:

- treat documentation alone as proof of runtime behavior;
- represent inference as verified fact;
- treat frontend state as an authorization boundary;
- silently expand implementation beyond the investigated blast radius;
- weaken tests merely to obtain green output.

Contract phases are executed by skills (`skill-router.md`):

```text
operating contract
├── current-truth      → WHAT DOES THE SYSTEM CURRENTLY DO?
├── change-impact      → CURRENT → TARGET → PLAN
├── verification       → CLAIM → EVIDENCE → STATUS
└── quantitative-targets (only when a decision depends on numbers)
```

## 1.1 Implementation Discipline

For implementation work:

- make the minimum sufficient change;
- preserve established authoritative writers where their contracts remain valid;
- avoid unrelated cleanup;
- avoid speculative architecture rewrites;
- do not create a second writer for the same business fact;
- do not introduce new infrastructure merely because it appears cleaner;
- do not change public contracts unintentionally.

For refactoring:

```text
observable behavior intended unchanged
→ prove it remains unchanged
```

For new behavior:

```text
behavior intentionally changes
→ treat it as a behavior change
```

Do not disguise new behavior as refactoring.

## 1.2 Verification Contract

Verification must prove the claim being made.

Before selecting commands, inspect current:

- `package.json`;
- relevant workspace package files;
- `.github/workflows/ci.yml`;
- affected tests.

The repository's current scripts and CI configuration are authoritative for
available gates.

Prefer:

```text
focused claim-specific proof
+
applicable broader repository gates
```

rather than blindly running every suite.

D3 changes require applicable critical-invariant verification.

Use E2E only when the claim depends on a real cross-layer workflow.

Never:

- hide a relevant failure;
- delete/weaken a relevant test to obtain green output;
- call a historical green run current verification;
- treat an unrelated pre-existing failure as caused by the current change;
- waive a required repository gate merely because a focused test passed.

Detailed methodology belongs to catevia-verification.

## 1.3 Documentation Synchronization

Documentation updates are truth-based, not change-count-based.

Update a document only when the truth it owns changes.

Examples:

```text
business behavior
→ BUSINESS_RULES

architecture boundary
→ Architecture / ADR

public API contract
→ FRONTEND_API_CONTRACT

schema/data contract
→ database SSOT

security boundary
→ security SSOT

testing strategy
→ E2E/testing strategy
```

Do not append implementation-history noise to normative documents.

When code and an authoritative document disagree:

```text
determine whether this is implementation drift
or an intentional requirement change
→ update the correct side
```

## 1.4 Delivery Contract

For implementation work, report:

- what changed;
- why;
- material invariants considered;
- verification actually run;
- applicable repository-gate status;
- documentation changed, if any;
- unresolved or residual risk.

For audits/research, report according to catevia-current-truth and distinguish:

- verified findings;
- normative requirements;
- drift;
- conditional findings;
- hypotheses;
- unknowns.

For planning, use the catevia-change-impact output contract.

For verification, use the catevia-verification completion status.

Never inflate certainty to make the result appear complete.

## 1.5 Instruction Precedence and Scope

Direct system/developer/user instructions take precedence over repository
guidance.

Within the repository:

```text
more-specific AGENTS.md
→ applies to its directory scope
→ overrides broader repository guidance where compatible
```

Repository rules/skills refine this root contract for their relevant domain.

Skills do not override explicit approved product requirements.

Keep the root AGENTS.md:

- small
- stable
- repository-wide
- high-signal

Move detailed methodology and domain-specific rules into skills, scoped rules,
or authoritative documentation instead of growing the entry file indefinitely.

## 1.6 Product Decision Authority

"Product decision authority" means the source authorized to decide intended
Catevia behavior. Subject to the instruction precedence above, it may be:

- an explicit current user/product-owner requirement;
- an already-approved current normative business rule;
- an applicable current ADR or other repository-owned normative decision.

It does **not** require a separate human reviewer, product manager, or
organizational role from the person requesting the work.

Agents may investigate current behavior, surface trade-offs, and recommend a
design. They must not self-authorize a material change to a protected invariant
when intended product behavior remains unresolved.

When a skill marks a decision `BLOCKING`, that means the affected
implementation branch requires product decision authority before it can proceed
safely. It does not mean a separate reviewer must exist.

Keep decision authority separate from verification:

```text
product decision authority
→ defines WHAT behavior is intended

verification
→ proves WHETHER the implementation satisfies that behavior
```

A product-authorized decision does not waive fresh verification, and passing
tests do not create product authority for an otherwise unresolved requirement.
