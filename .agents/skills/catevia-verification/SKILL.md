---
name: catevia-verification
description: >
  Verify Catevia/TNTTVN work before claiming that a bug is fixed, a feature is
  complete, an invariant is preserved, tests pass, or a plan has been fully
  implemented. Use after implementation, before completion/commit/PR claims,
  after delegated agent work, and whenever a current PASS or correctness claim
  is made. Map each claim to fresh evidence, run the smallest sufficient
  applicable verification, enforce applicable repository gates, and report
  partial, blocked, or failed evidence accurately.
version: 3.0
---

# Catevia Verification

## Purpose

Make completion claims evidence-based.

Verification answers:

```text
What exactly are we claiming?
What evidence directly proves that claim?
Was that evidence run against the current change state?
Which repository gates also apply?
What did the evidence actually show?
```

Do not claim completion from confidence, partial evidence, or stale results.

## Core Law

> **NO SUCCESS CLAIM WITHOUT FRESH, CLAIM-RELEVANT EVIDENCE.**

Therefore:

- confidence is not evidence;
- historical green CI is not current verification;
- build success does not prove authorization correctness;
- unit tests do not prove a cross-layer workflow;
- E2E does not prove every state-space combination;
- a subagent saying "done" is not verification;
- evidence becomes stale when later changes can affect the claim it proved.

---

## 1. Inventory the Claims

Before running verification, list the material claims the work intends to make.

If a catevia-change-impact plan exists, start from its:

```text
claim → evidence
```

mapping.

Do not recreate the list from scratch unless the plan is incomplete.

You may add a missing claim.

Do not silently remove a planned claim. If it no longer applies, record why.

Typical claims:

- the original bug no longer reproduces;
- authorized actors succeed;
- unauthorized actors are denied;
- a transaction remains atomic;
- retries do not duplicate a logical effect;
- offline mutations converge correctly;
- required UX/design-system behavior is preserved;
- the build compiles;
- every material user requirement is implemented.

If tooling or time prevents full verification, prioritize:

```text
security
tenant/parish isolation
data integrity
protected invariants
irreversible or difficult-to-recover behavior
```

Unverified material claims must remain `NOT_TESTED`, `BLOCKED`, or `UNKNOWN`.

---

## 2. Inspect Current Verification Contracts

Before selecting commands, inspect the current repository contracts relevant to
the change:

- `package.json`
- `server/package.json` when relevant
- `.github/workflows/ci.yml`
- affected tests
- `docs/08_E2E_TESTING_STRATEGY.md` when E2E may be required

Commands and gates evolve.

Do not rely on remembered scripts when current repository evidence is available.

---

## 3. Distinguish Claim Proof from Repository Gates

Keep these separate.

### Claim-specific proof

Evidence that directly proves a behavior.

Example:

```text
wrong-scope actor with valid payload
→ server denies access
```

### Repository gate

A broader required check for merge/release confidence.

Example:

```text
security regression gate
build
coverage suite
design-system guard
critical E2E
```

A repository gate passing does not automatically prove a specific bug was fixed.

A focused regression test passing does not automatically satisfy required
repository gates.

Completion evidence is:

```text
CLAIM-SPECIFIC PROOF
+
APPLICABLE REPOSITORY GATES
```

---

## 4. Choose the Lowest Sufficient Evidence

Prefer the smallest evidence layer that directly proves the claim.

- Pure logic → focused unit test.
- Server policy / authorization / transaction → focused integration or
  security test using real policy/database behavior where practical.
- Client state → focused store/component test.
- Cross-layer workflow → E2E only when the claim depends on multiple real
  boundaries.
- Performance / accuracy / capacity → reproducible benchmark; load
  quantitative-targets when a numerical target matters.
- Migration / recovery → migration, preflight, audit, or recovery evidence.
- Design System / accessibility → applicable static guard plus targeted
  runtime evidence when the claim requires it.

Do not use a broader test merely because it looks stronger.

Use the evidence that most directly proves the claim.

---

## 5. Verify the Original Failure

For bug fixes:

1. Identify or reproduce the original failing condition.
2. Run the regression test against the fix.
3. Confirm the expected behavior.
4. Check the material alternate/negative path.

When practical, prove that the regression test would fail without the fix.

A test that always passed does not demonstrate protection against the regression.

If the bug investigation identified a root cause, the regression test should
encode that failure mode rather than merely exercise the same endpoint or
component.

---

## 6. Verify Outcome-Defining Branches

For a guarded boundary, verify the branches that define the invariant.

### Authorization / scope

Usually verify:

```text
authorized actor → succeeds
unauthorized actor → denied
```

Denial tests must use otherwise-valid requests.

Malformed input returning an error does not prove authorization enforcement.

### Idempotency

Verify the command's defined replay contract, not merely response equality.

Where applicable check:

- first execution;
- permitted replay;
- mismatched key/payload reuse;
- no duplicate logical side effect.

### Conflict resolution

Verify the material policy branches that can change the outcome.

Examples may include:

- local write accepted;
- server state wins;
- conflict surfaced;
- retry/reconciliation path.

Do not force every invariant into a binary "both sides" model.

Verify the branches that actually define the contract.

---

## 7. D-Level Verification

Follow root `AGENTS.md`.

### D0

Verify the changed artifact directly.

### D1

Run targeted checks for the changed behavior plus applicable static/type/build
checks.

### D2

Run:

```text
targeted behavior proof
+
affected contract/integration checks
+
applicable static/type/build gates
```

### D3

Additionally run applicable:

```text
security
tenant isolation
data-integrity
sync/convergence
migration/recovery
critical invariant
```

verification.

Use E2E when the completion claim genuinely depends on a real end-to-end
workflow.

Do not run the full repository suite as ritual if it does not strengthen the
claim.

---

## 8. Bind Evidence to the Current Change State

For every verification result capture:

- Command
- Scope
- Exit status
- Pass/fail result
- Relevant output
- Environment/conditions
- Change state

Change state means the actual source state tested, including uncommitted
working-tree changes.

Any later modification that can affect a verified claim invalidates that
claim's previous evidence.

Example:

```text
authorization test → PASS
↓
authorization policy edited
↓
previous PASS is stale
```

Re-run affected verification before making the claim again.

---

## 9. Classify Failures Correctly

Separate failure ownership from failure characteristics.

### Failure Ownership

```text
CAUSED_BY_CHANGE
PRE_EXISTING
ENVIRONMENTAL
UNKNOWN
```

### Failure Characteristics

Use only when relevant:

```text
DETERMINISTIC
NON_DETERMINISTIC
TIMING_SENSITIVE
FLAKY_ENVIRONMENT
```

These are different axes.

Example:

```text
Ownership: PRE_EXISTING
Characteristic: NON_DETERMINISTIC
```

Do not average flaky/non-deterministic runs into a PASS.

If invariant-protecting behavior is non-deterministic, treat that as a finding.

### Pre-existing failures

A pre-existing failure does not automatically invalidate unrelated
claim-specific proof.

But it also does not waive a required repository gate.

Keep separate:

```text
Behavior Claim Status
Repository Gate Status
```

Do not report the overall work as fully verified while a required gate remains
failed or blocked.

---

## 10. Requirement Convergence

Tests do not prove that every requested requirement was implemented.

Re-read:

- user requirement;
- current normative truth;
- approved plan/spec if present;
- current diff.

For every material requirement assign:

```text
VERIFIED
PARTIAL
FAILED
NOT_TESTED
NOT_APPLICABLE
```

If verification reveals that the implementation is wrong:

```text
fix implementation
→ verify again
```

If verification reveals that the plan itself was based on a wrong assumption:

```text
handoff → catevia-change-impact
```

If the underlying current-state model was wrong:

```text
handoff → catevia-current-truth
```

Do not keep patching implementation against a broken plan.

---

## 11. Documentation Verification

If documentation changed, verify that:

- the document actually owns the changed truth;
- the statement matches the approved requirement or current implementation as
  appropriate;
- historical evidence is not presented as current runtime truth;
- superseded/contradictory claims are handled correctly.

Editing a documentation file does not prove documentation is synchronized.

---

## 12. Delegated Work

Never accept a subagent's completion claim as evidence.

For delegated work:

```text
subagent result
→ inspect actual changes
→ run independent verification
→ classify evidence
```

Security, tenancy, data integrity, sync, migration, finance, finalized academic
state, and other protected-invariant claims require full independent
verification.

Sampling may be used only for repetitive/mechanical consistency checks.

Sampling cannot upgrade untested behavioral claims to `VERIFIED`.

---

## Completion Status

Use one final status:

```text
VERIFIED
```

All material claims have sufficient fresh evidence and applicable repository
gates are satisfied.

```text
VERIFIED_WITH_RESIDUAL_RISK
```

All required claims are verified, but explicitly identified manual, device,
field, production, or external gates remain.

```text
PARTIAL
```

Some material requirements or claims remain unverified.

```text
FAILED
```

Evidence demonstrates that a required behavior is incorrect.

```text
BLOCKED
```

Required verification cannot currently be completed because of an external,
environmental, tooling, or repository-gate blocker.

```text
UNKNOWN
```

Evidence is insufficient to classify the work reliably.

---

## Verification Report Contract

### Scope Verified

Revision / working-tree state and affected change.

### Claim Matrix

| Claim | Evidence | Change State | Result |
|-------|----------|--------------|--------|

### Repository Gates

Applicable gates and their results.

### Regression Evidence

Original failure and regression verification where applicable.

### Invariant Evidence

Applicable security, tenancy, data, sync, finance, academic, migration, or other
protected-boundary evidence.

### Requirement Convergence

Requirement-by-requirement status.

### Failures / Gaps

Include:

- failure ownership;
- failure characteristic when relevant;
- `NOT_TESTED` claims;
- environmental blockers;
- failed repository gates.

### Delegated Work

State how delegated claims were independently verified.

### Residual Risk

Manual/device/field/production/untested-state-space risk.

### Final Status

One Completion Status value.

---

## Forbidden Completion Patterns

Do not say:

```text
should work
looks fixed
all good
tests pass
fully implemented
production ready
safe
```

unless the evidence supports that exact scope.

Do not infer:

```text
lint pass → build pass
build pass → tests pass
unit pass → E2E pass
E2E pass → every invariant proven
historical green CI → current work verified
subagent says done → work verified
one passing run → behavior is deterministic
focused test pass → repository gates pass
repository gates pass → original bug is fixed
```

Verify each claim independently.
